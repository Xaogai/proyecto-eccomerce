"""Mi cuenta: direcciones, lista de deseos, consentimientos y solicitudes ARCO del cliente autenticado."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import secrets
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.services.catalog.app.product_repository import ProductRepository
from backend.services.catalog.app.schemas import ProductDetailResponse
from backend.services.users.app.schemas import (
    AddressResponse,
    AddressUpdateRequest,
    ArcoRequest,
    ArcoResponse,
    ConsentsResponse,
    ConsentsUpdateRequest,
    WishlistAddRequest,
)
from backend.services.users.app.user_repository import UserRepository
from backend.shared.database import get_db
from backend.shared.models import ListaDeseos, Usuario, Variante
from backend.shared.notifications import send_email_notification
from backend.shared.security import get_current_user, record_audit_event

router = APIRouter(prefix="/api/v1/users/me", tags=["Autenticación y Cuentas"])

# LFPDPPP art. 32: 20 días hábiles para responder (aprox. 28 naturales).
ARCO_PLAZO_DIAS = 28


class WishlistItemResponse(BaseModel):
    """Producto guardado con el precio que tenía al guardarlo."""

    variante_sku: str
    precio_guardado: Decimal
    fecha: datetime
    producto: ProductDetailResponse


def get_user_repository(db: Session = Depends(get_db)) -> UserRepository:
    """Inyección de dependencias para UserRepository (Sec. 14.2)."""
    return UserRepository(db)


# ---------- Direcciones ----------


@router.patch("/addresses/{address_id}", response_model=AddressResponse)
def update_my_address(
    address_id: uuid.UUID,
    payload: AddressUpdateRequest,
    current_user: Usuario = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repository),
) -> Any:
    """Edita una dirección propia o la marca como principal."""
    direccion = repo.get_address(current_user.id, address_id)
    if direccion is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dirección no encontrada")
    return repo.update_address(direccion, payload.model_dump(exclude_unset=True))


@router.delete("/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_address(
    address_id: uuid.UUID,
    current_user: Usuario = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repository),
) -> None:
    """Borra una dirección propia."""
    direccion = repo.get_address(current_user.id, address_id)
    if direccion is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dirección no encontrada")
    repo.delete_address(direccion)


# ---------- Lista de deseos ----------


def _wishlist(db: Session, user_id: uuid.UUID) -> list[WishlistItemResponse]:
    """Lista de deseos con la ficha vigente de cada producto (los que dejaron de publicarse no aparecen)."""
    products = ProductRepository(db)
    rows = db.query(ListaDeseos).filter(ListaDeseos.usuario_id == user_id).order_by(ListaDeseos.fecha.desc()).all()
    items: list[WishlistItemResponse] = []
    for row in rows:
        product = products.get_by_sku(row.variante_sku)
        if product is not None:
            items.append(
                WishlistItemResponse(
                    variante_sku=row.variante_sku, precio_guardado=row.precio_guardado, fecha=row.fecha, producto=product
                )
            )
    return items


@router.get("/deseos", response_model=list[WishlistItemResponse])
def list_wishlist(current_user: Usuario = Depends(get_current_user), db: Session = Depends(get_db)) -> Any:
    """Productos guardados, los más recientes primero."""
    return _wishlist(db, current_user.id)


@router.post("/deseos", response_model=list[WishlistItemResponse], status_code=status.HTTP_201_CREATED)
def add_to_wishlist(
    payload: WishlistAddRequest,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """Guarda un producto con su precio de hoy (para avisar si baja)."""
    variante = db.get(Variante, payload.variante_sku)
    if variante is None or variante.producto.estado != "publicado":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    if db.get(ListaDeseos, (current_user.id, variante.sku)) is None:
        db.add(ListaDeseos(usuario_id=current_user.id, variante_sku=variante.sku, precio_guardado=variante.precio))
        db.commit()
    return _wishlist(db, current_user.id)


@router.delete("/deseos/{sku}", response_model=list[WishlistItemResponse])
def remove_from_wishlist(
    sku: str,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """Quita un producto de la lista (acepta cualquier SKU del producto guardado)."""
    variante = db.get(Variante, sku)
    skus = [v.sku for v in variante.producto.variantes] if variante else [sku]
    db.query(ListaDeseos).filter(ListaDeseos.usuario_id == current_user.id, ListaDeseos.variante_sku.in_(skus)).delete()
    db.commit()
    return _wishlist(db, current_user.id)


# ---------- Consentimientos y ARCO ----------


@router.patch("/consentimientos", response_model=ConsentsResponse)
def update_consents(
    payload: ConsentsUpdateRequest,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConsentsResponse:
    """Activa o retira los consentimientos opcionales; queda constancia en la bitácora."""
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    for key, value in changes.items():
        setattr(current_user, key, value)
    db.commit()
    record_audit_event("consent_change", str(current_user.id), f"user:{current_user.id}", changes)
    return ConsentsResponse(
        acepta_marketing=current_user.acepta_marketing, acepta_personalizacion=current_user.acepta_personalizacion
    )


@router.post("/solicitudes-arco", response_model=ArcoResponse, status_code=status.HTTP_201_CREATED)
def create_arco_request(
    payload: ArcoRequest,
    current_user: Usuario = Depends(get_current_user),
) -> ArcoResponse:
    """Registra la solicitud ARCO con folio y plazo de respuesta, y avisa al titular por correo."""
    folio = f"ARCO-{datetime.now(timezone.utc):%y%m}-{secrets.randbelow(9000) + 1000}"
    limite = datetime.now(timezone.utc) + timedelta(days=ARCO_PLAZO_DIAS)
    record_audit_event(
        "arco_request",
        str(current_user.id),
        f"user:{current_user.id}",
        {"folio": folio, "tipo": payload.tipo, "detalle": payload.detalle or "", "fecha_limite": limite.isoformat()},
    )
    send_email_notification(
        recipient_email=current_user.email,
        recipient_user_id=str(current_user.id),
        subject=f"Recibimos tu solicitud ARCO {folio}",
        body=f"Hola {current_user.nombre}, atenderemos tu solicitud de {payload.tipo} a más tardar el {limite:%d/%m/%Y}.",
        template_type="arco_request",
        metadata={"folio": folio},
    )
    return ArcoResponse(folio=folio, fecha_limite=limite)
