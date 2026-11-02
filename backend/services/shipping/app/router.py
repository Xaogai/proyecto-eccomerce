"""Endpoints REST del microservicio de Envíos y Logística (Sec. 13.1, HU-07)."""

from typing import Any
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.services.shipping.app.schemas import (
    ShipmentResponse,
    ShipmentStatusUpdateRequest,
    ShippingQuoteResponse,
)
from backend.services.shipping.app.shipping_repository import ShippingRepository
from backend.shared.database import get_db
from backend.shared.models import Pedido, Usuario
from backend.shared.notifications import send_email_notification
from backend.shared.security import record_audit_event, require_roles

router = APIRouter(prefix="/api/v1", tags=["Envíos y Logística"])


def get_shipping_repository(db: Session = Depends(get_db)) -> ShippingRepository:
    """Inyección de dependencias para ShippingRepository (Sec. 14.2)."""
    return ShippingRepository(db)


@router.get("/shipping/quote", response_model=ShippingQuoteResponse)
def get_shipping_quote(
    zip_code: str = Query(..., alias="zip", description="Código postal de 5 dígitos"),
    sku: str | None = Query(default=None, description="SKU opcional para verificar stock en tienda"),
    repo: ShippingRepository = Depends(get_shipping_repository),
) -> ShippingQuoteResponse:
    """
    Calcula el costo de envío según código postal y lista sucursales con stock disponible (Sec. 13.1, HU-07).
    """
    try:
        return repo.quote_by_zip(zip_code=zip_code, sku=sku)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/shipments", response_model=list[ShipmentResponse])
def list_shipments(
    _staff_or_admin: Usuario = Depends(require_roles("admin", "staff")),
    repo: ShippingRepository = Depends(get_shipping_repository),
) -> Any:
    """Lista todos los envíos registrados para seguimiento operativo (staff y admin)."""
    return repo.list_all()


@router.get("/shipments/{pedido_id}", response_model=ShipmentResponse)
def get_shipment_by_order(
    pedido_id: uuid.UUID,
    repo: ShippingRepository = Depends(get_shipping_repository),
) -> Any:
    """Consulta la información logística y de seguimiento de un pedido."""
    envio = repo.get_by_order(pedido_id)
    if not envio:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Envío no encontrado para este pedido")
    return envio


@router.patch("/shipments/{shipment_id}/status", response_model=ShipmentResponse)
def update_shipment_status(
    shipment_id: uuid.UUID,
    payload: ShipmentStatusUpdateRequest,
    staff_or_admin: Usuario = Depends(require_roles("admin", "staff")),
    repo: ShippingRepository = Depends(get_shipping_repository),
) -> Any:
    """Actualiza el estado de un envío o recolección en tienda y notifica al cliente (HU-07, HU-10)."""
    envio = repo.update_status(shipment_id, payload.estado, payload.numero_guia)
    if not envio:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Envío no encontrado")
    record_audit_event(
        "shipment_status_change",
        str(staff_or_admin.id),
        f"shipment:{shipment_id}",
        {"new_status": payload.estado, "numero_guia": payload.numero_guia},
    )
    pedido = repo.db.query(Pedido).filter(Pedido.id == envio.pedido_id).first()
    if pedido:
        usuario = repo.db.query(Usuario).filter(Usuario.id == pedido.cliente_id).first()
        if usuario:
            guia_info = f" Número de guía: {envio.numero_guia}." if envio.numero_guia else ""
            send_email_notification(
                recipient_email=usuario.email,
                recipient_user_id=str(usuario.id),
                subject=f"Actualización de envío Ferremarket — Folio {pedido.folio} ({envio.estado})",
                body=(
                    f"Hola {usuario.nombre}, el estado logístico de tu pedido {pedido.folio} "
                    f"ha cambiado a '{envio.estado}'.{guia_info}"
                ),
                template_type="shipment_status",
                metadata={
                    "folio": pedido.folio,
                    "pedido_id": str(pedido.id),
                    "shipment_id": str(envio.id),
                    "estado": envio.estado,
                    "numero_guia": envio.numero_guia,
                },
            )
    return envio
