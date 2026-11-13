"""Migraciones, controles, roles y respaldos contra un PostgreSQL real (en el CI, el servicio postgres:16).

Se omite si no está definida `TEST_POSTGRES_URL`, la URL de un usuario que pueda crear bases y roles:
    TEST_POSTGRES_URL=postgresql+psycopg://postgres:postgres@localhost:5432/postgres pytest backend/tests/test_postgresql.py
"""

from collections.abc import Generator
import os
from pathlib import Path
import time
import uuid

import psycopg
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url

from backend.shared.backups import BackupError, create_backup, restore_backup
from backend.shared.config import settings
from backend.shared.database import SessionLocal
from backend.shared.db_controls import apply_database_controls, controls_summary
from backend.shared.migrations import downgrade_database, upgrade_database
from backend.shared.seed import seed_synthetic_data

ADMIN_URL = os.getenv("TEST_POSTGRES_URL", "")
pytestmark = pytest.mark.skipif(not ADMIN_URL, reason="Sin TEST_POSTGRES_URL: no hay PostgreSQL para probar")
AUDITOR_PASSWORD = "Auditor-Prueba-2026#"


def _new_database(name: str) -> Engine:
    url = make_url(ADMIN_URL)
    with psycopg.connect(url.set(drivername="postgresql").render_as_string(hide_password=False), autocommit=True) as conn:
        conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        conn.execute(f'CREATE DATABASE "{name}"')
    return create_engine(url.set(database=name))


@pytest.fixture()
def pg() -> Generator[Engine, None, None]:
    engine = _new_database(f"prueba_{uuid.uuid4().hex[:8]}")
    upgrade_database(engine)
    with SessionLocal(bind=engine) as db:
        seed_synthetic_data(db)
    yield engine
    engine.dispose()


def test_migraciones_ida_y_vuelta(pg: Engine) -> None:
    with pg.connect() as conn:
        assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == "0005_password_temporal"
    downgrade_database(pg)
    with pg.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")).scalar_one() == 1
    upgrade_database(pg)


def test_controles_y_roles(pg: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "db_role_auditor_password", AUDITOR_PASSWORD)
    monkeypatch.setattr(settings, "db_role_app_password", "debil")
    roles = apply_database_controls(pg)["roles"]
    assert roles["rol_ferremarket_auditor"] == "con acceso"
    assert roles["rol_ferremarket_app"].startswith("sin acceso: contraseña sin")

    with pg.connect() as conn:
        summary = controls_summary(conn)
        assert summary["completos"] is True and summary["triggers_auditoria"] == 7
        assert summary["registros_auditoria_sentencias"] > 0
        leaked = conn.execute(
            text("SELECT count(*) FROM auditoria_sentencias_bd WHERE datos_nuevos ? 'password_hash'")
        ).scalar_one()
        assert leaked == 0, "la bitácora de sentencias no guarda contraseñas"

    auditor = make_url(str(pg.url)).set(drivername="postgresql", username="rol_ferremarket_auditor", password=AUDITOR_PASSWORD)
    with psycopg.connect(auditor.render_as_string(hide_password=False)) as conn:
        assert conn.execute("SELECT count(*) FROM pedidos").fetchone()[0] > 0  # type: ignore[index]
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("DELETE FROM pedidos")


def test_respaldo_y_restauracion_en_otra_base(pg: Engine, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "backup_encryption_key", "llave-de-prueba-postgresql")
    monkeypatch.setattr(settings, "backup_dir", str(tmp_path / "local"))
    result = create_backup(pg)
    assert result.restauracion_verificada is True

    target = _new_database(f"restaurada_{uuid.uuid4().hex[:8]}")
    upgrade_database(target)
    with pytest.raises(BackupError, match="clasificacion_informacion_bd"):
        restore_backup(Path(result.copias[0]), target)
    restored = restore_backup(Path(result.copias[0]), target, replace=True)
    with pg.connect() as a, target.connect() as b:
        for table in ("usuarios", "pedidos", "item_pedido", "variantes", "inventario", "categorias"):
            original = a.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()
            assert b.execute(text(f"SELECT count(*) FROM {table}")).scalar_one() == original == restored[table]
    with target.begin() as conn:
        conn.execute(text(
            "INSERT INTO auditoria_sentencias_bd (fecha_hora, usuario_bd, rol_activo, operacion, esquema_tabla, "
            "sentencia_sql, hash_integridad_sha256) VALUES (now(), 'x', 'x', 'INSERT', 'x', 'x', 'x')"
        ))
    target.dispose()


def test_ajustes_del_servidor_con_superusuario(pg: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "db_audit_server_settings", True)
    try:
        conf = apply_database_controls(pg)["postgresql_conf"]
        assert conf["log_statement"] == "mod" and conf["password_encryption"] == "scram-sha-256"
        # pg_reload_conf() solo envía la señal: el servidor recarga la configuración un momento después.
        for _ in range(50):
            with pg.connect() as conn:
                if conn.execute(text("SHOW log_statement")).scalar_one() == "mod":
                    break
            time.sleep(0.1)
        else:
            pytest.fail("log_statement no cambió después de recargar la configuración")
    finally:
        with pg.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.exec_driver_sql("ALTER SYSTEM RESET ALL")
            conn.exec_driver_sql("SELECT pg_reload_conf()")
