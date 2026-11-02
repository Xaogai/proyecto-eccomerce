"""Migración inicial 0001: Esquema completo de 16 tablas normalizadas en 2FN (Anexos 2 y 3, AE-14)."""

from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0001_initial_schema_2fn"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSONVariant = sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    """Crea las 16 tablas del Diccionario de Datos en Segunda Forma Normal (2FN)."""
    op.create_table(
        "usuarios",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nombre", sa.String(length=150), nullable=False),
        sa.Column("email", sa.String(length=150), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("fecha_registro", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tipo_usuario", sa.String(length=20), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "clientes",
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("usuario_id"),
    )
    op.create_table(
        "administradores",
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("rol", sa.String(length=50), nullable=False),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("usuario_id"),
    )
    op.create_table(
        "direcciones",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("cliente_id", sa.Uuid(), nullable=False),
        sa.Column("calle", sa.String(length=200), nullable=False),
        sa.Column("ciudad", sa.String(length=100), nullable=False),
        sa.Column("codigo_postal", sa.String(length=10), nullable=False),
        sa.Column("es_predeterminada", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["cliente_id"], ["clientes.usuario_id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "sucursales",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nombre", sa.String(length=100), nullable=False),
        sa.Column("direccion_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["direccion_id"], ["direcciones.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "staff_sucursal",
        sa.Column("usuario_id", sa.Uuid(), nullable=False),
        sa.Column("sucursal_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sucursal_id"], ["sucursales.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("usuario_id"),
    )
    op.create_table(
        "categorias",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("nombre", sa.String(length=100), nullable=False),
        sa.Column("categoria_padre_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["categoria_padre_id"], ["categorias.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "productos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("categoria_id", sa.Uuid(), nullable=False),
        sa.Column("nombre", sa.String(length=200), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("marca", sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(["categoria_id"], ["categorias.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "variantes",
        sa.Column("sku", sa.String(length=50), nullable=False),
        sa.Column("producto_id", sa.Uuid(), nullable=False),
        sa.Column("atributos", JSONVariant, nullable=False),
        sa.Column("precio", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("imagen_url", sa.String(length=300), nullable=True),
        sa.ForeignKeyConstraint(["producto_id"], ["productos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("sku"),
    )
    op.create_table(
        "inventario",
        sa.Column("sucursal_id", sa.Uuid(), nullable=False),
        sa.Column("variante_sku", sa.String(length=50), nullable=False),
        sa.Column("cantidad_disponible", sa.Integer(), nullable=False),
        sa.Column("cantidad_reservada", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["sucursal_id"], ["sucursales.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["variante_sku"], ["variantes.sku"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("sucursal_id", "variante_sku"),
    )
    op.create_table(
        "carritos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("cliente_id", sa.Uuid(), nullable=True),
        sa.Column("fecha_creacion", sa.DateTime(timezone=True), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False),
        sa.ForeignKeyConstraint(["cliente_id"], ["clientes.usuario_id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    # Tabla item_carrito en 2FN estricta: sin columna precio_unitario (Anexo 2.2.2)
    op.create_table(
        "item_carrito",
        sa.Column("carrito_id", sa.Uuid(), nullable=False),
        sa.Column("variante_sku", sa.String(length=50), nullable=False),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["carrito_id"], ["carritos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["variante_sku"], ["variantes.sku"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("carrito_id", "variante_sku"),
    )
    op.create_table(
        "pedidos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("cliente_id", sa.Uuid(), nullable=False),
        sa.Column("folio", sa.String(length=30), nullable=False),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.Column("estado", sa.String(length=30), nullable=False),
        sa.Column("total", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["cliente_id"], ["clientes.usuario_id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("folio"),
    )
    op.create_table(
        "item_pedido",
        sa.Column("pedido_id", sa.Uuid(), nullable=False),
        sa.Column("variante_sku", sa.String(length=50), nullable=False),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("precio_unitario_venta", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("subtotal", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["pedido_id"], ["pedidos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["variante_sku"], ["variantes.sku"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("pedido_id", "variante_sku"),
    )
    op.create_table(
        "pagos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("pedido_id", sa.Uuid(), nullable=False),
        sa.Column("monto", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("metodo", sa.String(length=30), nullable=False),
        sa.Column("estado", sa.String(length=20), nullable=False),
        sa.Column("referencia_pasarela", sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(["pedido_id"], ["pedidos.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("referencia_pasarela"),
    )
    op.create_table(
        "envios",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("pedido_id", sa.Uuid(), nullable=False),
        sa.Column("tipo", sa.String(length=20), nullable=False),
        sa.Column("costo", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("numero_guia", sa.String(length=50), nullable=True),
        sa.Column("estado", sa.String(length=30), nullable=False),
        sa.Column("sucursal_recoleccion_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["pedido_id"], ["pedidos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sucursal_recoleccion_id"], ["sucursales.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    """Revierte las 16 tablas en orden inverso de dependencias (Sec. 17 Migraciones reversibles)."""
    op.drop_table("envios")
    op.drop_table("pagos")
    op.drop_table("item_pedido")
    op.drop_table("pedidos")
    op.drop_table("item_carrito")
    op.drop_table("carritos")
    op.drop_table("inventario")
    op.drop_table("variantes")
    op.drop_table("productos")
    op.drop_table("categorias")
    op.drop_table("staff_sucursal")
    op.drop_table("sucursales")
    op.drop_table("direcciones")
    op.drop_table("administradores")
    op.drop_table("clientes")
    op.drop_table("usuarios")
