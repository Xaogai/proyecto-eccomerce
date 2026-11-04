"""Esquemas Pydantic para el microservicio de Checkout y Pedidos (Sec. 13.1, HU-06, RQ-DAT-001)."""

from datetime import datetime
from decimal import Decimal
import uuid
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, model_validator


class DeliveryAddressInput(BaseModel):
    """Dirección de entrega escrita en el checkout (sin guardarla en la libreta)."""

    calle: str = Field(..., min_length=2, max_length=200)
    numero_exterior: str = Field(..., min_length=1, max_length=20)
    numero_interior: str | None = Field(default=None, max_length=20)
    colonia: str = Field(..., min_length=2, max_length=100)
    codigo_postal: str = Field(..., pattern=r"^\d{5}$")
    ciudad: str = Field(..., min_length=2, max_length=100)
    entidad: str = Field(..., min_length=2, max_length=100)
    referencias: str | None = Field(default=None, max_length=300)


class CheckoutRequest(BaseModel):
    """Solicitud de inicio de checkout y generación de pedido (Sec. 13.1, Anexo 1.5)."""

    carrito_id: uuid.UUID
    sucursal_id: uuid.UUID | None = Field(
        default=None, description="Sucursal de recolección; en envío, la que surte (si falta, una con todo el pedido)"
    )
    tipo_envio: str = Field(default="domicilio", pattern="^(domicilio|recoleccion_tienda)$")
    codigo_postal: str | None = Field(default="50000")
    direccion_id: uuid.UUID | None = Field(default=None, description="Dirección guardada del cliente")
    direccion: DeliveryAddressInput | None = None
    telefono_contacto: str | None = Field(default=None, max_length=20)
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
        if self.tipo_envio == "recoleccion_tienda" and self.sucursal_id is None:
            raise ValueError("Elige la sucursal donde vas a recoger")
        return self


class OrderItemResponse(BaseModel):
    """Ítem de pedido con precio congelado al momento de la compra (Anexo 2.2.3, Sec. 19 Exactitud)."""

    model_config = ConfigDict(from_attributes=True)

    variante_sku: str
    cantidad: int
    precio_unitario_venta: Decimal
    subtotal: Decimal
    nombre_producto: str | None = None
    atributos: dict[str, Any] = Field(default_factory=dict)
    imagen_url: str | None = None
    producto_sku: str | None = None


class OrderHistoryItem(BaseModel):
    """Cambio de estado del pedido."""

    estado: str
    fecha: datetime
    actor: str = "Sistema"
    nota: str | None = None


class OrderContact(BaseModel):
    """Datos de contacto del cliente."""

    nombre: str
    email: str
    telefono: str | None = None


class OrderReturnSummary(BaseModel):
    """Devolución solicitada de un pedido."""

    id: uuid.UUID
    folio: str
    estado: str
    fecha: datetime
    monto_reembolso: Decimal


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
    estado_pago: str | None = None
    metodo_pago: str | None = None
    total_con_envio: Decimal = Decimal("0.00")
    contacto: OrderContact | None = None
    direccion_entrega: str | None = None
    sucursal_id: uuid.UUID | None = None
    sucursal_nombre: str | None = None
    codigo_recoleccion: str | None = None
    historial: list[OrderHistoryItem] = Field(default_factory=list)
    devoluciones: list[OrderReturnSummary] = Field(default_factory=list)
    fecha_entrega: datetime | None = None


class PaymentRetryResponse(BaseModel):
    """Nueva intención de pago para un pedido con pago rechazado."""

    checkout_url: str
    referencia_pasarela: str


class PaymentWebhookRequest(BaseModel):
    """Payload de confirmación asíncrona de la pasarela de pago (Sec. 13.1, Anexo 1.5, AE-29)."""

    event_id: str = Field(..., min_length=3, max_length=100)
    referencia_pasarela: str = Field(..., min_length=3, max_length=100)
    status: str = Field(..., pattern="^(aprobado|rechazado|reembolsado)$")
