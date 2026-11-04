"""Transiciones permitidas del pedido (I3) y sus efectos en envío, pago e inventario."""

from sqlalchemy.orm import Session

from backend.services.checkout.app.order_repository import OrderRepository
from backend.services.inventory.app.inventory_repository import InventoryRepository
from backend.shared.models import Pedido, Usuario
from backend.shared.notifications import send_email_notification

TRANSICIONES: dict[str, tuple[str, ...]] = {
    "pendiente_pago": ("confirmado", "cancelado"),
    "pago_rechazado": ("cancelado",),
    "confirmado": ("en_preparacion", "cancelado"),
    "en_preparacion": ("listo_para_recoger", "enviado", "incidencia"),
    "listo_para_recoger": ("entregado", "cancelado", "incidencia"),
    "enviado": ("entregado", "incidencia"),
    "entregado": ("reembolsado",),
    "incidencia": ("reembolsado", "enviado"),
    "cancelado": (),
    "reembolsado": (),
}

# Estado del envío que corresponde a cada estado del pedido.
ESTADO_ENVIO = {"enviado": "enviado", "entregado": "entregado", "incidencia": "incidencia", "cancelado": "cancelado"}


class TransicionInvalida(ValueError):
    """El pedido no puede pasar al estado pedido desde el actual."""


def permitidas(pedido: Pedido) -> list[str]:
    """Estados a los que puede pasar; recoger en tienda no se "envía" y un envío no queda "listo para recoger"."""
    pickup = bool(pedido.envios and pedido.envios[0].tipo == "recoleccion_tienda")
    excluido = "enviado" if pickup else "listo_para_recoger"
    return [e for e in TRANSICIONES.get(pedido.estado, ()) if e != excluido]


def cambiar_estado(db: Session, pedido: Pedido, nuevo: str, actor: str, nota: str | None = None) -> Pedido:
    """Aplica la transición con sus efectos y la deja en el historial."""
    if nuevo not in permitidas(pedido):
        raise TransicionInvalida(f'No se puede pasar de "{pedido.estado}" a "{nuevo}".')
    repo = OrderRepository(db)
    envio = pedido.envios[0] if pedido.envios else None
    if envio is not None and nuevo in ESTADO_ENVIO:
        envio.estado = ESTADO_ENVIO[nuevo]
    if nuevo == "cancelado":
        inventario = InventoryRepository(db)
        for reserva in inventario.active_reservation_ids_for_order(pedido.id):
            inventario.release_reservation(reserva, reason="released")
    if nuevo == "reembolsado" and pedido.pagos:
        pedido.pagos[-1].estado = "reembolsado"
    repo.add_history(pedido, nuevo, actor=actor, nota=nota)
    db.commit()
    db.refresh(pedido)
    if nuevo in {"listo_para_recoger", "enviado", "cancelado"}:
        _avisar(db, pedido, nuevo)
    return pedido


def _avisar(db: Session, pedido: Pedido, estado: str) -> None:
    """Correo al cliente cuando su pedido está listo, va en camino o se canceló."""
    usuario = db.get(Usuario, pedido.cliente_id)
    if usuario is None:
        return
    mensajes = {
        "listo_para_recoger": f"ya está listo para recoger. Lleva tu código {pedido.codigo_recoleccion or ''}.",
        "enviado": "va en camino.",
        "cancelado": "fue cancelado.",
    }
    send_email_notification(
        recipient_email=usuario.email,
        recipient_user_id=str(usuario.id),
        subject=f"Tu pedido {pedido.folio} {mensajes[estado].split('.')[0]}",
        body=f"Hola {usuario.nombre}, tu pedido {pedido.folio} {mensajes[estado]}",
        template_type="order_status",
        metadata={"folio": pedido.folio, "estado": estado},
    )
