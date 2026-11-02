"""Esquemas Pydantic para el microservicio de Checkout y Pedidos (Sec. 13.1, HU-06, RQ-DAT-001)."""

from datetime import datetime
from decimal import Decimal
import uuid
from pydantic import BaseModel, ConfigDict, Field, model_validator


class CheckoutRequest(BaseModel):
    """Solicitud de inicio de checkout y generación de pedido (Sec. 13.1, Anexo 1.5)."""

    carrito_id: uuid.UUID
    sucursal_id: uuid.UUID
    tipo_envio: str = Field(default="domicilio", pattern="^(domicilio|recoleccion_tienda)$")
    codigo_postal: str | None = Field(default="50000")
    payment_provider: str = Field(default="stripe")
    payment_method: str = Field(default="tarjeta")
    payment_token: str = Field(default="tok_visa_sandbox")
    card_number: str | None = None
    cvv: str | None = None

    @model_validator(mode="after")
    def validate_pci_dss(self) -> "CheckoutRequest":
        """Garantiza que no se reciban ni almacenen datos de tarjeta en el checkout (RQ-SEG-002)."""
        if self.card_number or self.cvv:
            raise ValueError(
                "PCI-DSS (RQ-SEG-002): Prohibido enviar números de tarjeta o CVV al servidor propio; use payment_token"
            )
        return self


class OrderItemResponse(BaseModel):
    """Ítem de pedido con precio congelado al momento de la compra (Anexo 2.2.3, Sec. 19 Exactitud)."""

    model_config = ConfigDict(from_attributes=True)

    variante_sku: str
    cantidad: int
    precio_unitario_venta: Decimal
    subtotal: Decimal


class OrderResponse(BaseModel):
    """Respuesta completa de un pedido generado tras el checkout."""

    id: uuid.UUID
    cliente_id: uuid.UUID
    folio: str
    fecha: datetime
    estado: str
    total: Decimal
    items: list[OrderItemResponse]
    referencia_pasarela: str | None = None
    checkout_url: str | None = None
    tipo_envio: str = "domicilio"
    costo_envio: Decimal = Decimal("0.00")
    estado_envio: str = "pendiente"
    numero_guia: str | None = None


class PaymentWebhookRequest(BaseModel):
    """Payload de confirmación asíncrona de la pasarela de pago (Sec. 13.1, Anexo 1.5, AE-29)."""

    event_id: str = Field(..., min_length=3, max_length=100)
    referencia_pasarela: str = Field(..., min_length=3, max_length=100)
    status: str = Field(..., pattern="^(aprobado|rechazado|reembolsado)$")
