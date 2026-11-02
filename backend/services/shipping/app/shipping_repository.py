"""Repositorio de Envíos y Logística siguiendo el Patrón Repositorio (Sec. 14.2)."""

from decimal import Decimal
import uuid
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.services.shipping.app.schemas import (
    BranchAvailabilityItem,
    ShippingQuoteResponse,
)
from backend.shared.models import Envio, Inventario, Sucursal


class ShippingRepository:
    """Encapsula las operaciones de cotización de envío y gestión de la tabla `envios` (Sec. 14.2)."""

    def __init__(self, db_session: Session) -> None:
        """Inicializa el repositorio con la sesión de base de datos."""
        self.db = db_session

    def quote_by_zip(self, zip_code: str, sku: str | None = None) -> ShippingQuoteResponse:
        """
        Calcula el costo de envío según código postal y lista sucursales con stock disponible (Sec. 13.1, HU-07).

        Args:
            zip_code: Código postal de 5 dígitos.
            sku: SKU opcional para filtrar disponibilidad específica por sucursal.

        Returns:
            ShippingQuoteResponse: Costo a domicilio, costo en tienda (0.00) y sucursales con stock.

        Raises:
            ValueError: Si el código postal no tiene formato válido.
        """
        cleaned = zip_code.strip()
        if not cleaned.isdigit() or len(cleaned) != 5:
            raise ValueError("El código postal debe contener exactamente 5 dígitos numéricos")

        # Regla de tarifación por zona postal (Centro de México / Zonas metropolitanas vs foráneo)
        prefix = int(cleaned[:2])
        if 50 <= prefix <= 57 or 1 <= prefix <= 16:
            costo = Decimal("99.00")
            dias = 2
        elif 20 <= prefix <= 49 or 58 <= prefix <= 76:
            costo = Decimal("149.00")
            dias = 3
        else:
            costo = Decimal("199.00")
            dias = 5

        branches = self.db.query(Sucursal).all()
        available_branches: list[BranchAvailabilityItem] = []
        for branch in branches:
            query = self.db.query(func.coalesce(func.sum(Inventario.cantidad_disponible), 0)).filter(
                Inventario.sucursal_id == branch.id
            )
            if sku:
                query = query.filter(Inventario.variante_sku == sku)
            stock_total = int(query.scalar() or 0)
            if stock_total > 0:
                available_branches.append(
                    BranchAvailabilityItem(
                        sucursal_id=branch.id,
                        nombre=branch.nombre,
                        stock_disponible=stock_total,
                    )
                )

        return ShippingQuoteResponse(
            codigo_postal=cleaned,
            costo_domicilio=costo,
            costo_recoleccion_tienda=Decimal("0.00"),
            dias_estimados_entrega=dias,
            sucursales_disponibles=available_branches,
        )

    def get_by_order(self, pedido_id: uuid.UUID) -> Envio | None:
        """Obtiene el envío asociado a un pedido."""
        return self.db.query(Envio).filter(Envio.pedido_id == pedido_id).first()

    def list_all(self) -> list[Envio]:
        """Lista todos los envíos registrados para gestión operativa (staff/admin)."""
        return self.db.query(Envio).all()

    def update_status(
        self,
        shipment_id: uuid.UUID,
        estado: str,
        numero_guia: str | None = None,
    ) -> Envio | None:
        """Actualiza el estado y número de guía de un envío (Anexo 1.3)."""
        envio = self.db.query(Envio).filter(Envio.id == shipment_id).first()
        if not envio:
            return None
        envio.estado = estado
        if numero_guia is not None:
            envio.numero_guia = numero_guia
        self.db.commit()
        self.db.refresh(envio)
        return envio
