"""Esquemas Pydantic para el microservicio de Pagos (PCI-DSS SAQ-A, RQ-SEG-002)."""

from decimal import Decimal
import uuid
from pydantic import BaseModel, ConfigDict, Field, model_validator


class PaymentCreateRequest(BaseModel):
    """Solicitud para procesar un pago tokenizado (prohíbe almacenar PAN/CVV conforme a RQ-SEG-002)."""

    pedido_id: uuid.UUID
    monto: Decimal = Field(..., gt=Decimal("0.00"))
    metodo: str = Field(default="tarjeta", max_length=30)
    provider: str = Field(default="stripe")
    payment_token: str = Field(default="tok_visa_sandbox")
    card_number: str | None = None
    cvv: str | None = None

    @model_validator(mode="after")
    def reject_raw_card_data(self) -> "PaymentCreateRequest":
        """Bloquea cualquier intento de enviar números de tarjeta o CVV (PCI-DSS RQ-SEG-002)."""
        if self.card_number or self.cvv:
            raise ValueError(
                "Prohibido enviar o almacenar datos sensibles de tarjeta (PAN/CVV) conforme a PCI-DSS (RQ-SEG-002)"
            )
        return self


class PaymentResponse(BaseModel):
    """Respuesta con el estado de un registro en la tabla `pagos`."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    pedido_id: uuid.UUID
    monto: Decimal
    metodo: str
    estado: str
    referencia_pasarela: str | None = None
