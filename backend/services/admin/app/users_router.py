"""Usuarios, roles, desbloqueo y configuración de la tienda (EP-44, EP-45 y EP-47)."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.shared.config import settings
from backend.shared.configuracion import get_section, set_section
from backend.shared.database import get_db
from backend.shared.models import (
    Administrador,
    BitacoraAuditoria,
    Cliente,
    IntentoLoginFallido,
    StaffSucursal,
    Sucursal,
    Usuario,
)
from backend.shared.security import clear_failed_logins, record_audit_event, require_roles

router = APIRouter(prefix="/api/v1/admin", tags=["Administración y Auditoría"])

ORDEN_ROLES = {"admin": 0, "staff": 1, "cliente": 2}
# Tarifas por zona de ShippingRepository.quote_by_zip (se muestran, no se editan aquí).
TARIFAS = [
    {"zona": "CP 01 a 16 y 50 a 57 (Centro de México)", "costo": Decimal("99.00"), "dias": "1 a 2"},
    {"zona": "CP 20 a 49 y 58 a 76", "costo": Decimal("149.00"), "dias": "2 a 3"},
    {"zona": "Resto del país", "costo": Decimal("199.00"), "dias": "4 a 5"},
]


class UserChange(BaseModel):
    """Rol y sucursal (el staff necesita una)."""

    tipo_usuario: str = Field(..., pattern="^(cliente|staff|admin)$")
    sucursal_id: uuid.UUID | None = None


class SettingsChange(BaseModel):
    """Secciones editables; solo se guardan las claves conocidas."""

    funciones: dict[str, bool] | None = None
    envios: dict[str, Any] | None = None
    seguridad: dict[str, int] | None = None


def _locked(db: Session, email: str) -> bool:
    ventana = datetime.now(timezone.utc) - timedelta(minutes=int(get_section(db, "seguridad")["minutos_bloqueo"]))
    intentos = db.query(IntentoLoginFallido).filter(IntentoLoginFallido.email == email, IntentoLoginFallido.fecha > ventana).count()
    return intentos >= int(get_section(db, "seguridad")["intentos_maximos"])


def _last_logins(db: Session) -> dict[str, datetime]:
    ultimos: dict[str, datetime] = {}
    for actor, fecha in (
        db.query(BitacoraAuditoria.actor_id, BitacoraAuditoria.fecha).filter(BitacoraAuditoria.tipo_evento == "user_login").all()
    ):
        if actor and (actor not in ultimos or fecha > ultimos[actor]):
            ultimos[actor] = fecha
    return ultimos


@router.get("/users")
def list_users(
    q: str | None = Query(default=None),
    rol: str | None = Query(default=None, pattern="^(cliente|staff|admin)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Usuarios por rol (admin, staff, cliente) y nombre, con último acceso y bloqueo."""
    texto = (q or "").strip().lower()
    ultimos = _last_logins(db)
    usuarios = [
        u for u in db.query(Usuario).all()
        if (not rol or u.tipo_usuario == rol) and (not texto or texto in f"{u.nombre} {u.email}".lower())
        and not u.email.endswith("@anon.ferremarket.local")
    ]
    usuarios.sort(key=lambda u: (ORDEN_ROLES.get(u.tipo_usuario, 3), u.nombre.lower()))
    start = (page - 1) * page_size
    items = [
        {
            "id": u.id,
            "nombre": u.nombre,
            "email": u.email,
            "tipo_usuario": u.tipo_usuario,
            "sucursal_id": u.staff_sucursal.sucursal_id if u.staff_sucursal else None,
            "sucursal_nombre": u.staff_sucursal.sucursal.nombre if u.staff_sucursal else None,
            "ultimo_acceso": ultimos.get(str(u.id)),
            "bloqueado": _locked(db, u.email),
            "es_yo": u.id == admin.id,
        }
        for u in usuarios[start : start + page_size]
    ]
    return {"page": page, "page_size": page_size, "total": len(usuarios), "items": items}


