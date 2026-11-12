"""Migración 0004: bitácora de respaldos y controles de auditoría de la base de datos.

La tabla `respaldos_bd` se crea en cualquier motor. Lo demás es exclusivo de PostgreSQL y no necesita
extensiones ni superusuario (usa `sha256()` nativo, PostgreSQL 11 o posterior):
- restricciones CHECK (con NOT VALID: se aplican a los datos nuevos sin rechazar los que ya existen) y DEFAULT;
- clasificación de la información, cuotas, cambios de emergencia y revisiones de bitácora;
- trigger que registra cada INSERT, UPDATE y DELETE de las tablas sensibles, sin la contraseña;
- 5 vistas: catálogo con disponibilidad, pedidos, clientes enmascarados, bitácora y tamaño de tablas.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0004_controles_bd"
down_revision: str | None = "0003_tienda_en_linea"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSONVariant = sa.JSON().with_variant(JSONB(), "postgresql")

CHECKS: tuple[tuple[str, str, str], ...] = (
    ("variantes", "chk_variantes_precio_positivo", "precio > 0"),
    ("inventario", "chk_inventario_disponible_no_negativo", "cantidad_disponible >= 0"),
    ("inventario", "chk_inventario_reservada_no_negativo", "cantidad_reservada >= 0"),
    ("item_carrito", "chk_item_carrito_cantidad_positiva", "cantidad > 0"),
    ("pedidos", "chk_pedidos_total_no_negativo", "total >= 0"),
    ("item_pedido", "chk_item_pedido_valores_positivos", "cantidad > 0 AND precio_unitario_venta > 0 AND subtotal >= 0"),
    ("pagos", "chk_pagos_monto_positivo", "monto > 0"),
    ("envios", "chk_envios_costo_no_negativo", "costo >= 0"),
    ("direcciones", "chk_direcciones_cp_longitud", "char_length(codigo_postal) >= 5"),
    ("usuarios", "chk_usuarios_tipo_valido", "tipo_usuario IN ('cliente', 'admin', 'staff')"),
)

DEFAULTS: tuple[tuple[str, str, str], ...] = (
    ("usuarios", "tipo_usuario", "'cliente'"),
    ("usuarios", "fecha_registro", "CURRENT_TIMESTAMP"),
    ("administradores", "rol", "'superadmin'"),
    ("direcciones", "es_predeterminada", "false"),
    ("inventario", "cantidad_disponible", "0"),
    ("inventario", "cantidad_reservada", "0"),
    ("carritos", "estado", "'activo'"),
    ("carritos", "fecha_creacion", "CURRENT_TIMESTAMP"),
    ("item_carrito", "cantidad", "1"),
    ("pedidos", "estado", "'pendiente_pago'"),
    ("pedidos", "fecha", "CURRENT_TIMESTAMP"),
    ("pagos", "estado", "'procesando'"),
    ("envios", "costo", "0.00"),
    ("envios", "estado", "'pendiente'"),
)

AUDITED_TABLES = ("usuarios", "administradores", "variantes", "inventario", "pedidos", "pagos", "envios")

# Qué guarda cada tabla y cómo se protege; lo consulta la vista de tamaño de tablas.
CLASSIFICATION: tuple[tuple[str, str, str, str], ...] = (
    ("usuarios", "Confidencial", "Nombre, correo, teléfono y hash de contraseña", "Hash bcrypt; vista enmascarada"),
    ("clientes", "Confidencial", "Relación del usuario con sus pedidos y direcciones", "RBAC"),
    ("direcciones", "Confidencial", "Domicilios de entrega", "Vista enmascarada; CHECK del código postal"),
    ("pagos", "Restringido", "Referencia de la pasarela, sin número de tarjeta ni CVV", "PCI-DSS: el pago se hace en la pasarela"),
    ("pedidos", "Confidencial", "Folios, totales e historial", "Conciliación RQ-DAT-001; trigger de auditoría"),
    ("item_pedido", "Interno", "Productos del pedido con el precio de venta congelado", "CHECK de valores positivos"),
    ("inventario", "Interno", "Existencias y piezas apartadas por sucursal", "SELECT FOR UPDATE al apartar; trigger de auditoría"),
    ("productos", "Publico", "Catálogo", "Solo el admin escribe"),
    ("variantes", "Publico", "SKU, atributos y precio", "CHECK del precio; trigger de auditoría"),
    ("categorias", "Publico", "Árbol de departamentos", "Llaves foráneas"),
    ("sucursales", "Publico", "Tiendas, horarios y ubicación", "Llaves foráneas"),
    ("bitacora_auditoria", "Restringido", "Operaciones sensibles del negocio (AE-39)", "Solo lectura para el rol auditor"),
    ("auditoria_sentencias_bd", "Restringido", "Cambios fila por fila en tablas sensibles", "Huella SHA-256 por registro"),
    ("respaldos_bd", "Restringido", "Bitácora de respaldos cifrados", "Solo lectura para el rol auditor"),
)

AUDIT_FUNCTION = """
CREATE OR REPLACE FUNCTION fn_registrar_auditoria_sentencia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_query TEXT := COALESCE(current_query(), TG_OP || ' ON ' || TG_TABLE_NAME);
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old := to_jsonb(OLD) - 'password_hash';
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new := to_jsonb(NEW) - 'password_hash';
    END IF;
    INSERT INTO auditoria_sentencias_bd (
        fecha_hora, usuario_bd, rol_activo, direccion_ip, aplicacion, operacion,
        esquema_tabla, sentencia_sql, datos_anteriores, datos_nuevos, hash_integridad_sha256
    ) VALUES (
        clock_timestamp(), CURRENT_USER, SESSION_USER, host(inet_client_addr()),
        NULLIF(current_setting('application_name', true), ''), TG_OP,
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, left(v_query, 2000), v_old, v_new,
        encode(sha256(convert_to(
            clock_timestamp()::text || '|' || SESSION_USER || '|' || TG_OP || '|' || TG_TABLE_NAME || '|'
            || COALESCE(v_old::text, '') || '|' || COALESCE(v_new::text, ''), 'UTF8')), 'hex')
    );
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$
"""

VIEWS: tuple[tuple[str, str], ...] = (
    (
        "vw_catalogo_disponibilidad_5tablas",
        """
        SELECT p.id AS producto_id, p.nombre AS producto_nombre, COALESCE(p.marca, 'Genérico') AS marca,
               c.nombre AS categoria_nombre, v.sku AS variante_sku, v.precio AS precio_vigente,
               s.nombre AS sucursal_nombre, i.cantidad_disponible, i.cantidad_reservada,
               (i.cantidad_disponible - i.cantidad_reservada) AS stock_neto_venta
        FROM productos p
        JOIN categorias c ON c.id = p.categoria_id
        JOIN variantes v ON v.producto_id = p.id
        JOIN inventario i ON i.variante_sku = v.sku
        JOIN sucursales s ON s.id = i.sucursal_id
        """,
    ),
    (
        "vw_pedidos_consolidado_5tablas",
        r"""
        SELECT pe.id AS pedido_id, pe.folio AS pedido_folio, pe.fecha AS fecha_pedido, pe.estado AS estado_pedido,
               pe.total AS monto_total_pedido, u.nombre AS cliente_nombre,
               regexp_replace(u.email, '(^.{2}).*(@.*$)', '\1***\2') AS cliente_email_enmascarado,
               pa.metodo AS metodo_pago, pa.estado AS estado_pago, pa.referencia_pasarela,
               en.tipo AS modalidad_envio, en.estado AS estado_envio, en.numero_guia
        FROM pedidos pe
        JOIN clientes cl ON cl.usuario_id = pe.cliente_id
        JOIN usuarios u ON u.id = cl.usuario_id
        LEFT JOIN pagos pa ON pa.pedido_id = pe.id
        LEFT JOIN envios en ON en.pedido_id = pe.id
        """,
    ),
    (
        "vw_clientes_enmascarados_seguridad",
        r"""
        SELECT u.id AS usuario_id, u.nombre AS nombre_completo,
               regexp_replace(u.email, '(^.{2}).*(@.*$)', '\1***\2') AS email_protegido,
               u.tipo_usuario, u.fecha_registro, d.ciudad AS ciudad_entrega, d.codigo_postal
        FROM usuarios u
        LEFT JOIN clientes c ON c.usuario_id = u.id
        LEFT JOIN direcciones d ON d.cliente_id = c.usuario_id AND d.es_predeterminada = true
        """,
    ),
    (
        "vw_auditoria_trazabilidad_sentencias",
        """
        SELECT id AS registro_id, fecha_hora, usuario_bd, rol_activo, direccion_ip, aplicacion, operacion,
               esquema_tabla, left(sentencia_sql, 300) AS sentencia_sql_ejecutada, hash_integridad_sha256
        FROM auditoria_sentencias_bd
        """,
    ),
    (
        "vw_estado_fisico_tablespaces_y_cuotas",
        """
        SELECT t.schemaname AS esquema, t.tablename AS nombre_tabla,
               COALESCE(t.tablespace, 'pg_default') AS tablespace_asignado,
               pg_total_relation_size(format('%I.%I', t.schemaname, t.tablename)) AS tamano_bytes,
               cl.nivel_sensibilidad AS clasificacion_datos, cu.cuota_maxima_mb,
               ROUND(100.0 * pg_total_relation_size(format('%I.%I', t.schemaname, t.tablename))
                     / (cu.cuota_maxima_mb * 1024 * 1024), 2) AS porcentaje_de_cuota
        FROM pg_tables t
        LEFT JOIN clasificacion_informacion_bd cl ON cl.nombre_tabla = t.tablename
        LEFT JOIN cuotas_almacenamiento_bd cu ON cu.esquema_o_rol = t.schemaname
        WHERE t.schemaname = 'public'
        """,
    ),
)


def _create_backup_log() -> None:
    op.create_table(
        "respaldos_bd",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("solicitado_por", sa.String(length=64), nullable=True),
        sa.Column("motor", sa.String(length=30), nullable=False),
        sa.Column("algoritmo", sa.String(length=40), nullable=False),
        sa.Column("huella_llave", sa.String(length=16), nullable=False),
        sa.Column("tamano_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("tablas", sa.Integer(), nullable=False),
        sa.Column("filas", sa.Integer(), nullable=False),
        sa.Column("copias", JSONVariant, nullable=False),
        sa.Column("restauracion_verificada", sa.Boolean(), nullable=False),
        sa.Column("detalle", sa.Text(), nullable=True),
    )


def _create_governance_tables() -> None:
    op.create_table(
        "clasificacion_informacion_bd",
        sa.Column("nombre_tabla", sa.String(length=100), primary_key=True),
        sa.Column("nivel_sensibilidad", sa.String(length=20), nullable=False),
        sa.Column("datos_contenidos", sa.Text(), nullable=False),
        sa.Column("mecanismo_proteccion", sa.String(length=150), nullable=False),
        sa.CheckConstraint(
            "nivel_sensibilidad IN ('Publico', 'Interno', 'Confidencial', 'Restringido')",
            name="chk_clasificacion_nivel",
        ),
    )
    op.create_table(
        "cuotas_almacenamiento_bd",
        sa.Column("esquema_o_rol", sa.String(length=100), primary_key=True),
        sa.Column("cuota_maxima_mb", sa.Numeric(10, 2), nullable=False),
        sa.Column("umbral_alerta_porcentaje", sa.Integer(), nullable=False, server_default="80"),
        sa.CheckConstraint("cuota_maxima_mb > 0", name="chk_cuota_positiva"),
        sa.CheckConstraint("umbral_alerta_porcentaje BETWEEN 10 AND 100", name="chk_cuota_umbral"),
    )
    # Cambios de emergencia y revisiones de bitácora los registra una persona: no tienen valores supuestos.
    op.create_table(
        "control_cambios_emergencia_bd",
        sa.Column("folio_cambio", sa.String(length=40), primary_key=True),
        sa.Column("fecha_solicitud", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("tipo_emergencia", sa.String(length=60), nullable=False),
        sa.Column("objeto_bd_afectado", sa.String(length=150), nullable=False),
        sa.Column("justificacion_tecnica", sa.Text(), nullable=False),
        sa.Column("autorizado_por", sa.String(length=120), nullable=False),
        sa.Column("reflejado_en_modelo_logico", sa.Boolean(), nullable=False),
        sa.Column("estado", sa.String(length=30), nullable=False),
        sa.CheckConstraint(
            "estado IN ('SOLICITADO', 'APLICADO', 'REVERTIDO')", name="chk_cambio_emergencia_estado"
        ),
    )
    op.create_table(
        "revisiones_periodicas_logs_bd",
        sa.Column("folio_revision", sa.String(length=40), primary_key=True),
        sa.Column("fecha_revision", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("auditor_revisor", sa.String(length=120), nullable=False),
        sa.Column("registros_sentencias_revisados", sa.Integer(), nullable=False),
        sa.Column("anomalias_detectadas", sa.Integer(), nullable=False),
        sa.Column("ruta_resguardo_externo", sa.String(length=300), nullable=True),
        sa.Column("dictamen", sa.String(length=20), nullable=False),
        sa.CheckConstraint("registros_sentencias_revisados >= 0 AND anomalias_detectadas >= 0", name="chk_revision_conteos"),
        sa.CheckConstraint(
            "dictamen IN ('CONFORME', 'CON_OBSERVACIONES', 'NO_CONFORME')", name="chk_revision_dictamen"
        ),
    )
    op.create_table(
        "auditoria_sentencias_bd",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("fecha_hora", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("usuario_bd", sa.String(length=100), nullable=False),
        sa.Column("rol_activo", sa.String(length=100), nullable=False),
        sa.Column("direccion_ip", sa.String(length=64), nullable=True),
        sa.Column("aplicacion", sa.String(length=120), nullable=True),
        sa.Column("operacion", sa.String(length=10), nullable=False),
        sa.Column("esquema_tabla", sa.String(length=120), nullable=False),
        sa.Column("sentencia_sql", sa.Text(), nullable=False),
        sa.Column("datos_anteriores", JSONB(), nullable=True),
        sa.Column("datos_nuevos", JSONB(), nullable=True),
        sa.Column("hash_integridad_sha256", sa.String(length=64), nullable=False),
        sa.CheckConstraint("operacion IN ('INSERT', 'UPDATE', 'DELETE')", name="chk_auditoria_operacion"),
    )


def _seed_classification() -> None:
    table = sa.table(
        "clasificacion_informacion_bd",
        sa.column("nombre_tabla"),
        sa.column("nivel_sensibilidad"),
        sa.column("datos_contenidos"),
        sa.column("mecanismo_proteccion"),
    )
    op.bulk_insert(
        table,
        [
            {"nombre_tabla": t, "nivel_sensibilidad": n, "datos_contenidos": d, "mecanismo_proteccion": m}
            for t, n, d, m in CLASSIFICATION
        ],
    )
    quotas = sa.table("cuotas_almacenamiento_bd", sa.column("esquema_o_rol"), sa.column("cuota_maxima_mb"))
    op.bulk_insert(quotas, [{"esquema_o_rol": "public", "cuota_maxima_mb": 500}])


def upgrade() -> None:
    """Crea la bitácora de respaldos y, en PostgreSQL, los controles de auditoría."""
    _create_backup_log()
    if op.get_bind().dialect.name != "postgresql":
        return

    for table, name, condition in CHECKS:
        op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({condition}) NOT VALID")
    for table, column, default in DEFAULTS:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT {default}")

    _create_governance_tables()
    _seed_classification()

    op.execute(AUDIT_FUNCTION)
    for table in AUDITED_TABLES:
        op.execute(
            f"CREATE TRIGGER trg_auditoria_sentencia_{table} AFTER INSERT OR UPDATE OR DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION fn_registrar_auditoria_sentencia()"
        )
    for name, body in VIEWS:
        op.execute(f"CREATE VIEW {name} AS {body}")


def downgrade() -> None:
    """Quita los controles de PostgreSQL y la bitácora de respaldos."""
    if op.get_bind().dialect.name == "postgresql":
        for name, _ in reversed(VIEWS):
            op.execute(f"DROP VIEW IF EXISTS {name}")
        for table in AUDITED_TABLES:
            op.execute(f"DROP TRIGGER IF EXISTS trg_auditoria_sentencia_{table} ON {table}")
        op.execute("DROP FUNCTION IF EXISTS fn_registrar_auditoria_sentencia()")
        for name in (
            "auditoria_sentencias_bd",
            "revisiones_periodicas_logs_bd",
            "control_cambios_emergencia_bd",
            "cuotas_almacenamiento_bd",
            "clasificacion_informacion_bd",
        ):
            op.drop_table(name)
        for table, column, _ in DEFAULTS:
            op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} DROP DEFAULT")
        for table, name, _ in CHECKS:
            op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}")
    op.drop_table("respaldos_bd")
