"""Respaldos cifrados de la base de datos con la estrategia 3-2-1 y prueba de restauración real.

- Copia 1: la base de datos en uso.
- Copia 2: `BACKUP_DIR`.
- Copia 3: `BACKUP_OFFSITE_DIR`, que debe estar en otro medio. Se revisa que sea otro dispositivo.

El respaldo es un volcado lógico de todas las tablas (funciona igual en SQLite y PostgreSQL),
cifrado con AES-256-GCM y una llave derivada de `BACKUP_ENCRYPTION_KEY` con PBKDF2-HMAC-SHA256.
Antes de registrarlo, la copia escrita en disco se descifra y se restaura en una base SQLite en memoria
para comprobar que cada tabla regresa con las mismas filas.

Uso por línea de comandos (para cron o el Programador de tareas):
    python -m backend.shared.backups crear
    python -m backend.shared.backups restaurar ARCHIVO [--reemplazar]
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from datetime import date, datetime, time, timezone
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import secrets
import sys
from typing import Any
import uuid
import warnings

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import MetaData, Table, create_engine, func, insert, select, types
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import SAWarning
from sqlalchemy.orm import Session

from backend.shared.config import settings
from backend.shared.database import Base
from backend.shared.models import RespaldoBD

ALGORITHM = "AES-256-GCM"
KDF_ITERATIONS = 600_000
MAGIC = b"FMKTBKP1"
SALT_BYTES = 16
NONCE_BYTES = 12
SUFFIX = ".fmbak"


class BackupError(Exception):
    """El respaldo no se pudo crear, leer o restaurar."""


class BackupNotConfigured(BackupError):
    """Falta `BACKUP_ENCRYPTION_KEY`: no se generan respaldos sin cifrar."""


@dataclass
class BackupResult:
    """Lo que se guardó, dónde, y si la restauración de prueba salió bien."""

    archivo: str
    copias: list[str]
    otro_medio: bool
    cumple_321: bool
    sha256: str
    tamano_bytes: int
    tablas: int
    filas: int
    restauracion_verificada: bool
    tablas_no_restaurables: list[str] = field(default_factory=list)
    registro_id: str | None = None


def _derive_key(passphrase: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", passphrase.encode("utf-8"), salt, KDF_ITERATIONS, dklen=32)


def key_fingerprint(passphrase: str) -> str:
    """Huella corta de la llave, para saber con cuál se cifró cada respaldo sin guardar la llave."""
    return _derive_key(passphrase, b"ferremarket-huella-llave").hex()[:16]


def encrypt(plaintext: bytes, passphrase: str) -> bytes:
    """Cifra con AES-256-GCM: formato `MAGIC | sal | nonce | texto cifrado con etiqueta`."""
    salt = secrets.token_bytes(SALT_BYTES)
    nonce = secrets.token_bytes(NONCE_BYTES)
    ciphertext = AESGCM(_derive_key(passphrase, salt)).encrypt(nonce, plaintext, MAGIC)
    return MAGIC + salt + nonce + ciphertext


def decrypt(envelope: bytes, passphrase: str) -> bytes:
    """Descifra un respaldo; falla si la llave no es la correcta o si el archivo fue alterado."""
    if not envelope.startswith(MAGIC):
        raise BackupError("El archivo no es un respaldo de Ferremarket")
    head = len(MAGIC)
    salt = envelope[head : head + SALT_BYTES]
    nonce = envelope[head + SALT_BYTES : head + SALT_BYTES + NONCE_BYTES]
    try:
        return AESGCM(_derive_key(passphrase, salt)).decrypt(nonce, envelope[head + SALT_BYTES + NONCE_BYTES :], MAGIC)
    except InvalidTag as exc:
        raise BackupError("La llave no corresponde o el respaldo fue modificado") from exc


def _encode(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {"__b64__": base64.b64encode(bytes(value)).decode("ascii")}
    return value


def _decode(column_type: types.TypeEngine[Any], value: Any) -> Any:
    """Regresa el valor del volcado al tipo de la columna destino."""
    if value is None:
        return None
    if isinstance(value, dict) and "__b64__" in value:
        return base64.b64decode(value["__b64__"])
    if isinstance(column_type, (types.JSON, types.ARRAY)):
        return value
    try:
        python_type = column_type.python_type
    except NotImplementedError:
        return value
    if python_type is uuid.UUID:
        return uuid.UUID(str(value))
    if python_type is datetime:
        return datetime.fromisoformat(value)
    if python_type is date:
        return date.fromisoformat(value)
    if python_type is time:
        return time.fromisoformat(value)
    if python_type is Decimal:
        return Decimal(value)
    return value


def _reflect(conn: Connection) -> MetaData:
    """Lee el esquema real de la base (incluye tablas que no están en los modelos)."""
    metadata = MetaData()
    with warnings.catch_warnings():
        # SQLAlchemy 2.1 avisa al reflejar algunos índices de PostgreSQL; no afecta a columnas ni datos.
        warnings.filterwarnings("ignore", message="Can't validate argument 'dialect_options'", category=SAWarning)
        metadata.reflect(bind=conn)
    return metadata


def dump_database(conn: Connection) -> dict[str, Any]:
    """Volcado lógico de todas las tablas de la base (incluidas las exclusivas de PostgreSQL)."""
    metadata = _reflect(conn)
    tables: dict[str, list[dict[str, Any]]] = {}
    for reflected in metadata.sorted_tables:
        table = Base.metadata.tables.get(reflected.name, reflected)
        rows = conn.execute(select(table)).mappings().all()
        tables[table.name] = [{key: _encode(val) for key, val in row.items()} for row in rows]
    return {
        "formato": 1,
        "motor": conn.dialect.name,
        "fecha": datetime.now(timezone.utc).isoformat(),
        "tablas": tables,
    }


def _parents_first(table: Table, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Ordena las filas de una tabla que se referencia a sí misma (categorías): primero los padres."""
    self_refs = [fk for fk in table.foreign_keys if fk.column.table.name == table.name]
    if not self_refs or len(table.primary_key.columns) != 1:
        return rows
    pk = next(iter(table.primary_key.columns)).name
    parent_col = self_refs[0].parent.name
    pending = {row[pk]: row for row in rows}
    ordered: list[dict[str, Any]] = []
    placed: set[Any] = set()
    while pending:
        ready = [k for k, r in pending.items() if r.get(parent_col) is None or r[parent_col] in placed or r[parent_col] not in pending]
        if not ready:
            raise BackupError(f"La tabla {table.name} tiene un ciclo de referencias")
        for key in ready:
            ordered.append(pending.pop(key))
            placed.add(key)
    return ordered


