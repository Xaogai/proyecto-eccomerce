"""Repositorio de Checkout y Pedidos con atomicidad transaccional, reserva persistente y webhook idempotente."""

from decimal import Decimal
import secrets
import uuid
from typing import Any
from sqlalchemy.orm import Session

from backend.services.checkout.app.schemas import (
    CheckoutRequest,
    OrderItemResponse,
    OrderResponse,
)
from backend.services.inventory.app.inventory_repository import (
    InsufficientStockError,
    InventoryRepository,
)
from backend.services.payments.app.gateway_factory import PaymentGatewayFactory
from backend.shared.models import (
    Carrito,
    Cliente,
    Envio,
    EventoWebhook,
    ItemPedido,
    Pago,
    Pedido,
    Usuario,
    Variante,
)
from backend.shared.notifications import send_email_notification
from backend.shared.security import record_audit_event


class OrderRepository:
    """Encapsula la creación y confirmación de pedidos (Patrón Repositorio - Sec. 14.2)."""

    def __init__(self, db_session: Session) -> None:
        """Inicializa el repositorio con la sesión de base de datos."""
        self.db = db_session

    def _ensure_cliente(self, cliente_id: uuid.UUID) -> Cliente:
        """Garantiza que exista el registro de cliente para el usuario."""
        cliente = self.db.query(Cliente).filter(Cliente.usuario_id == cliente_id).first()
        if not cliente:
            cliente = Cliente(usuario_id=cliente_id)
            self.db.add(cliente)
            self.db.flush()
        return cliente

    def _reserve_cart_items(
        self,
        cart: Carrito,
        sucursal_id: uuid.UUID,
        inv_repo: InventoryRepository,
    ) -> list[str]:
        """Reserva temporalmente todos los ítems del carrito o libera si alguno falla."""
        created_reservations: list[str] = []
        try:
            for cart_item in cart.items:
                res = inv_repo.reserve_stock(
                    sku=cart_item.variante_sku,
                    branch_id=sucursal_id,
                    quantity=cart_item.cantidad,
                )
                created_reservations.append(res.reservation_id)
            return created_reservations
        except InsufficientStockError:
            for res_id in created_reservations:
                inv_repo.release_reservation(res_id, reason="released")
            raise

    def _build_order_items(self, cart: Carrito) -> tuple[list[ItemPedido], Decimal]:
        """Construye las entidades `ItemPedido` congelando el precio vigente y calcula el total (RQ-DAT-001)."""
        order_items_entities: list[ItemPedido] = []
        total_pedido = Decimal("0.00")
        for cart_item in cart.items:
            variante = self.db.query(Variante).filter(Variante.sku == cart_item.variante_sku).first()
            if not variante:
                raise ValueError(f"Variante {cart_item.variante_sku} no encontrada")
            precio_congelado = Decimal(str(variante.precio)).quantize(Decimal("0.01"))
            subtotal = (precio_congelado * Decimal(cart_item.cantidad)).quantize(Decimal("0.01"))
            total_pedido += subtotal
            order_items_entities.append(
                ItemPedido(
                    variante_sku=cart_item.variante_sku,
                    cantidad=cart_item.cantidad,
                    precio_unitario_venta=precio_congelado,
                    subtotal=subtotal,
                )
            )
        return order_items_entities, total_pedido.quantize(Decimal("0.01"))

    def create_checkout_order(
        self,
        cliente_id: uuid.UUID,
        payload: CheckoutRequest,
    ) -> OrderResponse:
        """
        Ejecuta el flujo de checkout (Anexo 1.5 y 1.8):
        1. Verifica carrito e ítems.
        2. Reserva stock temporalmente en la sucursal antes de llamar a la pasarela.
        3. Congela `precio_unitario_venta` en `item_pedido` y calcula `total = sum(subtotales)` (RQ-DAT-001).
        4. Crea intención de pago tokenizada vía `PaymentGatewayFactory` (RQ-SEG-002).
        5. Registra el envío (`domicilio` o `recoleccion_tienda`).
        """
        cart = self.db.query(Carrito).filter(Carrito.id == payload.carrito_id).first()
        if not cart or not cart.items:
            raise ValueError("El carrito está vacío o no existe")
        if cart.cliente_id is not None and cart.cliente_id != cliente_id:
            raise PermissionError("No tiene autorización para procesar el carrito de otro cliente")
        if cart.estado == "convertido":
            raise ValueError("Este carrito ya fue convertido en un pedido")

        self._ensure_cliente(cliente_id)
        inv_repo = InventoryRepository(self.db)
        created_reservations = self._reserve_cart_items(cart, payload.sucursal_id, inv_repo)
        order_items_entities, total_pedido = self._build_order_items(cart)

        folio = f"TSR-2026-{secrets.randbelow(9000) + 1000}-{uuid.uuid4().hex[:4].upper()}"
        pedido = Pedido(
            cliente_id=cliente_id,
            folio=folio,
            estado="pendiente_pago",
            total=total_pedido,
        )
        self.db.add(pedido)
        self.db.flush()

        for item_entity in order_items_entities:
            item_entity.pedido_id = pedido.id
            self.db.add(item_entity)

        gateway = PaymentGatewayFactory.create(payload.payment_provider)
        charge_result = gateway.create_payment_intent(
            order_folio=folio,
            amount=pedido.total,
            payment_token=payload.payment_token,
        )

        pago = Pago(
            pedido_id=pedido.id,
            monto=pedido.total,
            metodo=payload.payment_method,
            estado=charge_result.status,
            referencia_pasarela=charge_result.reference_id,
        )
        self.db.add(pago)

        costo_envio = Decimal("0.00") if payload.tipo_envio == "recoleccion_tienda" else Decimal("99.00")
        envio = Envio(
            pedido_id=pedido.id,
            tipo=payload.tipo_envio,
            costo=costo_envio,
            estado="pendiente",
            sucursal_recoleccion_id=payload.sucursal_id if payload.tipo_envio == "recoleccion_tienda" else None,
        )
        self.db.add(envio)

        if charge_result.status == "rechazado":
            pedido.estado = "pago_rechazado"
            for res_id in created_reservations:
                inv_repo.release_reservation(res_id, reason="released")
        else:
            cart.estado = "convertido"
            inv_repo.assign_reservations_to_order(created_reservations, pedido.id)

        self.db.commit()
        self.db.refresh(pedido)

        record_audit_event(
            "payment",
            str(cliente_id),
            f"order:{pedido.folio}",
            {"total": str(pedido.total), "status": charge_result.status, "ref": charge_result.reference_id},
        )

        return self._serialize_order(
            pedido,
            referencia_pasarela=charge_result.reference_id,
            checkout_url=charge_result.checkout_url,
        )

    def handle_payment_webhook(
        self,
        event_id: str,
        referencia_pasarela: str,
        payment_status: str,
    ) -> dict[str, Any]:
        """
        Procesa de manera idempotente y persistente la confirmación asíncrona de la pasarela (Sec. 13.1, AE-29).
        """
        existing_event = self.db.get(EventoWebhook, event_id)
        if existing_event is not None:
            cached = dict(existing_event.resultado)
            cached["idempotent_replay"] = True
            return cached

        pago = self.db.query(Pago).filter(Pago.referencia_pasarela == referencia_pasarela).first()
        if not pago:
            raise ValueError(f"No se encontró pago con referencia '{referencia_pasarela}'")

        pedido = self.db.query(Pedido).filter(Pedido.id == pago.pedido_id).first()
        if not pedido:
            raise ValueError("Pedido asociado al pago no encontrado")

        pago.estado = payment_status
        inv_repo = InventoryRepository(self.db)
        reservation_ids = inv_repo.active_reservation_ids_for_order(pedido.id)

        if payment_status == "aprobado":
            pedido.estado = "confirmado"
            for res_id in reservation_ids:
                inv_repo.confirm_reservation(res_id)
        elif payment_status in {"rechazado", "reembolsado"}:
            pedido.estado = "pago_rechazado" if payment_status == "rechazado" else "reembolsado"
            for res_id in reservation_ids:
                inv_repo.release_reservation(res_id, reason="released")

        result: dict[str, Any] = {
            "event_id": event_id,
            "pedido_id": str(pedido.id),
            "folio": pedido.folio,
            "order_status": pedido.estado,
            "payment_status": pago.estado,
            "idempotent_replay": False,
        }
        self.db.add(EventoWebhook(event_id=event_id, resultado=result))
        self.db.commit()
        record_audit_event("payment_webhook", None, f"order:{pedido.folio}", result)
        if payment_status == "aprobado":
            self._notify_order_confirmed(pedido)
        return result

    def _notify_order_confirmed(self, pedido: Pedido) -> None:
        """Envía notificación transaccional por correo al confirmar la compra con folio y resumen (HU-10)."""
        usuario = self.db.query(Usuario).filter(Usuario.id == pedido.cliente_id).first()
        if not usuario:
            return
        resumen_items = ", ".join(
            f"{item.cantidad}x {item.variante_sku} (${Decimal(str(item.subtotal)):.2f})"
            for item in pedido.items
        )
        send_email_notification(
            recipient_email=usuario.email,
            recipient_user_id=str(usuario.id),
            subject=f"Confirmación de compra Ferremarket — Folio {pedido.folio}",
            body=(
                f"Hola {usuario.nombre}, tu pedido con folio {pedido.folio} ha sido confirmado. "
                f"Resumen de compra: {resumen_items}. Total pagado: ${Decimal(str(pedido.total)):.2f} MXN."
            ),
            template_type="order_confirmation",
            metadata={
                "folio": pedido.folio,
                "pedido_id": str(pedido.id),
                "total": str(Decimal(str(pedido.total)).quantize(Decimal("0.01"))),
                "items_count": len(pedido.items),
            },
        )

    def get_order_by_id(self, order_id: uuid.UUID) -> Pedido | None:
        """Obtiene un pedido por su UUID."""
        return self.db.query(Pedido).filter(Pedido.id == order_id).first()

    def list_orders_for_user(self, user_id: uuid.UUID, is_admin: bool = False) -> list[OrderResponse]:
        """Lista los pedidos de un cliente o todos si es administrador."""
        query = self.db.query(Pedido)
        if not is_admin:
            query = query.filter(Pedido.cliente_id == user_id)
        orders = query.all()
        return [self._serialize_order(o) for o in orders]

    def cancel_order(self, order_id: uuid.UUID) -> OrderResponse:
        """Cancela un pedido antes de su entrega, libera reservas activas y notifica al cliente (HU-06, HU-10)."""
        pedido = self.get_order_by_id(order_id)
        if not pedido:
            raise ValueError("Pedido no encontrado")
        envio = pedido.envios[0] if pedido.envios else None
        if envio and envio.estado == "entregado":
            raise ValueError("No se puede cancelar un pedido que ya fue entregado")
        pedido.estado = "cancelado"
        if envio:
            envio.estado = "cancelado"
        inv_repo = InventoryRepository(self.db)
        for res_id in inv_repo.active_reservation_ids_for_order(pedido.id):
            inv_repo.release_reservation(res_id, reason="released")
        self.db.commit()
        self.db.refresh(pedido)
        usuario = self.db.query(Usuario).filter(Usuario.id == pedido.cliente_id).first()
        if usuario:
            send_email_notification(
                recipient_email=usuario.email,
                recipient_user_id=str(usuario.id),
                subject=f"Cancelación de pedido Ferremarket — Folio {pedido.folio}",
                body=f"Hola {usuario.nombre}, tu pedido {pedido.folio} ha sido cancelado conforme a tu solicitud.",
                template_type="order_cancelled",
                metadata={"folio": pedido.folio, "pedido_id": str(pedido.id)},
            )
        return self._serialize_order(pedido)

    def _serialize_order(
        self,
        pedido: Pedido,
        referencia_pasarela: str | None = None,
        checkout_url: str | None = None,
    ) -> OrderResponse:
        ref = referencia_pasarela
        if ref is None and pedido.pagos:
            ref = pedido.pagos[0].referencia_pasarela
        envio = pedido.envios[0] if pedido.envios else None
        return OrderResponse(
            id=pedido.id,
            cliente_id=pedido.cliente_id,
            folio=pedido.folio,
            fecha=pedido.fecha,
            estado=pedido.estado,
            total=Decimal(str(pedido.total)).quantize(Decimal("0.01")),
            items=[
                OrderItemResponse(
                    variante_sku=i.variante_sku,
                    cantidad=i.cantidad,
                    precio_unitario_venta=Decimal(str(i.precio_unitario_venta)).quantize(Decimal("0.01")),
                    subtotal=Decimal(str(i.subtotal)).quantize(Decimal("0.01")),
                )
                for i in pedido.items
            ],
            referencia_pasarela=ref,
            checkout_url=checkout_url,
            tipo_envio=envio.tipo if envio else "domicilio",
            costo_envio=Decimal(str(envio.costo)).quantize(Decimal("0.01")) if envio else Decimal("0.00"),
            estado_envio=envio.estado if envio else "pendiente",
            numero_guia=envio.numero_guia if envio else None,
        )
