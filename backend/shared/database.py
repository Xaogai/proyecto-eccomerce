"""Configuración de conexión y sesión de SQLAlchemy 2.0."""

from collections.abc import Generator, Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.shared.config import settings


class Base(DeclarativeBase):
    """Clase base declarativa para todos los modelos ORM."""


def build_engine(database_url: str | None = None) -> Engine:
    """Crea una instancia de Engine de SQLAlchemy según la URL proporcionada."""
    url = database_url or settings.database_url
    if url.startswith("sqlite"):
        engine_ = create_engine(
            url,
            pool_pre_ping=True,
            connect_args={"check_same_thread": False, "timeout": 30},
        )
        _enable_sqlite_wal(engine_)
        return engine_
    return create_engine(url, pool_pre_ping=True)


def _enable_sqlite_wal(engine_: Engine) -> None:
    """Activa WAL y claves foráneas en SQLite para permitir lecturas/escrituras concurrentes en desarrollo."""

    @event.listens_for(engine_, "connect")
    def _set_pragmas(dbapi_connection: Any, _record: Any) -> None:
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()


engine = build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Fábrica de sesiones para las tablas operativas (auditoría, tokens revocados, bloqueos de login).
# Es reemplazable para que las pruebas la apunten a su base de datos en memoria.
operational_session_factory: sessionmaker[Session] = SessionLocal


def set_operational_session_factory(factory: sessionmaker[Session]) -> None:
    """Reemplaza la fábrica de sesiones operativas (usado por las pruebas)."""
    global operational_session_factory
    operational_session_factory = factory


@contextmanager
def operational_session() -> Iterator[Session]:
    """
    Sesión independiente con commit propio para tablas operativas.

    Al ir en su propia transacción, un evento de auditoría o una revocación de token
    sobreviven aunque la transacción de negocio que los originó haga rollback.
    """
    session = operational_session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Generator[Session, None, None]:
    """Dependencia de FastAPI que provee una sesión de base de datos por petición."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
