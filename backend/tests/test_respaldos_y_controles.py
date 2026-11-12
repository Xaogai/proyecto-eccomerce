"""Respaldos cifrados 3-2-1, controles de la base de datos y ausencia de secretos en el código (sec. 14.4, 19, 20)."""

import json
from pathlib import Path
import re
import uuid

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from backend.shared import backups
from backend.shared.backups import BackupError, create_backup, decrypt, encrypt, restore_backup
from backend.shared.config import settings
from backend.shared.database import Base
from backend.shared.db_controls import apply_database_controls, controls_summary, password_problems
from backend.shared.models import Pedido, RespaldoBD, Usuario, Variante
from backend.tests.conftest import InProcessASGIClient

ADMIN = "admin.sintetico@ferremarket.local"
PASSWORD = "Sintetico2026!"
KEY = "llave-de-prueba-para-respaldos"
BACKEND = Path(__file__).resolve().parents[1]


def _admin(client: InProcessASGIClient) -> dict[str, str]:
    res = client.post("/api/v1/auth/login", json={"email": ADMIN, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture()
def backup_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    local, offsite = tmp_path / "local", tmp_path / "offsite"
    monkeypatch.setattr(settings, "backup_encryption_key", KEY)
    monkeypatch.setattr(settings, "backup_dir", str(local))
    monkeypatch.setattr(settings, "backup_offsite_dir", str(offsite))
    return local, offsite


def test_sin_llave_no_hay_respaldo(client: InProcessASGIClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "backup_encryption_key", "")
    res = client.post("/api/v1/admin/db-backup-321", headers=_admin(client))
    assert res.status_code == 503
    assert res.json()["detail"]["code"] == "backup_not_configured"
    assert client.post("/api/v1/admin/db-backup-321").status_code == 401


def test_respaldo_cifrado_con_dos_copias_y_restauracion_verificada(
    client: InProcessASGIClient, db_session: Session, backup_dirs: tuple[Path, Path]
) -> None:
    res = client.post("/api/v1/admin/db-backup-321", headers=_admin(client))
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["restauracion_verificada"] is True
    assert len(body["copias"]) == 2
    assert body["otro_medio"] is False and body["cumple_321"] is False, "las dos carpetas están en el mismo disco"

    local, offsite = backup_dirs
    files = list(local.glob("*.fmbak")) + list(offsite.glob("*.fmbak"))
    assert len(files) == 2 and files[0].read_bytes() == files[1].read_bytes()
    assert ADMIN.encode() not in files[0].read_bytes(), "el respaldo va cifrado"

    registro = db_session.get(RespaldoBD, uuid.UUID(body["registro_id"]))
    assert registro is not None and registro.algoritmo == "AES-256-GCM" and registro.huella_llave
    assert "mismo disco" in (registro.detalle or "")
    listado = client.get("/api/v1/admin/db-backups", headers=_admin(client)).json()
    assert listado[0]["sha256"] == body["sha256"]


def test_respaldo_alterado_o_con_otra_llave_no_se_descifra() -> None:
    envelope = encrypt(b'{"tablas": {}}', KEY)
    assert decrypt(envelope, KEY) == b'{"tablas": {}}'
    with pytest.raises(BackupError, match="llave"):
        decrypt(envelope, "otra-llave")
    tampered = envelope[:-1] + bytes([envelope[-1] ^ 1])
    with pytest.raises(BackupError, match="modificado"):
        decrypt(tampered, KEY)
    with pytest.raises(BackupError, match="no es un respaldo"):
        decrypt(b"cualquier cosa", KEY)


def test_restaurar_en_una_base_vacia(db_session: Session, backup_dirs: tuple[Path, Path], tmp_path: Path) -> None:
    result = create_backup(db_session.get_bind(), db=db_session)  # type: ignore[arg-type]
    target = create_engine(f"sqlite:///{tmp_path / 'restaurada.db'}")
    Base.metadata.create_all(target)
    restored = restore_backup(Path(result.copias[0]), target)
    with Session(target) as other:
        for model in (Usuario, Pedido, Variante):
            original = db_session.scalar(select(func.count()).select_from(model))
            assert other.scalar(select(func.count()).select_from(model)) == original == restored[model.__tablename__]
        ana = other.query(Usuario).filter(Usuario.email == "ana.torres.sintetica@ferremarket.local").one()
        assert ana.cliente is not None and len(ana.cliente.pedidos) > 0, "las relaciones quedan como estaban"
    with pytest.raises(BackupError, match="ya tiene datos"):
        restore_backup(Path(result.copias[0]), target)
    assert restore_backup(Path(result.copias[0]), target, replace=True) == restored
    target.dispose()


def test_linea_de_comandos(db_session: Session, backup_dirs: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch,
                           capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setattr("backend.shared.database.engine", db_session.get_bind())
    assert backups.main(["crear"]) == 0
    assert json.loads(capsys.readouterr().out)["restauracion_verificada"] is True
    assert backups.main([]) == 2


def test_controles_en_sqlite_se_omiten_y_el_resumen_es_honesto(db_session: Session) -> None:
    assert apply_database_controls(db_session.get_bind())["status"] == "omitido"  # type: ignore[arg-type]
    summary = controls_summary(db_session.connection())
    assert summary["controles_postgresql"] is False
    assert summary["respaldos"] == {"total": 0, "ultimo": None}


def test_politica_de_contrasenas_de_roles() -> None:
    assert password_problems("rol_x", "Segura-2026-larga") == []
    assert "al menos 12 caracteres" in password_problems("rol_x", "Ab1!")
    assert "no contener el nombre del rol" in password_problems("rol_x", "Rol_x-2026-Segura")


def test_reporte_separa_muestras_sinteticas(client: InProcessASGIClient) -> None:
    report = client.get("/api/v1/admin/data-quality-report", headers=_admin(client)).json()
    pagos = report["ae_39_audit_log_counts_by_sensitive_op"]["payment"]
    assert pagos["sinteticos"] >= 25
    assert report["ae_39_muestra_con_datos_sinteticos"] is True
    assert report["ae_39_sampling_25_per_op_compliant"] is False
    assert report["rq_dat_001_compliant"] is True and report["rq_dat_001_discrepancies"] == []


SECRET_PATTERNS = (
    re.compile(r"getenv\(\s*['\"][A-Z_]*(KEY|PASSWORD|SECRET|TOKEN)[A-Z_]*['\"]\s*,\s*['\"][^'\"]+['\"]"),
    re.compile(r"PASSWORD\s+'[^'{]+'", re.IGNORECASE),
    re.compile(r"(sk_live_[0-9a-zA-Z]{16,}|AKIA[0-9A-Z]{16}|BEGIN (RSA |EC )?PRIVATE KEY)"),
    re.compile(r"^\s*\w*(secret|password|_key)\w*\s*:\s*str\s*=\s*['\"][^'\"]+['\"]", re.IGNORECASE | re.MULTILINE),
)


def test_sin_secretos_en_el_codigo() -> None:
    """Sec. 14.4 / AE-19: ni llaves, ni contraseñas, ni valores por defecto para ellas en el código."""
    hits = []
    for path in BACKEND.rglob("*.py"):
        if "tests" in path.parts:
            continue
        source = path.read_text(encoding="utf-8")
        hits += [f"{path.relative_to(BACKEND)}: {m.group(0)[:60]}" for p in SECRET_PATTERNS for m in p.finditer(source)]
    assert hits == []


def test_openapi_al_dia() -> None:
    """El contrato publicado en la raíz coincide con los endpoints; si no: python -m backend.gateway.export_openapi."""
    from backend.gateway.export_openapi import OPENAPI_PATH, render
    from backend.gateway.main import app

    # Sin importar el fin de línea: en Windows, git puede escribir el archivo con CRLF.
    assert OPENAPI_PATH.read_text(encoding="utf-8").replace("\r\n", "\n") == render(app.openapi())