def _advance_sequences(conn: Connection, table: Table) -> None:
    """En PostgreSQL, mueve la secuencia de las columnas autonuméricas después del id más alto restaurado."""
    for column in table.primary_key.columns:
        if isinstance(column.type, types.Integer):
            conn.exec_driver_sql(
                f"SELECT setval(pg_get_serial_sequence('{table.name}', '{column.name}'), "
                f"(SELECT MAX({column.name}) FROM {table.name})) "
                f"WHERE pg_get_serial_sequence('{table.name}', '{column.name}') IS NOT NULL"
            )


def restore_dump(dump: dict[str, Any], conn: Connection, replace: bool = False) -> tuple[dict[str, int], list[str]]:
    """
    Inserta el volcado en una base con el esquema ya creado (las migraciones aplicadas).

    Args:
        dump: Volcado descifrado.
        conn: Conexión dentro de una transacción: si algo falla, no queda nada a medias.
        replace: Vacía antes las tablas del respaldo. Sin esto, la base no debe tener datos en ellas.

    Returns:
        Filas restauradas por tabla y las tablas del respaldo que no existen en el destino.

    Raises:
        BackupError: si alguna tabla ya tiene datos y no se pidió reemplazarlos.
    """
    metadata = _reflect(conn)
    target = {t.name: t for t in metadata.sorted_tables}
    in_backup = [t for t in metadata.sorted_tables if t.name in dump["tablas"] and t.name != "alembic_version"]
    if replace:
        for table in reversed(in_backup):
            conn.execute(table.delete())
    else:
        busy = [t.name for t in in_backup if conn.execute(select(func.count()).select_from(t)).scalar_one()]
        if busy:
            raise BackupError("La base ya tiene datos en: " + ", ".join(busy) + ". Usa --reemplazar para sustituirlos")
    restored: dict[str, int] = {}
    for reflected in in_backup:
        rows = dump["tablas"][reflected.name]
        if not rows:
            continue
        # Las tablas de la aplicación usan los tipos del modelo (en SQLite, la reflexión ve los UUID como texto).
        table = Base.metadata.tables.get(reflected.name, reflected)
        columns = {c.name: c.type for c in table.columns}
        payload = [{k: _decode(columns[k], v) for k, v in row.items() if k in columns} for row in rows]
        conn.execute(insert(table), _parents_first(table, payload))
        if conn.dialect.name == "postgresql":
            _advance_sequences(conn, table)
        restored[table.name] = len(payload)
    missing = sorted(name for name in dump["tablas"] if name not in target)
    return restored, missing


def _restore_test(dump: dict[str, Any]) -> tuple[bool, list[str]]:
    """
    Restaura en SQLite en memoria con el esquema de la aplicación y compara las filas de cada tabla.

    Las tablas que no son de la aplicación (las de auditoría de PostgreSQL) no caben en SQLite:
    se regresan aparte y quedan verificadas solo por haberse descifrado sin errores.
    """
    app_tables = {name: table for name, table in Base.metadata.tables.items()}
    scratch = create_engine("sqlite://")
    try:
        Base.metadata.create_all(scratch)
        with scratch.begin() as conn:
            restore_dump(dump, conn)
            ok = all(
                conn.execute(select(func.count()).select_from(app_tables[name])).scalar_one() == len(rows)
                for name, rows in dump["tablas"].items()
                if name in app_tables
            )
    finally:
        scratch.dispose()
    others = sorted(n for n in dump["tablas"] if n not in app_tables and n != "alembic_version")
    return ok, others


