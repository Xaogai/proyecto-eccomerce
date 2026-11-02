"""Endpoints REST para el servicio de Carrito de Compras (Sec. 13.1, HU-04)."""

import uuid
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.services.cart.app.cart_repository import CartRepository
from backend.services.cart.app.schemas import (
    CartItemAddRequest,
    CartItemUpdateRequest,
    CartResponse,
)
from backend.shared.database import get_db
from backend.shared.models import Usuario
from backend.shared.security import get_optional_user

router = APIRouter(prefix="/api/v1", tags=["Carrito de Compras"])


def get_cart_repository(db: Session = Depends(get_db)) -> CartRepository:
    """Inyección de dependencias para CartRepository (Sec. 14.2)."""
    return CartRepository(db)


@router.post("/cart/items", response_model=CartResponse, status_code=status.HTTP_201_CREATED)
def add_item_to_cart(
    payload: CartItemAddRequest,
    x_cart_id: uuid.UUID | None = Header(default=None),
    current_user: Usuario | None = Depends(get_optional_user),
    repo: CartRepository = Depends(get_cart_repository),
) -> CartResponse:
    """
    Agrega un producto al carrito de compras para usuarios autenticados o invitados (Sec. 13.1, HU-04).
    """
    effective_cart_id = payload.carrito_id or x_cart_id
    cliente_id = current_user.id if current_user else None
    try:
        return repo.add_item(
            variante_sku=payload.variante_sku,
            cantidad=payload.cantidad,
            carrito_id=effective_cart_id,
            cliente_id=cliente_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/cart", response_model=CartResponse)
def get_cart_contents(
    cart_id: uuid.UUID | None = Query(default=None, description="ID del carrito para cliente invitado"),
    x_cart_id: uuid.UUID | None = Header(default=None),
    current_user: Usuario | None = Depends(get_optional_user),
    repo: CartRepository = Depends(get_cart_repository),
) -> CartResponse:
    """
    Obtiene el contenido actual del carrito con el total recalculado en tiempo real (Sec. 13.1, HU-04).
    """
    effective_cart_id = cart_id or x_cart_id
    cliente_id = current_user.id if current_user else None
    cart = repo.get_or_create_cart(carrito_id=effective_cart_id, cliente_id=cliente_id)
    return repo.build_cart_response(cart)


@router.patch("/cart/items/{sku}", response_model=CartResponse)
def update_cart_item_quantity(
    sku: str,
    payload: CartItemUpdateRequest,
    cart_id: uuid.UUID | None = Query(default=None),
    x_cart_id: uuid.UUID | None = Header(default=None),
    current_user: Usuario | None = Depends(get_optional_user),
    repo: CartRepository = Depends(get_cart_repository),
) -> CartResponse:
    """Actualiza la cantidad de un ítem en el carrito (`0` lo elimina) y recalcula el total (HU-04)."""
    effective_cart_id = payload.carrito_id or cart_id or x_cart_id
    cliente_id = current_user.id if current_user else None
    cart = repo.get_or_create_cart(carrito_id=effective_cart_id, cliente_id=cliente_id)
    try:
        updated = repo.update_item_quantity(cart.id, sku, payload.cantidad)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carrito no encontrado")
    return updated


@router.delete("/cart/items/{sku}", response_model=CartResponse)
def remove_cart_item(
    sku: str,
    cart_id: uuid.UUID | None = Query(default=None),
    x_cart_id: uuid.UUID | None = Header(default=None),
    current_user: Usuario | None = Depends(get_optional_user),
    repo: CartRepository = Depends(get_cart_repository),
) -> CartResponse:
    """Elimina un producto del carrito y recalcula el total (HU-04)."""
    effective_cart_id = cart_id or x_cart_id
    cliente_id = current_user.id if current_user else None
    cart = repo.get_or_create_cart(carrito_id=effective_cart_id, cliente_id=cliente_id)
    updated = repo.remove_item(cart.id, sku)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carrito no encontrado")
    return updated
