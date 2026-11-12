"""Auditoría del admin: bitácora, calidad de datos, respaldos cifrados y datos sintéticos (Sec. 19, 20, 29.6)."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from backend.services.admin.app.data_quality import data_quality_report
from backend.shared.backups import BackupError, BackupNotConfigured, create_backup
from backend.shared.database import get_db
from backend.shared.db_controls import apply_database_controls
from backend.shared.migrations import upgrade_database
from backend.shared.models import RespaldoBD, Usuario
from backend.shared.security import get_audit_logs, record_audit_event, require_roles
from backend.shared.seed import seed_synthetic_data

router = APIRouter(prefix="/api/v1/admin", tags=["Administración y Auditoría"])


def _engine(db: Session) -> Engine:
    bind = db.get_bind()
    return bind if isinstance(bind, Engine) else bind.engine


@router.get("/audit-logs")
def read_audit_logs(
    event_type: str | None = Query(default=None, description="Filtrar por tipo de evento sensible"),
    _admin: Usuario = Depends(require_roles("admin")),
) -> list[dict[str, Any]]:
    """Bitácora de operaciones sensibles: pagos, cambios de precio, stock, rol y accesos (Sec. 29.6, AE-39)."""
    return get_audit_logs(event_type=event_type)


@router.get("/data-quality-report")
def verify_data_quality(
    _admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Conciliación de pedidos, 2FN, PCI-DSS, muestreo de bitácora y estado de los controles de la base."""
    return data_quality_report(db)


@router.post("/db-backup-321", status_code=status.HTTP_201_CREATED)
def trigger_backup(
    admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Genera un respaldo cifrado (AES-256-GCM), lo copia a los medios configurados y prueba restaurarlo.

    Raises:
        HTTPException 503: falta `BACKUP_ENCRYPTION_KEY`.
        HTTPException 500: la copia escrita no se pudo descifrar o restaurar.
    """
    try:
        result = create_backup(_engine(db), db=db, requested_by=str(admin.id))
    except BackupNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "backup_not_configured", "message": str(exc)},
        ) from exc
    except BackupError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "backup_failed", "message": str(exc)},
        ) from exc
    record_audit_event("db_backup", str(admin.id), f"backup:{result.archivo}", {"sha256": result.sha256})
    return result.__dict__


@router.get("/db-backups")
def list_backups(
    _admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Últimos 50 respaldos con su resultado de restauración (lo más reciente primero)."""
    rows = db.query(RespaldoBD).order_by(RespaldoBD.fecha.desc()).limit(50).all()
    return [
        {
            "id": str(r.id),
            "fecha": r.fecha.isoformat(),
            "solicitado_por": r.solicitado_por,
            "motor": r.motor,
            "algoritmo": r.algoritmo,
            "huella_llave": r.huella_llave,
            "tamano_bytes": r.tamano_bytes,
            "sha256": r.sha256,
            "tablas": r.tablas,
            "filas": r.filas,
            "copias": r.copias,
            "restauracion_verificada": r.restauracion_verificada,
            "detalle": r.detalle,
        }
        for r in rows
    ]


@router.post("/seed-synthetic")
def trigger_synthetic_seed(
    _admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Aplica las migraciones y genera los datos sintéticos de prueba (Sec. 20, AE-26)."""
    engine = _engine(db)
    upgrade_database(engine)
    result = seed_synthetic_data(db)
    result["controles_bd"] = apply_database_controls(engine)
    return result