@router.patch("/users/{user_id}")
def change_user(
    user_id: uuid.UUID,
    payload: UserChange,
    admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Cambia rol y sucursal de otra persona (no el propio) y lo deja en la bitácora."""
    usuario = db.get(Usuario, user_id)
    if usuario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    if usuario.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail={"code": "self_change", "message": "No puedes cambiar tu propio rol."}
        )
    sucursal_id = payload.sucursal_id or (usuario.staff_sucursal.sucursal_id if usuario.staff_sucursal else None)
    if payload.tipo_usuario == "staff" and (sucursal_id is None or db.get(Sucursal, sucursal_id) is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[{"loc": ["body", "sucursal_id"], "msg": "El staff necesita una sucursal.", "type": "value_error"}],
        )
    anterior = usuario.tipo_usuario
    usuario.tipo_usuario = payload.tipo_usuario
    if usuario.staff_sucursal is not None and payload.tipo_usuario != "staff":
        db.delete(usuario.staff_sucursal)
    if payload.tipo_usuario == "staff" and sucursal_id is not None:
        if usuario.staff_sucursal is None:
            db.add(StaffSucursal(usuario_id=usuario.id, sucursal_id=sucursal_id))
        else:
            usuario.staff_sucursal.sucursal_id = sucursal_id
    if payload.tipo_usuario == "admin" and usuario.administrador is None:
        db.add(Administrador(usuario_id=usuario.id, rol="superadmin"))
    if usuario.administrador is not None and payload.tipo_usuario != "admin":
        db.delete(usuario.administrador)
    if usuario.cliente is None:
        db.add(Cliente(usuario_id=usuario.id))
    db.commit()
    record_audit_event(
        "role_change", str(admin.id), f"user:{usuario.id}",
        {"previous_role": anterior, "new_role": payload.tipo_usuario, "sucursal_id": str(sucursal_id or "")},
    )
    return {"id": usuario.id}


@router.post("/users/{user_id}/desbloquear")
def unlock_user(
    user_id: uuid.UUID, admin: Usuario = Depends(require_roles("admin")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Borra los intentos fallidos para que la persona pueda volver a entrar."""
    usuario = db.get(Usuario, user_id)
    if usuario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    clear_failed_logins(usuario.email)
    record_audit_event("account_unlocked", str(admin.id), f"user:{usuario.id}")
    return {"id": usuario.id}


def _settings(db: Session) -> dict[str, Any]:
    llave = settings.payment_api_key or ""
    return {
        "funciones": get_section(db, "funciones"),
        "pago": {
            "proveedor": settings.payment_provider or "Sin configurar",
            "modo": "sandbox" if settings.pasarela_sandbox else "vivo",
            # Solo los últimos 4 caracteres: la llave completa nunca sale del servidor (I6).
            "llave_pista": f"…{llave[-4:]}" if len(llave) >= 4 else "Sin llave",
        },
        "envios": {"tarifas": TARIFAS, **get_section(db, "envios")},
        "seguridad": get_section(db, "seguridad"),
    }


@router.get("/settings")
def get_settings(_admin: Usuario = Depends(require_roles("admin")), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Funciones activas, pasarela (llave enmascarada), envíos y seguridad."""
    return _settings(db)


@router.patch("/settings")
def change_settings(
    payload: SettingsChange, admin: Usuario = Depends(require_roles("admin")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Guarda las secciones enviadas; los valores de seguridad deben ser mayores a cero."""
    if payload.seguridad and any(v <= 0 for v in payload.seguridad.values()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[{"loc": ["body", "seguridad"], "msg": "Usa valores mayores a cero.", "type": "value_error"}],
        )
    for clave in ("funciones", "envios", "seguridad"):
        cambios = getattr(payload, clave)
        if cambios:
            set_section(db, clave, cambios)
            record_audit_event("settings_change", str(admin.id), f"settings:{clave}", {k: str(v) for k, v in cambios.items()})
    return _settings(db)
