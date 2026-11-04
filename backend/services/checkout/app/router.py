"""Endpoints REST del microservicio de Checkout y Pedidos (Sec. 13.1, HU-06, AE-29, AE-31)."""

from typing import Any
import uuid
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.services.checkout.app.order_repository import OrderRepository
from backend.services.checkout.app.schemas import (
    CheckoutRequest,
    OrderResponse,
    PaymentRetryResponse,
    PaymentWebhookRequest,
)
from backend.services.inventory.app.inventory_repository import InsufficientStockError
from backend.services.payments.app.gateway_factory import verify_webhook_signature
from backend.shared.database import get_db
from backend.shared.models import Usuario
from backend.shared.security import get_current_user, record_audit_event

router = APIRouter(prefix="/api/v1", tags=["Checkout y Pedidos"])


def get_order_repository(db: Session = Depends(get_db)) -> OrderRepository:
    """Inyección de dependencias para OrderRepository (Sec. 14.2)."""
    return OrderRepository(db)


@router.post("/checkout", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def process_checkout(
    payload: CheckoutRequest,
    current_user: Usuario = Depends(get_current_user),
    repo: OrderRepository = Depends(get_order_repository),
) -> OrderResponse:
    """
    Inicia el proceso de pago, reserva stock temporalmente y genera el pedido (Sec. 13.1, HU-06, RQ-DAT-001).
    """
    try:
        return repo.create_checkout_order(cliente_id=current_user.id, payload=payload)
    except InsufficientStockError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "out_of_stock", "message": "Algunos productos ya no tienen stock suficiente."},
        ) from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/webhooks/payment")
async def payment_webhook(
    request: Request,
    payload: PaymentWebhookRequest,
    x_webhook_signature: str | None = Header(default=None),
    repo: OrderRepository = Depends(get_order_repository),
) -> dict[str, Any]:
    """
    Recibe la confirmación asíncrona de la pasarela de pago con idempotencia (Sec. 13.1, Anexo 1.5, AE-29).
    """
    # La firma es obligatoria: sin ella cualquiera podía marcar un pedido como pagado.
    raw_body = await request.body()
    if not x_webhook_signature or not verify_webhook_signature(raw_body, x_webhook_signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firma criptográfica del webhook inválida",
        )
    try:
        return repo.handle_payment_webhook(
            event_id=payload.event_id,
            referencia_pasarela=payload.referencia_pasarela,
            payment_status=payload.status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/orders", response_model=list[OrderResponse])
def list_orders(
    current_user: Usuario = Depends(get_current_user),
    repo: OrderRepository = Depends(get_order_repository),
) -> list[OrderResponse]:
    """Lista el historial de pedidos del cliente autenticado (o todos si es administrador)."""
    is_admin = current_user.tipo_usuario == "admin"
    return repo.list_orders_for_user(current_user.id, is_admin=is_admin)


@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order_detail(
    order_id: uuid.UUID,
    current_user: Usuario = Depends(get_current_user),
    repo: OrderRepository = Depends(get_order_repository),
) -> OrderResponse:
    """
    Obtiene el detalle de un pedido protegiendo contra acceso no autorizado a pedidos ajenos (IDOR - Sec. 25.1, AE-31).
    """
    pedido = repo.get_order_by_id(order_id)
    if not pedido:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado")
    if current_user.tipo_usuario != "admin" and pedido.cliente_id != current_user.id:
        record_audit_event(
            "idor_attempt_blocked",
            str(current_user.id),
            f"order:{order_id}",
            {"owner_id": str(pedido.cliente_id)},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene autorización para consultar pedidos de otro usuario",
        )
    return repo._serialize_order(pedido)


@router.post("/orders/{order_id}/pago/reintentar", response_model=PaymentRetryResponse)
def retry_order_payment(
    order_id: uuid.UUID,
    current_user: Usuario = Depends(get_current_user),
    repo: OrderRepository = Depends(get_order_repository),
) -> PaymentRetryResponse:
    """Nueva intención de pago para un pedido propio con pago rechazado (vuelve a apartar el stock)."""
    pedido = repo.get_order_by_id(order_id)
    if not pedido or pedido.cliente_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado")
    try:
        result = repo.retry_payment(pedido)
    except InsufficientStockError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "out_of_stock", "message": "Algunos productos ya no tienen stock suficiente."},
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail={"code": "not_retryable", "message": str(exc)}
        ) from exc
    return PaymentRetryResponse(checkout_url=result.checkout_url, referencia_pasarela=result.reference_id)


@router.post("/orders/{order_id}/cancel", response_model=OrderResponse)
def cancel_user_order(
    order_id: uuid.UUID,
    current_user: Usuario = Depends(get_current_user),
    repo: OrderRepository = Depends(get_order_repository),
) -> OrderResponse:
    """Permite al cliente propietario o a un administrador cancelar un pedido antes de su entrega (HU-06)."""
    pedido = repo.get_order_by_id(order_id)
    if not pedido:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado")
    if current_user.tipo_usuario != "admin" and pedido.cliente_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene autorización para cancelar pedidos de otro usuario",
        )
    try:
        return repo.cancel_order(order_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
