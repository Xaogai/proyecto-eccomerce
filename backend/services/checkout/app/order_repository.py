"""Repositorio de Checkout y Pedidos con atomicidad transaccional, reserva persistente y webhook idempotente."""

from decimal import Decimal
import secrets
import uuid
from typing import Any
from sqlalchemy.orm import Session

from backend.services.checkout.app.schemas import (
    CheckoutRequest,
    OrderContact,
    OrderHistoryItem,
    OrderItemResponse,
    OrderResponse,
    OrderReturnSummary,
)
from backend.services.inventory.app.inventory_repository import (
    InsufficientStockError,
    InventoryRepository,
)
from backend.services.payments.app.gateway_factory import GatewayChargeResult, PaymentGatewayFactory
from backend.services.shipping.app.shipping_repository import ShippingRepository
from backend.shared.config import settings
from backend.shared.configuracion import get_section
from backend.shared.models import (
    Carrito,
    Cliente,
    Direccion,
    Envio,
    EventoWebhook,
    HistorialPedido,
    Inventario,
    ItemPedido,
    Pago,
    Pedido,
    Sucursal,
    Usuario,
    Variante,
)
from backend.shared.notifications import send_email_notification
from backend.shared.security import record_audit_event

ZERO = Decimal("0.00")


def money(value: Any) -> Decimal:
    """Monto redondeado a centavos (el texto evita errores de float al venir de Numeric o de un cálculo)."""
    return Decimal(str(value)).quantize(Decimal("0.01"))


