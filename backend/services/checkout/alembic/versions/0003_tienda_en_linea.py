"""Migración 0003: columnas y tablas de la tienda en línea (imágenes, reseñas, deseos, historial, devoluciones y configuración)."""

from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0003_tienda_en_linea"
down_revision: str | None = "0002_operational_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSONVariant = sa.JSON().with_variant(JSONB(), "postgresql")

def _nuevas_columnas() -> list[tuple[str, sa.Column]]:
    """Columnas nuevas (se crean en cada llamada: un `sa.Column` solo puede pertenecer a una tabla)."""
    return [
        ("usuarios", sa.Column("telefono", sa.String(length=20), nullable=True)),
        ("usuarios", sa.Column("acepta_marketing", sa.Boolean(), nullable=False, server_default=sa.false())),
        ("usuarios", sa.Column("acepta_personalizacion", sa.Boolean(), nullable=False, server_default=sa.false())),
        ("direcciones", sa.Column("alias", sa.String(length=50), nullable=True)),
        ("direcciones", sa.Column("nombre_recibe", sa.String(length=150), nullable=True)),
        ("direcciones", sa.Column("numero_exterior", sa.String(length=20), nullable=True)),
        ("direcciones", sa.Column("numero_interior", sa.String(length=20), nullable=True)),
        ("direcciones", sa.Column("colonia", sa.String(length=100), nullable=True)),
        ("direcciones", sa.Column("entidad", sa.String(length=100), nullable=True)),
        ("direcciones", sa.Column("telefono", sa.String(length=20), nullable=True)),
        ("direcciones", sa.Column("referencias", sa.String(length=300), nullable=True)),
        ("sucursales", sa.Column("telefono", sa.String(length=20), nullable=True)),
        ("sucursales", sa.Column("horario", sa.String(length=150), nullable=True)),
        ("sucursales", sa.Column("latitud", sa.Numeric(9, 6), nullable=True)),
        ("sucursales", sa.Column("longitud", sa.Numeric(9, 6), nullable=True)),
        ("sucursales", sa.Column("servicios", JSONVariant, nullable=False, server_default="[]")),
        ("productos", sa.Column("estado", sa.String(length=15), nullable=False, server_default="publicado")),
        ("productos", sa.Column("especificaciones", JSONVariant, nullable=False, server_default="{}")),
        ("inventario", sa.Column("pasillo", sa.String(length=20), nullable=True)),
        ("pedidos", sa.Column("codigo_recoleccion", sa.String(length=6), nullable=True)),
        ("envios", sa.Column("direccion_entrega", sa.String(length=400), nullable=True)),
    ]


def upgrade() -> None:
    """Agrega las columnas nuevas y crea las 6 tablas de la tienda en línea."""
    for tabla, columna in _nuevas_columnas():
        with op.batch_alter_table(tabla) as batch:
            batch.add_column(columna)

    op.create_table(
        "imagenes_producto",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("producto_id", sa.Uuid(), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("texto_alternativo", sa.String(length=200), nullable=False),
        sa.Column("orden", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_imagenes_producto_producto_id", "imagenes_producto", ["producto_id"])

    op.create_table(
        "resenas",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("producto_id", sa.Uuid(), nullable=False),
        sa.Column("usuario_id", sa.Uuid(), nullable=True),
        sa.Column("autor", sa.String(length=150), nullable=False),
        sa.Column("calificacion", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(length=120), nullable=False),
        sa.Column("comentario", sa.Text(), nullable=False),
        sa.Column("compra_verificada", sa.Boolean(), nullable=False),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_resenas_producto_id", "resenas", ["producto_id"])

    op.create_table(
        "lista_deseos",
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("variante_sku", sa.String(length=50), nullable=False),
        sa.Column("precio_guardado", sa.Numeric(10, 2), nullable=False),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["variante_sku"], ["variantes.sku"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("usuario_id", "variante_sku"),
    )

    op.create_table(
        "historial_pedidos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("pedido_id", sa.Uuid(), nullable=False),
        sa.Column("estado", sa.String(length=30), nullable=False),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor", sa.String(length=150), nullable=False),
        sa.Column("nota", sa.String(length=300), nullable=True),
        sa.ForeignKeyConstraint(["pedido_id"], ["pedidos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_historial_pedidos_pedido_id", "historial_pedidos", ["pedido_id"])

    op.create_table(
        "devoluciones",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("pedido_id", sa.Uuid(), nullable=False),
        sa.Column("folio", sa.String(length=30), nullable=False),
        sa.Column("motivo", sa.String(length=50), nullable=False),
        sa.Column("comentario", sa.Text(), nullable=True),
        sa.Column("articulos", JSONVariant, nullable=False),
        sa.Column("foto", sa.String(length=300), nullable=True),
        sa.Column("estado", sa.String(length=20), nullable=False),
        sa.Column("monto_reembolso", sa.Numeric(10, 2), nullable=False),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["pedido_id"], ["pedidos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("folio"),
    )
    op.create_index("ix_devoluciones_pedido_id", "devoluciones", ["pedido_id"])

    op.create_table(
        "configuracion",
        sa.Column("clave", sa.String(length=60), nullable=False),
        sa.Column("valor", JSONVariant, nullable=False),
        sa.PrimaryKeyConstraint("clave"),
    )


def downgrade() -> None:
    """Revierte la migración 0003: borra las tablas nuevas y quita las columnas agregadas."""
    op.drop_table("configuracion")
    op.drop_index("ix_devoluciones_pedido_id", table_name="devoluciones")
    op.drop_table("devoluciones")
    op.drop_index("ix_historial_pedidos_pedido_id", table_name="historial_pedidos")
    op.drop_table("historial_pedidos")
    op.drop_table("lista_deseos")
    op.drop_index("ix_resenas_producto_id", table_name="resenas")
    op.drop_table("resenas")
    op.drop_index("ix_imagenes_producto_producto_id", table_name="imagenes_producto")
    op.drop_table("imagenes_producto")
    for tabla, columna in reversed(_nuevas_columnas()):
        with op.batch_alter_table(tabla) as batch:
            batch.drop_column(columna.name)
