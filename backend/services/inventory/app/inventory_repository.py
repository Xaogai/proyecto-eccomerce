"""Repositorio de Inventario con control transaccional de concurrencia y reservas temporales (RQ-DISP-001, HU-05)."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import threading
import uuid
from sqlalchemy.orm import Session

from backend.shared.config import settings
from backend.shared.models import Inventario, ReservaInventario, Sucursal

# Serializa las reservas dentro de un proceso; entre procesos/instancias la exclusión la da
# `SELECT ... FOR UPDATE` sobre la fila de inventario (PostgreSQL).
_INVENTORY_LOCK = threading.Lock()


class InsufficientStockError(Exception):
    """Excepción lanzada cuando no hay unidades disponibles suficientes para cubrir la reserva."""


@dataclass
class ReservationRecord:
    """Vista de dominio de una reserva temporal de inventario persistida en `reservas_inventario` (Sec. 14.3)."""

    reservation_id: str
    sku: str
    branch_id: uuid.UUID
    quantity: int
    status: str  # 'active', 'released', 'confirmed', 'expired'
    created_at: datetime
    expires_at: datetime
    idempotency_key: str | None = None


def _as_utc(value: datetime) -> datetime:
    """Normaliza fechas leídas de SQLite (sin zona horaria) a UTC."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _to_record(row: ReservaInventario) -> ReservationRecord:
    """Convierte la fila ORM en el objeto de dominio expuesto por la API."""
    return ReservationRecord(
        reservation_id=str(row.id),
        sku=row.variante_sku,
        branch_id=row.sucursal_id,
        quantity=row.cantidad,
        status=row.estado,
        created_at=_as_utc(row.creada_en),
        expires_at=_as_utc(row.expira_en),
        idempotency_key=row.idempotency_key,
    )


