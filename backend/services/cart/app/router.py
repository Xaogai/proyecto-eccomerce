"""Endpoints REST para el servicio de Carrito de Compras (Sec. 13.1, HU-04)."""

import uuid
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.services.cart.app.cart_repository import CartRepository, OutOfStockError
from backend.services.cart.app.schemas import (
    CartItemAddRequest,
    CartItemUpdateRequest,
    CartMergeRequest,
    CartResponse,
)
from backend.shared.database import get_db
from backend.shared.models import Usuario
from backend.shared.security import get_current_user, get_optional_user

router = APIRouter(prefix="/api/v1", tags=["Carrito de Compras"])

SUCURSAL_QUERY = Query(default=None, description="Sucursal para informar el stock de cada producto en ella")


def get_cart_repository(db: Session = Depends(get_db)) -> CartRepository:
    """Inyección de dependencias para CartRepository (Sec. 14.2)."""
    return CartRepository(db)


def _out_of_stock(exc: OutOfStockError) -> HTTPException:
    """409 con el código que entiende el frontend y cuántas piezas quedan."""
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "out_of_stock", "message": str(exc), "disponibles": exc.disponibles},
    )


@router.post("/cart/items", response_model=CartResponse, status_code=status.HTTP_201_CREATED)
def add_item_to_cart(
    payload: CartItemAddRequest,
    sucursal_id: uuid.UUID | None = SUCURSAL_QUERY,
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
        cart = repo.add_item(
            variante_sku=payload.variante_sku,
            cantidad=payload.cantidad,
            carrito_id=effective_cart_id,
            cliente_id=cliente_id,
        )
    except OutOfStockError as exc:
        raise _out_of_stock(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if sucursal_id is None:
        return cart
    return repo.build_cart_response(repo.get_or_create_cart(cart.id, cliente_id), sucursal_id)


@router.get("/cart", response_model=CartResponse)
def get_cart_contents(
    cart_id: uuid.UUID | None = Query(default=None, description="ID del carrito para cliente invitado"),
    sucursal_id: uuid.UUID | None = SUCURSAL_QUERY,
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
    return repo.build_cart_response(cart, sucursal_id)


@router.post("/cart/merge", response_model=CartResponse)
def merge_guest_cart(
    payload: CartMergeRequest,
    current_user: Usuario = Depends(get_current_user),
    repo: CartRepository = Depends(get_cart_repository),
) -> CartResponse:
    """Al iniciar sesión, lo que el invitado puso en su carrito pasa al carrito de la cuenta."""
    return repo.merge_guest_cart(payload.carrito_invitado_id, current_user.id)


@router.patch("/cart/items/{sku}", response_model=CartResponse)
def update_cart_item_quantity(
    sku: str,
    payload: CartItemUpdateRequest,
    cart_id: uuid.UUID | None = Query(default=None),
    sucursal_id: uuid.UUID | None = SUCURSAL_QUERY,
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
    except OutOfStockError as exc:
        raise _out_of_stock(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Carrito no encontrado")
    return updated if sucursal_id is None else repo.build_cart_response(cart, sucursal_id)


@router.delete("/cart/items/{sku}", response_model=CartResponse)
def remove_cart_item(
    sku: str,
    cart_id: uuid.UUID | None = Query(default=None),
    sucursal_id: uuid.UUID | None = SUCURSAL_QUERY,
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
    return updated if sucursal_id is None else repo.build_cart_response(cart, sucursal_id)
