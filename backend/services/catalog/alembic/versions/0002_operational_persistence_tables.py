"""Migración 0002: Tablas operativas de persistencia (bitácora, revocación JWT, bloqueos, reservas y webhooks)."""

from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0002_operational_tables"
down_revision: str | None = "0001_initial_schema_2fn"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

JSONVariant = sa.JSON().with_variant(JSONB(), "postgresql")


def upgrade() -> None:
    """Crea las 5 tablas operativas de infraestructura que eliminan el estado en memoria."""
    op.create_table(
        "bitacora_auditoria",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tipo_evento", sa.String(length=60), nullable=False),
        sa.Column("actor_id", sa.String(length=64), nullable=True),
        sa.Column("recurso", sa.String(length=255), nullable=False),
        sa.Column("detalles", JSONVariant, nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_bitacora_auditoria_fecha", "bitacora_auditoria", ["fecha"])
    op.create_index("ix_bitacora_auditoria_tipo_evento", "bitacora_auditoria", ["tipo_evento"])

    op.create_table(
        "tokens_revocados",
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("revocado_en", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("jti"),
    )

    op.create_table(
        "intentos_login_fallidos",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=150), nullable=False),
        sa.Column("fecha", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_intentos_login_fallidos_email", "intentos_login_fallidos", ["email"])

    op.create_table(
        "reservas_inventario",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("variante_sku", sa.String(length=50), nullable=False),
        sa.Column("sucursal_id", sa.Uuid(), nullable=False),
        sa.Column("pedido_id", sa.Uuid(), nullable=True),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("estado", sa.String(length=15), nullable=False),
        sa.Column("creada_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expira_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("idempotency_key", sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(["variante_sku"], ["variantes.sku"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sucursal_id"], ["sucursales.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pedido_id"], ["pedidos.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
    )
    op.create_index("ix_reservas_inventario_pedido_id", "reservas_inventario", ["pedido_id"])
    op.create_index("ix_reservas_inventario_estado", "reservas_inventario", ["estado"])

    op.create_table(
        "eventos_webhook",
        sa.Column("event_id", sa.String(length=100), nullable=False),
        sa.Column("resultado", JSONVariant, nullable=False),
        sa.Column("procesado_en", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("event_id"),
    )


def downgrade() -> None:
    """Revierte las 5 tablas operativas de infraestructura (Sec. 17 Migraciones reversibles)."""
    op.drop_table("eventos_webhook")
    op.drop_index("ix_reservas_inventario_estado", table_name="reservas_inventario")
    op.drop_index("ix_reservas_inventario_pedido_id", table_name="reservas_inventario")
    op.drop_table("reservas_inventario")
    op.drop_index("ix_intentos_login_fallidos_email", table_name="intentos_login_fallidos")
    op.drop_table("intentos_login_fallidos")
    op.drop_table("tokens_revocados")
    op.drop_index("ix_bitacora_auditoria_tipo_evento", table_name="bitacora_auditoria")
    op.drop_index("ix_bitacora_auditoria_fecha", table_name="bitacora_auditoria")
    op.drop_table("bitacora_auditoria")