class InventoryRepository:
    """Encapsula las operaciones de inventario y reservas por sucursal (Patrón Repositorio - Sec. 14.2)."""

    def __init__(self, db_session: Session) -> None:
        """Inicializa el repositorio con la sesión de base de datos."""
        self.db = db_session

    def create_branch(self, nombre: str, direccion_id: uuid.UUID | None = None) -> Sucursal:
        """Crea una nueva sucursal física."""
        branch = Sucursal(nombre=nombre, direccion_id=direccion_id)
        self.db.add(branch)
        self.db.commit()
        self.db.refresh(branch)
        return branch

    def list_branches(self) -> list[Sucursal]:
        """Lista todas las sucursales registradas."""
        return self.db.query(Sucursal).all()

    def set_stock(
        self,
        sucursal_id: uuid.UUID,
        variante_sku: str,
        cantidad_disponible: int,
    ) -> tuple[Inventario, int]:
        """
        Establece o actualiza la cantidad disponible de un SKU en una sucursal.

        Args:
            sucursal_id: UUID de la sucursal.
            variante_sku: SKU de la variante.
            cantidad_disponible: Nueva cantidad disponible.

        Returns:
            tuple[Inventario, int]: Registro de inventario actualizado y cantidad previa.
        """
        with _INVENTORY_LOCK:
            inv = (
                self.db.query(Inventario)
                .filter(
                    Inventario.sucursal_id == sucursal_id,
                    Inventario.variante_sku == variante_sku,
                )
                .with_for_update()
                .first()
            )
            if not inv:
                previous_qty = 0
                inv = Inventario(
                    sucursal_id=sucursal_id,
                    variante_sku=variante_sku,
                    cantidad_disponible=cantidad_disponible,
                    cantidad_reservada=0,
                )
                self.db.add(inv)
            else:
                previous_qty = inv.cantidad_disponible
                inv.cantidad_disponible = cantidad_disponible
            self.db.commit()
            self.db.refresh(inv)
            return inv, previous_qty

    def get_stock_by_sku(self, sku: str) -> list[Inventario]:
        """Consulta los registros de inventario de un SKU en todas las sucursales."""
        self.expire_stale_reservations()
        return self.db.query(Inventario).filter(Inventario.variante_sku == sku).all()

    def _find_inventory(self, branch_id: uuid.UUID, sku: str, lock_row: bool = False) -> Inventario | None:
        """Obtiene el registro de inventario de un SKU en una sucursal, opcionalmente bloqueando la fila."""
        query = self.db.query(Inventario).filter(
            Inventario.sucursal_id == branch_id,
            Inventario.variante_sku == sku,
        )
        if lock_row:
            query = query.with_for_update()
        return query.first()

    def _find_idempotent_reservation(self, idempotency_key: str) -> ReservaInventario | None:
        """Busca una reserva previa con la misma llave de idempotencia; libera la llave si ya no está activa."""
        existing = (
            self.db.query(ReservaInventario)
            .filter(ReservaInventario.idempotency_key == idempotency_key)
            .first()
        )
        if existing and existing.estado != "active":
            existing.idempotency_key = None
            self.db.flush()
            return None
        return existing

    def reserve_stock(
        self,
        sku: str,
        branch_id: uuid.UUID,
        quantity: int,
        idempotency_key: str | None = None,
    ) -> ReservationRecord:
        """
        Reserva temporalmente unidades de inventario para un SKU en una sucursal (Sec. 14.3, HU-05, RQ-DISP-001).

        El descuento de `cantidad_disponible` y el alta de la reserva se confirman en una única transacción.

        Args:
            sku: Identificador único de la variante de producto.
            branch_id: Identificador de la sucursal o almacén.
            quantity: Cantidad de unidades a reservar.
            idempotency_key: Llave opcional de idempotencia para evitar reservas duplicadas.

        Returns:
            ReservationRecord: Objeto con el identificador de la reserva y su expiración (15 minutos).

        Raises:
            InsufficientStockError: Si no hay unidades disponibles suficientes.
        """
        with _INVENTORY_LOCK:
            self._expire_stale_unlocked()
            if idempotency_key:
                existing = self._find_idempotent_reservation(idempotency_key)
                if existing:
                    return _to_record(existing)

            inv = self._find_inventory(branch_id, sku, lock_row=True)
            if not inv or inv.cantidad_disponible < quantity:
                self.db.rollback()
                raise InsufficientStockError(
                    f"Stock insuficiente para SKU '{sku}' en la sucursal '{branch_id}'"
                )

            inv.cantidad_disponible -= quantity
            inv.cantidad_reservada += quantity
            now = datetime.now(timezone.utc)
            row = ReservaInventario(
                id=uuid.uuid4(),
                variante_sku=sku,
                sucursal_id=branch_id,
                cantidad=quantity,
                estado="active",
                creada_en=now,
                expira_en=now + timedelta(minutes=settings.reservation_ttl_minutes),
                idempotency_key=idempotency_key,
            )
            self.db.add(row)
            self.db.commit()
            self.db.refresh(row)
            return _to_record(row)

    def _get_reservation(self, reservation_id: str) -> ReservaInventario | None:
        """Obtiene una reserva por su identificador textual; devuelve None si el identificador no es válido."""
        try:
            res_uuid = uuid.UUID(str(reservation_id))
        except ValueError:
            return None
        return self.db.query(ReservaInventario).filter(ReservaInventario.id == res_uuid).first()

    def release_reservation(self, reservation_id: str, reason: str = "released") -> ReservationRecord | None:
        """
        Libera una reserva activa devolviendo las unidades a `cantidad_disponible`.

        Args:
            reservation_id: Identificador de la reserva.
            reason: Estado final ('released' o 'expired').

        Returns:
            ReservationRecord | None: Reserva liberada o None si no existe.
        """
        with _INVENTORY_LOCK:
            row = self._get_reservation(reservation_id)
            if not row:
                return None
            if row.estado != "active":
                return _to_record(row)

            inv = self._find_inventory(row.sucursal_id, row.variante_sku, lock_row=True)
            if inv:
                inv.cantidad_disponible += row.cantidad
                inv.cantidad_reservada = max(0, inv.cantidad_reservada - row.cantidad)
            row.estado = reason
            self.db.commit()
            self.db.refresh(row)
            return _to_record(row)

    def confirm_reservation(self, reservation_id: str) -> ReservationRecord | None:
        """Confirma definitivamente una reserva tras aprobarse el pago del pedido."""
        with _INVENTORY_LOCK:
            row = self._get_reservation(reservation_id)
            if not row:
                return None
            if row.estado != "active":
                return _to_record(row)

            inv = self._find_inventory(row.sucursal_id, row.variante_sku, lock_row=True)
            if inv:
                inv.cantidad_reservada = max(0, inv.cantidad_reservada - row.cantidad)
            row.estado = "confirmed"
            self.db.commit()
            self.db.refresh(row)
            return _to_record(row)

    def assign_reservations_to_order(self, reservation_ids: list[str], pedido_id: uuid.UUID) -> None:
        """Vincula reservas activas a un pedido para confirmarlas o liberarlas al llegar el webhook de pago."""
        for res_id in reservation_ids:
            row = self._get_reservation(res_id)
            if row:
                row.pedido_id = pedido_id
        self.db.flush()

    def active_reservation_ids_for_order(self, pedido_id: uuid.UUID) -> list[str]:
        """Lista los identificadores de reservas aún activas de un pedido."""
        rows = (
            self.db.query(ReservaInventario)
            .filter(ReservaInventario.pedido_id == pedido_id, ReservaInventario.estado == "active")
            .all()
        )
        return [str(r.id) for r in rows]

    def _expire_stale_unlocked(self) -> int:
        """Libera internamente todas las reservas cuyo tiempo de expiración (15 min) haya vencido."""
        now = datetime.now(timezone.utc)
        stale = (
            self.db.query(ReservaInventario)
            .filter(ReservaInventario.estado == "active", ReservaInventario.expira_en <= now)
            .all()
        )
        for row in stale:
            inv = self._find_inventory(row.sucursal_id, row.variante_sku, lock_row=True)
            if inv:
                inv.cantidad_disponible += row.cantidad
                inv.cantidad_reservada = max(0, inv.cantidad_reservada - row.cantidad)
            row.estado = "expired"
        if stale:
            self.db.commit()
        return len(stale)

    def expire_stale_reservations(self) -> int:
        """
        Expira las reservas vencidas (>15 minutos sin checkout) y restaura el stock disponible (HU-05).

        Returns:
            int: Cantidad de reservas expiradas y liberadas.
        """
        with _INVENTORY_LOCK:
            return self._expire_stale_unlocked()
