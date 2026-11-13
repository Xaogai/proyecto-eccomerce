"""Migración 0005: marca de contraseña temporal en las cuentas que da de alta un administrador."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_password_temporal"
down_revision: str | None = "0004_controles_bd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Agrega `usuarios.debe_cambiar_password` (falso para las cuentas existentes)."""
    with op.batch_alter_table("usuarios") as batch:
        batch.add_column(sa.Column("debe_cambiar_password", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    """Quita la marca de contraseña temporal."""
    with op.batch_alter_table("usuarios") as batch:
        batch.drop_column("debe_cambiar_password")