def format_address(d: Direccion) -> str:
    """"Av. Juárez 210 int. 3, Col. Centro, 50000 Toluca, Estado de México"."""
    street = " ".join(p for p in [d.calle, d.numero_exterior or ""] if p)
    if d.numero_interior:
        street += f" int. {d.numero_interior}"
    parts = [street, f"Col. {d.colonia}" if d.colonia else "", f"{d.codigo_postal} {d.ciudad}", d.entidad or ""]
    return ", ".join(p for p in parts if p)


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

    def add_history(self, pedido: Pedido, estado: str, actor: str = "Sistema", nota: str | None = None) -> None:
        """Cambia el estado del pedido y lo deja en el historial (línea de tiempo y registro del admin)."""
        pedido.estado = estado
        self.db.add(HistorialPedido(pedido_id=pedido.id, estado=estado, actor=actor, nota=nota))

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
        total_pedido = ZERO
        for cart_item in cart.items:
            variante = self.db.query(Variante).filter(Variante.sku == cart_item.variante_sku).first()
            if not variante:
                raise ValueError(f"Variante {cart_item.variante_sku} no encontrada")
            precio_congelado = money(variante.precio)
            subtotal = money(precio_congelado * Decimal(cart_item.cantidad))
            total_pedido += subtotal
            order_items_entities.append(
                ItemPedido(
                    variante_sku=cart_item.variante_sku,
                    cantidad=cart_item.cantidad,
                    precio_unitario_venta=precio_congelado,
                    subtotal=subtotal,
                )
            )
        return order_items_entities, money(total_pedido)

    def _branch_with_everything(self, cart: Carrito) -> uuid.UUID:
        """Primera sucursal que tiene todas las piezas del carrito (surte los envíos a domicilio)."""
        for branch in self.db.query(Sucursal).order_by(Sucursal.nombre).all():
            if all(
                (
                    self.db.query(Inventario.cantidad_disponible)
                    .filter(Inventario.sucursal_id == branch.id, Inventario.variante_sku == item.variante_sku)
                    .scalar()
                    or 0
                )
                >= item.cantidad
                for item in cart.items
            ):
                return branch.id
        raise InsufficientStockError("Ninguna sucursal tiene todas las piezas del pedido")

    def _delivery_address(self, cliente_id: uuid.UUID, payload: CheckoutRequest) -> tuple[str | None, str | None]:
        """Dirección de entrega (texto) y código postal: la guardada del cliente o la escrita en el checkout."""
        if payload.tipo_envio != "domicilio":
            return None, None
        if payload.direccion_id is not None:
            d = self.db.get(Direccion, payload.direccion_id)
            if d is None or d.cliente_id != cliente_id:
                raise ValueError("La dirección no existe en tu cuenta")
            return format_address(d), d.codigo_postal
        if payload.direccion is not None:
            a = payload.direccion
            texto = format_address(
                Direccion(
                    calle=a.calle,
                    numero_exterior=a.numero_exterior,
                    numero_interior=a.numero_interior,
                    colonia=a.colonia,
                    codigo_postal=a.codigo_postal,
                    ciudad=a.ciudad,
                    entidad=a.entidad,
                )
            )
            if a.referencias:
                texto += f". Referencias: {a.referencias}"
            return texto, a.codigo_postal
        return None, payload.codigo_postal

    def shipping_cost(self, zip_code: str | None, subtotal: Decimal) -> Decimal:
        """Costo de envío por código postal; gratis desde el monto configurado por el admin."""
        threshold = money(get_section(self.db, "envios")["envio_gratis_desde"])
        if subtotal >= threshold:
            return ZERO
        return money(ShippingRepository(self.db).quote_by_zip(zip_code or "50000").costo_domicilio)

    def _charge(self, pedido: Pedido, amount: Decimal, payload_token: str, provider: str) -> GatewayChargeResult:
        """Crea la intención de pago; con la pasarela de pruebas el cliente paga en /api/v1/pagos/sandbox."""
        result = PaymentGatewayFactory.create(provider).create_payment_intent(
            order_folio=pedido.folio, amount=amount, payment_token=payload_token
        )
        if settings.pasarela_sandbox:
            result.checkout_url = f"/api/v1/pagos/sandbox/{result.reference_id}"
        return result

    def create_checkout_order(
        self,
        cliente_id: uuid.UUID,
        payload: CheckoutRequest,
    ) -> OrderResponse:
        """
        Ejecuta el flujo de checkout (Anexo 1.5 y 1.8):
        1. Verifica que el carrito sea del cliente y tenga ítems.
        2. Reserva stock temporalmente en la sucursal antes de llamar a la pasarela.
        3. Congela `precio_unitario_venta` en `item_pedido` y calcula `total = sum(subtotales)` (RQ-DAT-001).
        4. Crea intención de pago tokenizada por el total más el envío (RQ-SEG-002).
        5. Registra el envío (`domicilio` con su dirección o `recoleccion_tienda` con código de entrega).
        """
        cart = self.db.query(Carrito).filter(Carrito.id == payload.carrito_id).first()
        if not cart or not cart.items or cart.cliente_id not in (None, cliente_id):
            raise ValueError("El carrito está vacío o no existe")
        if cart.estado == "convertido":
            raise ValueError("Este carrito ya fue convertido en un pedido")

        self._ensure_cliente(cliente_id)
        direccion_texto, zip_code = self._delivery_address(cliente_id, payload)
        sucursal_id = payload.sucursal_id or self._branch_with_everything(cart)
        inv_repo = InventoryRepository(self.db)
        created_reservations = self._reserve_cart_items(cart, sucursal_id, inv_repo)
        order_items_entities, total_pedido = self._build_order_items(cart)
        is_pickup = payload.tipo_envio == "recoleccion_tienda"
        costo_envio = ZERO if is_pickup else self.shipping_cost(zip_code, total_pedido)

        folio = f"TSR-2026-{secrets.randbelow(9000) + 1000}-{uuid.uuid4().hex[:4].upper()}"
        pedido = Pedido(
            cliente_id=cliente_id,
            folio=folio,
            estado="pendiente_pago",
            total=total_pedido,
            codigo_recoleccion=f"{secrets.randbelow(9000) + 1000}" if is_pickup else None,
        )
        self.db.add(pedido)
        self.db.flush()
        self.add_history(pedido, "pendiente_pago", actor="Cliente")
        if payload.telefono_contacto:
            usuario = self.db.get(Usuario, cliente_id)
            if usuario is not None and not usuario.telefono:
                usuario.telefono = payload.telefono_contacto

        for item_entity in order_items_entities:
            item_entity.pedido_id = pedido.id
            self.db.add(item_entity)

        charge_result = self._charge(
            pedido, total_pedido + costo_envio, payload.payment_token, payload.payment_provider
        )
        self.db.add(
            Pago(
                pedido_id=pedido.id,
                monto=total_pedido + costo_envio,
                metodo=payload.payment_method,
                estado=charge_result.status,
                referencia_pasarela=charge_result.reference_id,
            )
        )
        self.db.add(
            Envio(
                pedido_id=pedido.id,
                tipo=payload.tipo_envio,
                costo=costo_envio,
                estado="pendiente",
                # En envío a domicilio guarda la sucursal que surte (sirve para reintentar el pago).
                sucursal_recoleccion_id=sucursal_id,
                direccion_entrega=direccion_texto,
            )
        )

        if charge_result.status == "rechazado":
            self.add_history(pedido, "pago_rechazado")
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

    def retry_payment(self, pedido: Pedido, provider: str = "stripe") -> GatewayChargeResult:
        """Nueva intención de pago para un pedido con pago rechazado; vuelve a apartar el stock."""
        if pedido.estado != "pago_rechazado":
            raise ValueError("Este pedido no tiene un pago rechazado")
        envio = pedido.envios[0] if pedido.envios else None
        inv_repo = InventoryRepository(self.db)
        branch_id = envio.sucursal_recoleccion_id if envio and envio.sucursal_recoleccion_id else None
        if branch_id is None:
            raise ValueError("No sabemos de qué sucursal surtir este pedido")
        reservations: list[str] = []
        try:
            for item in pedido.items:
                reservations.append(inv_repo.reserve_stock(item.variante_sku, branch_id, item.cantidad).reservation_id)
        except InsufficientStockError:
            for res_id in reservations:
                inv_repo.release_reservation(res_id, reason="released")
            raise
        inv_repo.assign_reservations_to_order(reservations, pedido.id)
        amount = money(pedido.total) + (money(envio.costo) if envio else ZERO)
        result = self._charge(pedido, amount, "tok_visa_sandbox", provider)
        self.db.add(
            Pago(
                pedido_id=pedido.id,
                monto=amount,
                metodo="tarjeta",
                estado=result.status,
                referencia_pasarela=result.reference_id,
            )
        )
        self.add_history(pedido, "pendiente_pago", actor="Cliente", nota="Reintento de pago")
        self.db.commit()
        return result

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
            self.add_history(pedido, "confirmado", actor="Pasarela de pago")
            for res_id in reservation_ids:
                inv_repo.confirm_reservation(res_id)
        elif payment_status in {"rechazado", "reembolsado"}:
            self.add_history(
                pedido, "pago_rechazado" if payment_status == "rechazado" else "reembolsado", actor="Pasarela de pago"
            )
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
            f"{item.cantidad}x {item.variante_sku} (${money(item.subtotal):.2f})" for item in pedido.items
        )
        codigo = f" Tu código para recoger es {pedido.codigo_recoleccion}." if pedido.codigo_recoleccion else ""
        send_email_notification(
            recipient_email=usuario.email,
            recipient_user_id=str(usuario.id),
            subject=f"Confirmación de compra Ferremarket — Folio {pedido.folio}",
            body=(
                f"Hola {usuario.nombre}, tu pedido con folio {pedido.folio} ha sido confirmado. "
                f"Resumen de compra: {resumen_items}. Total pagado: ${money(pedido.total):.2f} MXN.{codigo}"
            ),
            template_type="order_confirmation",
            metadata={
                "folio": pedido.folio,
                "pedido_id": str(pedido.id),
                "total": str(money(pedido.total)),
                "items_count": len(pedido.items),
            },
        )

    def get_order_by_id(self, order_id: uuid.UUID) -> Pedido | None:
        """Obtiene un pedido por su UUID."""
        return self.db.query(Pedido).filter(Pedido.id == order_id).first()

    def list_orders_for_user(self, user_id: uuid.UUID, is_admin: bool = False) -> list[OrderResponse]:
        """Lista los pedidos de un cliente (o todos si es administrador), los más recientes primero."""
        query = self.db.query(Pedido)
        if not is_admin:
            query = query.filter(Pedido.cliente_id == user_id)
        orders = query.order_by(Pedido.fecha.desc()).all()
        return [self._serialize_order(o) for o in orders]

    def cancel_order(self, order_id: uuid.UUID) -> OrderResponse:
        """Cancela un pedido antes de su entrega, libera reservas activas y notifica al cliente (HU-06, HU-10)."""
        pedido = self.get_order_by_id(order_id)
        if not pedido:
            raise ValueError("Pedido no encontrado")
        envio = pedido.envios[0] if pedido.envios else None
        if (envio and envio.estado == "entregado") or pedido.estado == "entregado":
            raise ValueError("No se puede cancelar un pedido que ya fue entregado")
        self.add_history(pedido, "cancelado")
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

    def _serialize_items(self, pedido: Pedido) -> list[OrderItemResponse]:
        """Ítems con el nombre, atributos e imagen de su variante (el precio es el congelado)."""
        items: list[OrderItemResponse] = []
        for i in pedido.items:
            variante = i.variante
            producto = variante.producto if variante else None
            items.append(
                OrderItemResponse(
                    variante_sku=i.variante_sku,
                    cantidad=i.cantidad,
                    precio_unitario_venta=money(i.precio_unitario_venta),
                    subtotal=money(i.subtotal),
                    nombre_producto=producto.nombre if producto else i.variante_sku,
                    atributos=dict(variante.atributos or {}) if variante else {},
                    imagen_url=variante.imagen_url if variante else None,
                    producto_sku=producto.variantes[0].sku if producto and producto.variantes else None,
                )
            )
        return items

    def _history(self, pedido: Pedido) -> list[OrderHistoryItem]:
        """Historial del pedido; los pedidos anteriores a la migración 0003 muestran solo su estado actual."""
        if pedido.historial:
            return [
                OrderHistoryItem(estado=h.estado, fecha=h.fecha, actor=h.actor, nota=h.nota) for h in pedido.historial
            ]
        return [OrderHistoryItem(estado=pedido.estado, fecha=pedido.fecha)]

    def _serialize_order(
        self,
        pedido: Pedido,
        referencia_pasarela: str | None = None,
        checkout_url: str | None = None,
    ) -> OrderResponse:
        pago = pedido.pagos[-1] if pedido.pagos else None
        ref = referencia_pasarela or (pago.referencia_pasarela if pago else None)
        envio = pedido.envios[0] if pedido.envios else None
        usuario = self.db.get(Usuario, pedido.cliente_id)
        sucursal = envio.sucursal_recoleccion if envio else None
        history = self._history(pedido)
        delivered = next((h.fecha for h in reversed(history) if h.estado == "entregado"), None)
        costo_envio = money(envio.costo) if envio else ZERO
        return OrderResponse(
            id=pedido.id,
            cliente_id=pedido.cliente_id,
            folio=pedido.folio,
            fecha=pedido.fecha,
            estado=pedido.estado,
            total=money(pedido.total),
            items=self._serialize_items(pedido),
            referencia_pasarela=ref,
            checkout_url=checkout_url,
            tipo_envio=envio.tipo if envio else "domicilio",
            costo_envio=costo_envio,
            estado_envio=envio.estado if envio else "pendiente",
            numero_guia=envio.numero_guia if envio else None,
            estado_pago=pago.estado if pago else None,
            metodo_pago=pago.metodo if pago else None,
            total_con_envio=money(pedido.total) + costo_envio,
            contacto=OrderContact(nombre=usuario.nombre, email=usuario.email, telefono=usuario.telefono)
            if usuario
            else None,
            direccion_entrega=envio.direccion_entrega if envio else None,
            sucursal_id=sucursal.id if sucursal else None,
            sucursal_nombre=sucursal.nombre if sucursal else None,
            codigo_recoleccion=pedido.codigo_recoleccion,
            historial=history,
            devoluciones=[
                OrderReturnSummary(
                    id=d.id, folio=d.folio, estado=d.estado, fecha=d.fecha, monto_reembolso=money(d.monto_reembolso)
                )
                for d in pedido.devoluciones
            ],
            fecha_entrega=delivered,
        )
