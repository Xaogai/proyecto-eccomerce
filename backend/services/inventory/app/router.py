"""Endpoints REST para el servicio de Inventario y Sucursales (Sec. 13.1, HU-05, RQ-DISP-001)."""

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.services.inventory.app.inventory_repository import (
    InsufficientStockError,
    InventoryRepository,
)
from backend.services.inventory.app.schemas import (
    BranchCreateRequest,
    BranchResponse,
    BranchStockResponse,
    ReservationResponse,
    StockReleaseRequest,
    StockReservationRequest,
    StockUpdateRequest,
)
from backend.shared.database import get_db
from backend.shared.models import Sucursal, Usuario
from backend.shared.security import record_audit_event, require_roles

router = APIRouter(prefix="/api/v1", tags=["Inventario y Sucursales"])


def get_inventory_repository(db: Session = Depends(get_db)) -> InventoryRepository:
    """Inyección de dependencias para InventoryRepository (Sec. 14.2)."""
    return InventoryRepository(db)


def branch_response(branch: Sucursal) -> BranchResponse:
    """Sucursal con su dirección, teléfono, horario, ubicación y servicios."""
    direccion = branch.direccion
    return BranchResponse(
        id=branch.id,
        nombre=branch.nombre,
        direccion_id=branch.direccion_id,
        calle=direccion.calle if direccion else None,
        ciudad=direccion.ciudad if direccion else None,
        codigo_postal=direccion.codigo_postal if direccion else None,
        telefono=branch.telefono,
        horario=branch.horario,
        latitud=float(branch.latitud) if branch.latitud is not None else None,
        longitud=float(branch.longitud) if branch.longitud is not None else None,
        servicios=list(branch.servicios or []),
    )


@router.get("/branches", response_model=list[BranchResponse])
def list_branches(
    repo: InventoryRepository = Depends(get_inventory_repository),
) -> list[BranchResponse]:
    """Lista las sucursales disponibles para consulta de stock o recolección en tienda."""
    return [branch_response(b) for b in repo.list_branches()]


@router.post("/branches", response_model=BranchResponse, status_code=status.HTTP_201_CREATED)
def create_branch(
    payload: BranchCreateRequest,
    admin_user: Usuario = Depends(require_roles("admin")),
    repo: InventoryRepository = Depends(get_inventory_repository),
) -> Any:
    """Crea una nueva sucursal física (restringido a administradores)."""
    branch = repo.create_branch(payload.nombre, payload.direccion_id)
    record_audit_event("branch_created", str(admin_user.id), f"branch:{branch.id}", {"nombre": branch.nombre})
    return branch_response(branch)


@router.get("/inventory/{sku}", response_model=list[BranchStockResponse])
def get_inventory_for_sku(
    sku: str,
    repo: InventoryRepository = Depends(get_inventory_repository),
) -> list[BranchStockResponse]:
    """Consulta las existencias disponibles y reservadas de un SKU por sucursal."""
    records = repo.get_stock_by_sku(sku)
    return [
        BranchStockResponse(
            sucursal_id=rec.sucursal_id,
            sucursal_nombre=rec.sucursal.nombre if rec.sucursal else "Sucursal",
            variante_sku=rec.variante_sku,
            cantidad_disponible=rec.cantidad_disponible,
            cantidad_reservada=rec.cantidad_reservada,
        )
        for rec in records
    ]


@router.put("/inventory/stock", response_model=BranchStockResponse)
def update_branch_stock(
    payload: StockUpdateRequest,
    staff_or_admin: Usuario = Depends(require_roles("admin", "staff")),
    repo: InventoryRepository = Depends(get_inventory_repository),
) -> BranchStockResponse:
    """
    Actualiza el stock disponible de un SKU en una sucursal y registra el cambio en bitácora.
    """
    inv, previous_qty = repo.set_stock(
        sucursal_id=payload.sucursal_id,
        variante_sku=payload.variante_sku,
        cantidad_disponible=payload.cantidad_disponible,
    )
    record_audit_event(
        "stock_change",
        str(staff_or_admin.id),
        f"inventory:{payload.sucursal_id}:{payload.variante_sku}",
        {"previous_quantity": previous_qty, "new_quantity": payload.cantidad_disponible},
    )
    return BranchStockResponse(
        sucursal_id=inv.sucursal_id,
        sucursal_nombre=inv.sucursal.nombre if inv.sucursal else "Sucursal",
        variante_sku=inv.variante_sku,
        cantidad_disponible=inv.cantidad_disponible,
        cantidad_reservada=inv.cantidad_reservada,
    )


@router.post("/inventory/reserve", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
def reserve_inventory_stock(
    payload: StockReservationRequest,
    repo: InventoryRepository = Depends(get_inventory_repository),
) -> ReservationResponse:
    """
    Reserva temporalmente stock para un SKU y sucursal (Sec. 13.1, HU-05, RQ-DISP-001).
    La reserva expira automáticamente a los 15 minutos si no se confirma el checkout.
    """
    try:
        rec = repo.reserve_stock(
            sku=payload.sku,
            branch_id=payload.branch_id,
            quantity=payload.quantity,
            idempotency_key=payload.idempotency_key,
        )
    except InsufficientStockError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc

    return ReservationResponse(
        reservation_id=rec.reservation_id,
        sku=rec.sku,
        branch_id=rec.branch_id,
        quantity=rec.quantity,
        status=rec.status,
        expires_at=rec.expires_at,
    )


@router.post("/inventory/release", response_model=ReservationResponse)
def release_inventory_reservation(
    payload: StockReleaseRequest,
    repo: InventoryRepository = Depends(get_inventory_repository),
) -> ReservationResponse:
    """Libera explícitamente una reserva temporal de inventario (ej. rechazo de pago o abandono)."""
    rec = repo.release_reservation(payload.reservation_id)
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada")
    return ReservationResponse(
        reservation_id=rec.reservation_id,
        sku=rec.sku,
        branch_id=rec.branch_id,
        quantity=rec.quantity,
        status=rec.status,
        expires_at=rec.expires_at,
    )


@router.post("/inventory/expire-reservations")
def expire_reservations(
    repo: InventoryRepository = Depends(get_inventory_repository),
) -> dict[str, int]:
    """Ejecuta la liberación automática de reservas temporales vencidas (>15 min, HU-05)."""
    expired = repo.expire_stale_reservations()
    return {"expired_released_count": expired}
