"""Repositorio de Pagos con soporte persistente de idempotencia de webhooks (Sec. 14.2, AE-29)."""

from decimal import Decimal
import uuid
from sqlalchemy.orm import Session

from backend.shared.models import EventoWebhook, Pago


class PaymentRepository:
    """Encapsula el acceso a datos de la tabla `pagos` y eventos de webhook (Patrón Repositorio - Sec. 14.2)."""

    def __init__(self, db_session: Session) -> None:
        """Inicializa el repositorio con la sesión de base de datos."""
        self.db = db_session

    def create_payment(
        self,
        pedido_id: uuid.UUID,
        monto: Decimal,
        metodo: str,
        estado: str = "procesando",
        referencia_pasarela: str | None = None,
    ) -> Pago:
        """
        Registra una transacción de pago sin almacenar datos de tarjeta (RQ-SEG-002).

        Args:
            pedido_id: UUID del pedido asociado.
            monto: Monto cobrado.
            metodo: Medio de pago ('tarjeta', 'transferencia', 'oxxo').
            estado: Estado inicial ('procesando', 'aprobado', 'rechazado').
            referencia_pasarela: ID de transacción externa en la pasarela.

        Returns:
            Pago: Entidad persistida.
        """
        payment = Pago(
            pedido_id=pedido_id,
            monto=monto,
            metodo=metodo,
            estado=estado,
            referencia_pasarela=referencia_pasarela,
        )
        self.db.add(payment)
        self.db.commit()
        self.db.refresh(payment)
        return payment

    def get_by_reference(self, referencia_pasarela: str) -> Pago | None:
        """Busca un pago por su referencia externa de la pasarela."""
        return (
            self.db.query(Pago)
            .filter(Pago.referencia_pasarela == referencia_pasarela)
            .first()
        )

    def get_by_order(self, pedido_id: uuid.UUID) -> list[Pago]:
        """Lista todos los pagos asociados a un pedido."""
        return self.db.query(Pago).filter(Pago.pedido_id == pedido_id).all()

    def is_webhook_processed(self, event_id: str) -> bool:
        """Verifica en base de datos si un identificador de evento de webhook ya fue procesado (AE-29)."""
        return self.db.get(EventoWebhook, event_id) is not None

    def mark_webhook_processed(self, event_id: str, resultado: dict[str, object] | None = None) -> None:
        """Registra de forma persistente un evento de webhook como procesado."""
        if self.db.get(EventoWebhook, event_id) is None:
            self.db.add(EventoWebhook(event_id=event_id, resultado=dict(resultado or {})))
            self.db.commit()
