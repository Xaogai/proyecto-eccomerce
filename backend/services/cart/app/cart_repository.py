"""Repositorio de Carrito de Compras cumpliendo 2FN (Anexo 2.2.2, HU-04)."""

from decimal import Decimal
import uuid
from sqlalchemy.orm import Session

from backend.services.cart.app.schemas import (
    CartItemDetailResponse,
    CartResponse,
    MAX_CART_ITEMS,
)
from backend.shared.models import Carrito, Cliente, Inventario, ItemCarrito, Variante


class OutOfStockError(ValueError):
    """Se pidieron más piezas de las disponibles."""

    def __init__(self, sku: str, disponibles: int) -> None:
        """Guarda el SKU y cuántas piezas hay para el mensaje al cliente."""
        self.sku = sku
        self.disponibles = disponibles
        super().__init__(
            "Este producto está agotado." if disponibles <= 0 else f"Solo hay {disponibles} disponibles."
        )


class CartRepository:
    """Encapsula las operaciones de persistencia para `carritos` e `item_carrito` (Sec. 14.2)."""

    def __init__(self, db_session: Session) -> None:
        """Inicializa el repositorio con la sesión de base de datos."""
        self.db = db_session

    def get_or_create_cart(
        self,
        carrito_id: uuid.UUID | None = None,
        cliente_id: uuid.UUID | None = None,
    ) -> Carrito:
        """
        Obtiene un carrito activo existente o crea uno nuevo (para usuario registrado o invitado).

        Args:
            carrito_id: UUID opcional del carrito de sesión.
            cliente_id: UUID opcional del cliente autenticado.

        Returns:
            Carrito: Instancia del carrito activo.
        """
        if carrito_id is not None:
            cart = self.db.query(Carrito).filter(Carrito.id == carrito_id).first()
            if cart and cart.cliente_id is not None and cart.cliente_id != cliente_id:
                raise PermissionError("No tiene autorización para acceder o modificar el carrito de otro usuario")
            # El carrito de invitado no tiene dueño: pasa a la cuenta con /cart/merge al iniciar sesión.
            if cart and cart.estado == "activo" and cart.cliente_id == cliente_id:
                return cart
            carrito_id = None

        if cliente_id is not None:
            self._ensure_cliente_exists(cliente_id)
            cart = (
                self.db.query(Carrito)
                .filter(Carrito.cliente_id == cliente_id, Carrito.estado == "activo")
                .first()
            )
            if cart:
                return cart

        new_cart = Carrito(
            id=carrito_id or uuid.uuid4(),
            cliente_id=cliente_id,
            estado="activo",
        )
        self.db.add(new_cart)
        self.db.commit()
        self.db.refresh(new_cart)
        return new_cart

    def _ensure_cliente_exists(self, cliente_id: uuid.UUID) -> None:
        """Garantiza que exista el registro en `clientes` para el usuario autenticado."""
        cliente = self.db.query(Cliente).filter(Cliente.usuario_id == cliente_id).first()
        if not cliente:
            self.db.add(Cliente(usuario_id=cliente_id))
            self.db.flush()

    def add_item(
        self,
        variante_sku: str,
        cantidad: int,
        carrito_id: uuid.UUID | None = None,
        cliente_id: uuid.UUID | None = None,
    ) -> CartResponse:
        """
        Agrega o incrementa la cantidad de una variante en el carrito (HU-04).

        Args:
            variante_sku: SKU de la variante a agregar.
            cantidad: Unidades a sumar.
            carrito_id: UUID del carrito si ya existe.
            cliente_id: UUID del cliente si está autenticado.

        Returns:
            CartResponse: Estado actualizado del carrito con totales recalculados.

        Raises:
            ValueError: Si la variante no existe o se supera `MAX_CART_ITEMS`.
        """
        variante = self.db.query(Variante).filter(Variante.sku == variante_sku).first()
        if not variante or variante.producto.estado != "publicado":
            raise ValueError(f"La variante '{variante_sku}' no existe en el catálogo")

        cart = self.get_or_create_cart(carrito_id=carrito_id, cliente_id=cliente_id)
        item = (
            self.db.query(ItemCarrito)
            .filter(
                ItemCarrito.carrito_id == cart.id,
                ItemCarrito.variante_sku == variante_sku,
            )
            .first()
        )
        self._check_stock(variante_sku, (item.cantidad if item else 0) + cantidad)
        if item:
            if item.cantidad + cantidad > MAX_CART_ITEMS:
                raise ValueError(f"No se pueden exceder {MAX_CART_ITEMS} unidades por ítem")
            item.cantidad += cantidad
        else:
            item = ItemCarrito(
                carrito_id=cart.id,
                variante_sku=variante_sku,
                cantidad=cantidad,
            )
            self.db.add(item)

        self.db.commit()
        self.db.refresh(cart)
        return self.build_cart_response(cart)

    def update_item_quantity(
        self,
        carrito_id: uuid.UUID,
        variante_sku: str,
        cantidad: int,
    ) -> CartResponse | None:
        """Actualiza la cantidad exacta de una variante en el carrito o la elimina si es 0 (HU-04)."""
        cart = self.db.query(Carrito).filter(Carrito.id == carrito_id).first()
        if not cart:
            return None
        if cantidad <= 0:
            return self.remove_item(carrito_id, variante_sku)
        item = (
            self.db.query(ItemCarrito)
            .filter(
                ItemCarrito.carrito_id == carrito_id,
                ItemCarrito.variante_sku == variante_sku,
            )
            .first()
        )
        if not item:
            raise ValueError(f"El ítem '{variante_sku}' no se encuentra en el carrito")
        self._check_stock(variante_sku, cantidad)
        item.cantidad = cantidad
        self.db.commit()
        self.db.refresh(cart)
        return self.build_cart_response(cart)

    def remove_item(self, carrito_id: uuid.UUID, variante_sku: str) -> CartResponse | None:
        """
        Elimina un producto del carrito y recalcula el total (HU-04).

        Args:
            carrito_id: UUID del carrito.
            variante_sku: SKU de la variante a eliminar.

        Returns:
            CartResponse | None: Carrito actualizado o None si el carrito no existe.
        """
        cart = self.db.query(Carrito).filter(Carrito.id == carrito_id).first()
        if not cart:
            return None
        self.db.query(ItemCarrito).filter(
            ItemCarrito.carrito_id == carrito_id,
            ItemCarrito.variante_sku == variante_sku,
        ).delete()
        self.db.commit()
        self.db.refresh(cart)
        return self.build_cart_response(cart)

    def stock_of(self, variante_sku: str, sucursal_id: uuid.UUID | None = None) -> tuple[int, int | None]:
        """Piezas disponibles de la variante en todas las sucursales y en la sucursal pedida."""
        rows = (
            self.db.query(Inventario.sucursal_id, Inventario.cantidad_disponible)
            .filter(Inventario.variante_sku == variante_sku)
            .all()
        )
        total = sum(max(0, qty) for _, qty in rows)
        in_branch = None if sucursal_id is None else sum(max(0, q) for b, q in rows if b == sucursal_id)
        return int(total), in_branch

    def _check_stock(self, variante_sku: str, cantidad: int) -> None:
        """No deja pedir más piezas de las que hay entre todas las sucursales."""
        total, _ = self.stock_of(variante_sku)
        if cantidad > total:
            raise OutOfStockError(variante_sku, total)

    def merge_guest_cart(self, guest_cart_id: uuid.UUID, cliente_id: uuid.UUID) -> CartResponse:
        """Pasa los productos del carrito de invitado al de la cuenta (suma cantidades hasta el stock)."""
        cart = self.get_or_create_cart(cliente_id=cliente_id)
        guest = self.db.query(Carrito).filter(Carrito.id == guest_cart_id).first()
        if guest and guest.cliente_id is None and guest.estado == "activo" and guest.id != cart.id:
            current = {i.variante_sku: i for i in cart.items}
            for guest_item in guest.items:
                total, _ = self.stock_of(guest_item.variante_sku)
                existing = current.get(guest_item.variante_sku)
                wanted = min(MAX_CART_ITEMS, total, guest_item.cantidad + (existing.cantidad if existing else 0))
                if wanted <= 0:
                    continue
                if existing:
                    existing.cantidad = wanted
                else:
                    self.db.add(ItemCarrito(carrito_id=cart.id, variante_sku=guest_item.variante_sku, cantidad=wanted))
            guest.estado = "abandonado"
            self.db.commit()
            self.db.refresh(cart)
        return self.build_cart_response(cart)

    def build_cart_response(self, cart: Carrito, sucursal_id: uuid.UUID | None = None) -> CartResponse:
        """
        Calcula el detalle del carrito haciendo join con `variantes.precio` en tiempo real (Anexo 2.2.2 - 2FN).

        Args:
            cart: Entidad Carrito.

        Returns:
            CartResponse: Carrito con precios vigentes y total exacto.
        """
        item_responses: list[CartItemDetailResponse] = []
        total = Decimal("0.00")
        for item in cart.items:
            variante = item.variante or self.db.query(Variante).filter(Variante.sku == item.variante_sku).first()
            precio_vigente = Decimal(str(variante.precio)) if variante else Decimal("0.00")
            nombre_prod = (
                variante.producto.nombre
                if (variante and variante.producto)
                else item.variante_sku
            )
            subtotal = (precio_vigente * Decimal(item.cantidad)).quantize(Decimal("0.01"))
            total += subtotal
            stock_total, stock_branch = self.stock_of(item.variante_sku, sucursal_id)
            item_responses.append(
                CartItemDetailResponse(
                    variante_sku=item.variante_sku,
                    nombre_producto=nombre_prod,
                    cantidad=item.cantidad,
                    precio_unitario_vigente=precio_vigente,
                    subtotal=subtotal,
                    imagen_url=variante.imagen_url if variante else None,
                    atributos=dict(variante.atributos or {}) if variante else {},
                    producto_sku=variante.producto.variantes[0].sku if variante and variante.producto else None,
                    stock_disponible=stock_total,
                    stock_sucursal=stock_branch,
                )
            )
        return CartResponse(
            id=cart.id,
            cliente_id=cart.cliente_id,
            fecha_creacion=cart.fecha_creacion,
            estado=cart.estado,
            items=item_responses,
            total=total.quantize(Decimal("0.01")),
        )
