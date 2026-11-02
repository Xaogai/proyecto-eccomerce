"""Endpoints REST del microservicio de Pagos (`payments`)."""

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.services.payments.app.gateway_factory import (
    PaymentGatewayFactory,
    circuit_breaker,
    compute_webhook_signature,
)
from backend.services.payments.app.payment_repository import PaymentRepository
from backend.services.payments.app.schemas import PaymentCreateRequest, PaymentResponse
from backend.shared.database import get_db
from backend.shared.models import Pedido, Usuario
from backend.shared.security import get_current_user, record_audit_event

router = APIRouter(prefix="/api/v1", tags=["Pagos"])


@router.post("/payments/webhook-sign")
async def sign_sandbox_webhook_payload(
    request: Request,
    _current_user: Usuario = Depends(get_current_user),
) -> dict[str, str]:
    """
    Genera la firma HMAC-SHA256 (`X-Webhook-Signature`) para el simulador Sandbox de pasarela (Sec. 14.2, AE-29).
    """
    raw_body = await request.body()
    return {"signature": compute_webhook_signature(raw_body)}


def get_payment_repository(db: Session = Depends(get_db)) -> PaymentRepository:
    """Inyección de dependencias para PaymentRepository (Sec. 14.2)."""
    return PaymentRepository(db)


@router.post("/payments", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
def process_tokenized_payment(
    payload: PaymentCreateRequest,
    current_user: Usuario = Depends(get_current_user),
    repo: PaymentRepository = Depends(get_payment_repository),
) -> Any:
    """
    Inicia un pago tokenizado mediante `PaymentGatewayFactory` (Sec. 14.2, RQ-SEG-002).
    """
    if circuit_breaker.state == "OPEN":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Circuit breaker abierto: el proveedor de pagos se encuentra temporalmente degradado",
        )
    pedido = repo.db.query(Pedido).filter(Pedido.id == payload.pedido_id).first()
    if not pedido:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado")

    try:
        gateway = PaymentGatewayFactory.create(payload.provider)
        charge = gateway.create_payment_intent(
            order_folio=pedido.folio,
            amount=payload.monto,
            payment_token=payload.payment_token,
        )
        circuit_breaker.record_success()
    except TimeoutError as exc:
        circuit_breaker.record_failure()
        circuit_breaker.pending_queue.append({"pedido_id": str(pedido.id), "folio": pedido.folio})
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Timeout en pasarela de pagos; evento encolado para reintento: {exc}",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    pago = repo.create_payment(
        pedido_id=pedido.id,
        monto=payload.monto,
        metodo=payload.metodo,
        estado=charge.status,
        referencia_pasarela=charge.reference_id,
    )
    record_audit_event(
        "payment",
        str(current_user.id),
        f"payment:{pago.id}",
        {"pedido_id": str(pedido.id), "monto": str(payload.monto), "estado": charge.status},
    )
    return pago
