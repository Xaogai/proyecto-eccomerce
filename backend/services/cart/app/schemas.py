"""Esquemas Pydantic para el microservicio de Carrito de Compras (HU-04, Anexo 2.2.2)."""

from datetime import datetime
from decimal import Decimal
from typing import Any
import uuid
from pydantic import BaseModel, Field

MAX_CART_ITEMS = 50


class CartItemAddRequest(BaseModel):
    """Solicitud para agregar o actualizar una variante en el carrito (Sec. 13.1, HU-04)."""

    carrito_id: uuid.UUID | None = None
    variante_sku: str = Field(..., min_length=1, max_length=50)
    cantidad: int = Field(..., gt=0, le=MAX_CART_ITEMS)


class CartMergeRequest(BaseModel):
    """Carrito de invitado que pasa a la cuenta al iniciar sesión."""

    carrito_invitado_id: uuid.UUID


class CartItemUpdateRequest(BaseModel):
    """Solicitud para fijar la cantidad exacta de un ítem en el carrito (0 elimina el ítem)."""

    carrito_id: uuid.UUID | None = None
    cantidad: int = Field(..., ge=0, le=MAX_CART_ITEMS)


class CartItemDetailResponse(BaseModel):
    """Detalle de ítem en carrito con precio vigente calculado en tiempo real (2FN - Anexo 2.2.2)."""

    variante_sku: str
    nombre_producto: str
    cantidad: int
    precio_unitario_vigente: Decimal
    subtotal: Decimal
    imagen_url: str | None = None
    atributos: dict[str, Any] = Field(default_factory=dict)
    producto_sku: str | None = Field(default=None, description="SKU con el que se abre la ficha del producto")
    stock_disponible: int = 0
    stock_sucursal: int | None = Field(default=None, description="Piezas en la sucursal pedida con sucursal_id")


class CartResponse(BaseModel):
    """Contenido actual del carrito y su total calculado en tiempo real (Sec. 13.1, HU-04)."""

    id: uuid.UUID
    cliente_id: uuid.UUID | None = None
    fecha_creacion: datetime
    estado: str
    items: list[CartItemDetailResponse]
    total: Decimal
