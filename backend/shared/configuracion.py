"""Configuración de la tienda guardada en la tabla `configuracion` (funciones activas, envíos y seguridad)."""

import copy
from typing import Any
from sqlalchemy.orm import Session

from backend.shared.config import settings
from backend.shared.database import operational_session
from backend.shared.models import Configuracion

DEFAULTS: dict[str, dict[str, Any]] = {
    # Funciones que el admin puede apagar sin desplegar.
    "funciones": {"v360": True, "calc": True, "cmp": True, "rev": True, "queue": False},
    "envios": {"envio_gratis_desde": "1500.00", "dias_devolucion": 30},
    # Los valores de arranque vienen de las variables de entorno; el admin puede ajustarlos después.
    "seguridad": {
        "intentos_maximos": settings.max_login_attempts,
        "minutos_bloqueo": settings.lockout_minutes,
        "minutos_sesion": settings.jwt_access_expires_min,
        "minutos_reserva": settings.reservation_ttl_minutes,
    },
}


def get_section(db: Session, clave: str) -> dict[str, Any]:
    """Valores guardados de la sección completados con los predeterminados."""
    stored = db.get(Configuracion, clave)
    values = copy.deepcopy(DEFAULTS.get(clave, {}))
    if stored is not None and isinstance(stored.valor, dict):
        values.update(stored.valor)
    return values


def set_section(db: Session, clave: str, cambios: dict[str, Any]) -> dict[str, Any]:
    """Guarda solo las claves conocidas de la sección y regresa la sección completa."""
    if clave not in DEFAULTS:
        raise ValueError(f"Sección de configuración desconocida: {clave}")
    values = get_section(db, clave)
    values.update({k: v for k, v in cambios.items() if k in DEFAULTS[clave]})
    stored = db.get(Configuracion, clave)
    if stored is None:
        db.add(Configuracion(clave=clave, valor=values))
    else:
        stored.valor = values
    db.commit()
    return values


def security_value(clave: str) -> int:
    """Valor vigente de seguridad (intentos, bloqueo, sesión o reserva) para el código sin sesión de petición."""
    with operational_session() as session:
        return int(get_section(session, "seguridad")[clave])