def _same_device(a: Path, b: Path) -> bool:
    return os.stat(a).st_dev == os.stat(b).st_dev


def _write(path: Path, data: bytes) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def create_backup(engine: Engine, db: Session | None = None, requested_by: str | None = None) -> BackupResult:
    """
    Genera el respaldo cifrado, lo guarda en los medios configurados y prueba restaurarlo.

    Args:
        engine: Motor de la base a respaldar.
        db: Sesión donde se registra el respaldo en `respaldos_bd` (si no se pasa, se abre una).
        requested_by: Id del admin que lo pidió, o `None` si lo lanzó una tarea programada.

    Raises:
        BackupNotConfigured: si no hay `BACKUP_ENCRYPTION_KEY`.
        BackupError: si la copia escrita no se puede descifrar o restaurar.
    """
    passphrase = settings.backup_encryption_key
    if not passphrase:
        raise BackupNotConfigured("Define BACKUP_ENCRYPTION_KEY para generar respaldos cifrados")

    options = {"isolation_level": "REPEATABLE READ"} if engine.dialect.name == "postgresql" else {}
    with engine.connect().execution_options(**options) as conn:
        dump = dump_database(conn)
    plaintext = json.dumps(dump, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    envelope = encrypt(plaintext, passphrase)
    digest = hashlib.sha256(envelope).hexdigest()

    name = f"ferremarket-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{digest[:8]}{SUFFIX}"
    local_dir = Path(settings.backup_dir)
    local_dir.mkdir(parents=True, exist_ok=True)
    targets = [local_dir / name]
    offsite_dir = Path(settings.backup_offsite_dir) if settings.backup_offsite_dir else None
    if offsite_dir is not None:
        offsite_dir.mkdir(parents=True, exist_ok=True)
        if offsite_dir.resolve() != local_dir.resolve():
            targets.append(offsite_dir / name)
    for path in targets:
        _write(path, envelope)

    for path in targets:
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise BackupError(f"La copia en {path} no coincide con lo que se escribió")
    restored_ok, not_restorable = _restore_test(json.loads(decrypt(targets[-1].read_bytes(), passphrase)))

    other_medium = len(targets) == 2 and not _same_device(local_dir, targets[1].parent)
    result = BackupResult(
        archivo=name,
        copias=[str(p) for p in targets],
        otro_medio=other_medium,
        cumple_321=other_medium and restored_ok,
        sha256=digest,
        tamano_bytes=len(envelope),
        tablas=len(dump["tablas"]),
        filas=sum(len(rows) for rows in dump["tablas"].values()),
        restauracion_verificada=restored_ok,
        tablas_no_restaurables=not_restorable,
    )
    _record(result, engine, db, requested_by, dump["motor"], passphrase)
    return result


def _record(
    result: BackupResult, engine: Engine, db: Session | None, requested_by: str | None, motor: str, passphrase: str
) -> None:
    detail = []
    if len(result.copias) == 1:
        detail.append("Falta BACKUP_OFFSITE_DIR: solo hay una copia fuera de la base")
    elif not result.otro_medio:
        detail.append("BACKUP_OFFSITE_DIR está en el mismo disco que BACKUP_DIR")
    if result.tablas_no_restaurables:
        detail.append("Fuera del esquema de la aplicación, verificadas solo al descifrar: " + ", ".join(result.tablas_no_restaurables))
    row = RespaldoBD(
        solicitado_por=requested_by,
        motor=motor,
        algoritmo=ALGORITHM,
        huella_llave=key_fingerprint(passphrase),
        tamano_bytes=result.tamano_bytes,
        sha256=result.sha256,
        tablas=result.tablas,
        filas=result.filas,
        copias=result.copias,
        restauracion_verificada=result.restauracion_verificada,
        detalle="; ".join(detail) or None,
    )
    session = db or Session(engine)
    try:
        session.add(row)
        session.commit()
        result.registro_id = str(row.id)
    finally:
        if db is None:
            session.close()


def restore_backup(path: Path, engine: Engine, replace: bool = False) -> dict[str, int]:
    """Restaura un respaldo en una base con las migraciones aplicadas (ver `restore_dump`)."""
    passphrase = settings.backup_encryption_key
    if not passphrase:
        raise BackupNotConfigured("Define BACKUP_ENCRYPTION_KEY con la llave con que se cifró el respaldo")
    dump = json.loads(decrypt(path.read_bytes(), passphrase))
    with engine.begin() as conn:
        restored, _ = restore_dump(dump, conn, replace=replace)
    return restored


def main(argv: list[str]) -> int:
    """Línea de comandos: `crear` o `restaurar ARCHIVO [--reemplazar]`."""
    from backend.shared.database import engine

    if argv[:1] == ["crear"]:
        result = create_backup(engine)
        print(json.dumps(result.__dict__, ensure_ascii=False, indent=2))
        return 0 if result.restauracion_verificada else 1
    if len(argv) in (2, 3) and argv[0] == "restaurar" and argv[2:] in ([], ["--reemplazar"]):
        print(json.dumps(restore_backup(Path(argv[1]), engine, replace=argv[2:] == ["--reemplazar"]), indent=2))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
