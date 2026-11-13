"""Migración 0006: cuentas del personal desactivables (sin borrar su historial)."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_usuario_activo"
down_revision: str | None = "0005_password_temporal"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Agrega `usuarios.activo` (verdadero para las cuentas existentes)."""
    with op.batch_alter_table("usuarios") as batch:
        batch.add_column(sa.Column("activo", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    """Quita la marca de cuenta activa."""
    with op.batch_alter_table("usuarios") as batch:
        batch.drop_column("activo")
