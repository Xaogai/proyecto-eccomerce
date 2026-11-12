"""Ejecutor programático de migraciones Alembic (Sec. 17 — Migraciones versionadas y reversibles)."""

from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.engine import Engine

from backend.shared.database import engine as default_engine

ALEMBIC_INI_PATH = Path(__file__).resolve().parents[1] / "services" / "users" / "alembic.ini"
ALEMBIC_DIR_PATH = Path(__file__).resolve().parents[1] / "services" / "users" / "alembic"


def _build_alembic_config(target_engine: Engine) -> Config:
    """
    Construye la configuración de Alembic apuntando al directorio de migraciones canónico.

    La conexión se inyecta vía `cfg.attributes["connection"]`, por lo que no se escribe la URL en el
    `configparser` (evita errores de interpolación con `%` en rutas o contraseñas).
    """
    cfg = Config(str(ALEMBIC_INI_PATH))
    cfg.set_main_option("script_location", str(ALEMBIC_DIR_PATH).replace("%", "%%"))
    cfg.attributes["skip_logging_config"] = True
    return cfg


def upgrade_database(target_engine: Engine | None = None, revision: str = "head") -> None:
    """
    Aplica las migraciones de Alembic hasta la revisión indicada (`head` por defecto).

    Si detecta una base de datos legacy creada previamente con `create_all` (sin tabla `alembic_version`),
    la estampa en la revisión correspondiente antes de aplicar las migraciones pendientes.
    """
    eng = target_engine or default_engine
    cfg = _build_alembic_config(eng)
    with eng.begin() as connection:
        inspector = inspect(connection)
        existing_tables = set(inspector.get_table_names())
        cfg.attributes["connection"] = connection
        if "usuarios" in existing_tables and "alembic_version" not in existing_tables:
            if "respaldos_bd" in existing_tables:
                stamp_rev = "0004_controles_bd"
            elif "resenas" in existing_tables:
                stamp_rev = "0003_tienda_en_linea"
            elif "bitacora_auditoria" in existing_tables:
                stamp_rev = "0002_operational_tables"
            else:
                stamp_rev = "0001_initial_schema_2fn"
            command.stamp(cfg, stamp_rev)
        command.upgrade(cfg, revision)


def downgrade_database(target_engine: Engine | None = None, revision: str = "base") -> None:
    """Revierte las migraciones de Alembic hasta la revisión indicada (`base` por defecto)."""
    eng = target_engine or default_engine
    cfg = _build_alembic_config(eng)
    with eng.begin() as connection:
        cfg.attributes["connection"] = connection
        command.downgrade(cfg, revision)
