"""Esquemas Pydantic para el microservicio de Inventario y Sucursales."""

from datetime import datetime
import uuid
from pydantic import BaseModel, ConfigDict, Field


class BranchCreateRequest(BaseModel):
    """Solicitud para dar de alta una sucursal física."""

    nombre: str = Field(..., min_length=2, max_length=100)
    direccion_id: uuid.UUID | None = None


class BranchResponse(BaseModel):
    """Respuesta con información de sucursal."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    direccion_id: uuid.UUID | None = None
    calle: str | None = None
    ciudad: str | None = None
    codigo_postal: str | None = None
    telefono: str | None = None
    horario: str | None = None
    latitud: float | None = None
    longitud: float | None = None
    servicios: list[str] = Field(default_factory=list)


class StockReservationRequest(BaseModel):
    """Solicitud de reserva temporal de inventario (Sec. 13.1, HU-05, RQ-DISP-001)."""

    sku: str = Field(..., min_length=1, max_length=50)
    branch_id: uuid.UUID
    quantity: int = Field(..., gt=0)
    idempotency_key: str | None = None


class ReservationResponse(BaseModel):
    """Respuesta de reserva temporal con expiración de 15 minutos (HU-05)."""

    reservation_id: str
    sku: str
    branch_id: uuid.UUID
    quantity: int
    status: str
    expires_at: datetime


class StockReleaseRequest(BaseModel):
    """Solicitud para liberar una reserva temporal de inventario."""

    reservation_id: str


class StockUpdateRequest(BaseModel):
    """Solicitud de ajuste de inventario por personal de sucursal o administrador."""

    sucursal_id: uuid.UUID
    variante_sku: str = Field(..., min_length=1, max_length=50)
    cantidad_disponible: int = Field(..., ge=0)


class BranchStockResponse(BaseModel):
    """Existencias de un SKU en una sucursal determinada."""

    sucursal_id: uuid.UUID
    sucursal_nombre: str
    variante_sku: str
    cantidad_disponible: int
    cantidad_reservada: int
