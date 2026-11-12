"""Controles de PostgreSQL que dependen de cada instalación: roles con privilegio mínimo y ajustes del servidor.

Las tablas, vistas, restricciones y triggers de auditoría los crea la migración `0004_controles_bd`.
Aquí va lo que no cabe en una migración: las contraseñas de los roles (variables de entorno) y
`postgresql.conf` (requiere superusuario). Cada paso corre en su propia transacción: si falta un permiso,
se informa en el resultado y la aplicación sigue arrancando. En SQLite no hace nada.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import logging
import re
from typing import Any

from psycopg import sql
from sqlalchemy import func, select, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import DBAPIError

from backend.shared.config import settings
from backend.shared.models import RespaldoBD

logger = logging.getLogger(__name__)

AUDITED_TABLES = 7
EXPECTED_VIEWS = 5
EXPECTED_CHECKS = 10
ROLE_PASSWORD_VALID_DAYS = 365


@dataclass(frozen=True)
class RoleSpec:
    """Rol de base de datos, la variable con su contraseña y sus permisos."""

    name: str
    password_setting: str
    grants: tuple[str, ...]


ROLES: tuple[RoleSpec, ...] = (
    RoleSpec(
        "rol_ferremarket_auditor",
        "db_role_auditor_password",
        ("GRANT SELECT ON ALL TABLES IN SCHEMA public TO {role}",),
    ),
    RoleSpec(
        "rol_ferremarket_app",
        "db_role_app_password",
        (
            "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {role}",
            "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {role}",
        ),
    ),
    RoleSpec(
        "rol_ferremarket_operador_sucursal",
        "db_role_sucursal_password",
        (
            "GRANT SELECT ON vw_catalogo_disponibilidad_5tablas, vw_pedidos_consolidado_5tablas TO {role}",
            "GRANT SELECT, UPDATE ON inventario, envios TO {role}",
        ),
    ),
    RoleSpec(
        "rol_ferremarket_respaldo",
        "db_role_respaldo_password",
        ("GRANT SELECT ON ALL TABLES IN SCHEMA public TO {role}",),
    ),
)

SERVER_SETTINGS: tuple[tuple[str, str], ...] = (
    ("password_encryption", "scram-sha-256"),
    ("log_statement", "mod"),
    ("log_connections", "on"),
    ("log_disconnections", "on"),
)


def password_problems(role: str, password: str) -> list[str]:
    """Reglas de la política de contraseñas de la base de datos; lista vacía si cumple."""
    rules = [
        (len(password) >= 12, "al menos 12 caracteres"),
        (re.search(r"[A-Z]", password) is not None, "una mayúscula"),
        (re.search(r"[a-z]", password) is not None, "una minúscula"),
        (re.search(r"\d", password) is not None, "un dígito"),
        (re.search(r"[^A-Za-z0-9]", password) is not None, "un carácter especial"),
        (role.lower() not in password.lower(), "no contener el nombre del rol"),
    ]
    return [message for ok, message in rules if not ok]


def _configure_role(conn: Connection, spec: RoleSpec) -> str:
    """Crea o actualiza el rol y sus permisos. Regresa cómo quedó: con acceso, sin acceso o el problema."""
    password = str(getattr(settings, spec.password_setting))
    problems = password_problems(spec.name, password) if password else []
    exists = conn.execute(text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": spec.name}).scalar()
    cursor = conn.connection.dbapi_connection.cursor()  # type: ignore[union-attr]
    role = sql.Identifier(spec.name)
    if not exists:
        cursor.execute(sql.SQL("CREATE ROLE {} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION").format(role))
    if password and not problems:
        until = (datetime.now(timezone.utc) + timedelta(days=ROLE_PASSWORD_VALID_DAYS)).isoformat()
        # La contraseña no debe quedar en el registro de sentencias del servidor.
        cursor.execute("SAVEPOINT sin_registro")
        try:
            cursor.execute("SET LOCAL log_statement = 'none'")
        except Exception:
            cursor.execute("ROLLBACK TO SAVEPOINT sin_registro")
        cursor.execute(
            sql.SQL("ALTER ROLE {} LOGIN PASSWORD {} VALID UNTIL {}").format(role, sql.Literal(password), sql.Literal(until))
        )
        status = "con acceso"
    else:
        cursor.execute(sql.SQL("ALTER ROLE {} NOLOGIN").format(role))
        status = "sin acceso: " + ("contraseña sin " + ", ".join(problems) if problems else f"falta {spec.password_setting.upper()}")
    cursor.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(role))
    for grant in spec.grants:
        cursor.execute(sql.SQL(grant).format(role=role))
    return status


def _apply_server_settings(engine: Engine) -> dict[str, str]:
    applied: dict[str, str] = {}
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for name, value in SERVER_SETTINGS:
            try:
                conn.exec_driver_sql(f"ALTER SYSTEM SET {name} = '{value}'")
                applied[name] = value
            except DBAPIError as exc:
                applied[name] = f"sin aplicar: {exc.orig.__class__.__name__ if exc.orig else 'error'}"
        try:
            conn.exec_driver_sql("SELECT pg_reload_conf()")
        except DBAPIError:
            applied["recarga"] = "sin permiso para recargar la configuración"
    return applied


def apply_database_controls(engine: Engine) -> dict[str, Any]:
    """
    Configura los roles y, si `DB_AUDIT_SERVER_SETTINGS` está activo, el registro del servidor.

    No lanza excepciones: lo que no se pudo aplicar queda en el resultado y en el log.
    """
    if engine.dialect.name != "postgresql":
        return {"status": "omitido", "motivo": f"solo aplica en PostgreSQL (motor: {engine.dialect.name})"}
    result: dict[str, Any] = {"status": "aplicado"}
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
        result["esquema_public"] = "solo el dueño crea objetos"
    except DBAPIError as exc:
        result["esquema_public"] = "sin aplicar: el usuario de la aplicación no es dueño del esquema"
        logger.warning("No se restringió el esquema public: %s", exc.orig)
    roles: dict[str, str] = {}
    for spec in ROLES:
        try:
            with engine.begin() as conn:
                roles[spec.name] = _configure_role(conn, spec)
        except DBAPIError as exc:
            roles[spec.name] = "sin aplicar: el usuario de la aplicación no puede crear roles"
            logger.warning("No se configuró %s: %s", spec.name, exc.orig)
    result["roles"] = roles
    if settings.db_audit_server_settings:
        result["postgresql_conf"] = _apply_server_settings(engine)
    return result


def controls_summary(conn: Connection) -> dict[str, Any]:
    """Estado real de los controles, leído de la base; `completos` solo si todo está en su lugar."""
    last = conn.execute(
        select(RespaldoBD.fecha, RespaldoBD.restauracion_verificada, RespaldoBD.copias, RespaldoBD.detalle)
        .order_by(RespaldoBD.fecha.desc())
        .limit(1)
    ).first()
    backups = conn.execute(select(func.count()).select_from(RespaldoBD)).scalar_one()
    backup_info: dict[str, Any] = {"total": int(backups), "ultimo": None}
    if last is not None:
        backup_info["ultimo"] = {
            "fecha": last.fecha.isoformat(),
            "restauracion_verificada": last.restauracion_verificada,
            "copias": len(last.copias),
            "detalle": last.detalle,
        }
    if conn.dialect.name != "postgresql":
        return {"motor": conn.dialect.name, "controles_postgresql": False, "respaldos": backup_info}

    views = conn.execute(
        text("SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'vw\\_%' ORDER BY viewname")
    ).scalars().all()
    checks = conn.execute(
        text("SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace "
             "WHERE n.nspname = 'public' AND c.contype = 'c' AND c.conname LIKE 'chk\\_%'")
    ).scalar_one()
    triggers = conn.execute(
        text("SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'trg_auditoria_sentencia_%' AND NOT tgisinternal")
    ).scalar_one()
    roles = conn.execute(
        text("SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname LIKE 'rol_ferremarket_%' ORDER BY rolname")
    ).all()
    audit_rows = conn.execute(text("SELECT count(*) FROM auditoria_sentencias_bd")).scalar_one()
    log_statement = conn.execute(text("SHOW log_statement")).scalar_one()
    return {
        "motor": conn.execute(text("SHOW server_version")).scalar_one(),
        "controles_postgresql": True,
        "vistas": list(views),
        "restricciones_check": int(checks),
        "triggers_auditoria": int(triggers),
        "roles": {name: ("con acceso" if login else "sin acceso") for name, login in roles},
        "registros_auditoria_sentencias": int(audit_rows),
        "log_statement": str(log_statement),
        "respaldos": backup_info,
        "completos": len(views) >= EXPECTED_VIEWS
        and int(checks) >= EXPECTED_CHECKS
        and int(triggers) == AUDITED_TABLES
        and len(roles) == len(ROLES),
    }
