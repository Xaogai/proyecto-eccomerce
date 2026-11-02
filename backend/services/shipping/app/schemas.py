"""Esquemas Pydantic para el microservicio de Envíos y Logística (Sec. 13.1, HU-07)."""

from decimal import Decimal
import uuid
from pydantic import BaseModel, ConfigDict, Field


class BranchAvailabilityItem(BaseModel):
    """Sucursal disponible para recolección en tienda (HU-07)."""

    sucursal_id: uuid.UUID
    nombre: str
    stock_disponible: int


class ShippingQuoteResponse(BaseModel):
    """Respuesta de cotización de envío por código postal y opciones de recolección (Sec. 13.1, HU-07)."""

    codigo_postal: str
    costo_domicilio: Decimal
    costo_recoleccion_tienda: Decimal = Decimal("0.00")
    dias_estimados_entrega: int
    sucursales_disponibles: list[BranchAvailabilityItem]


class ShipmentStatusUpdateRequest(BaseModel):
    """Solicitud para actualizar el estado logístico de un envío (Anexo 1.3)."""

    estado: str = Field(..., pattern="^(pendiente|listo_para_envio|enviado|listo_para_recoleccion|entregado|incidencia)$")
    numero_guia: str | None = Field(default=None, max_length=50)


class ShipmentResponse(BaseModel):
    """Representación de un registro de la tabla `envios` (Anexo 3.16)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pedido_id: uuid.UUID
    tipo: str
    costo: Decimal
    numero_guia: str | None = None
    estado: str
    sucursal_recoleccion_id: uuid.UUID | None = None
