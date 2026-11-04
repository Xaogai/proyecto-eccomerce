"""Modelos ORM de SQLAlchemy 2.0 correspondientes al Diccionario de Datos (16 tablas en 2FN)."""

from datetime import datetime, timezone
from decimal import Decimal
import uuid
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.shared.database import Base

JSONVariant = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    """Retorna la fecha y hora actual en UTC."""
    return datetime.now(timezone.utc)


class Usuario(Base):
    """3.1 Tabla `usuarios`: Datos comunes a cualquier tipo de usuario del sistema."""

    __tablename__ = "usuarios"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(150), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    fecha_registro: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    tipo_usuario: Mapped[str] = mapped_column(String(20), nullable=False)  # 'cliente', 'admin', 'staff'
    telefono: Mapped[str | None] = mapped_column(String(20), nullable=True)
    acepta_marketing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    acepta_personalizacion: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    cliente: Mapped["Cliente | None"] = relationship("Cliente", back_populates="usuario", uselist=False, cascade="all, delete-orphan")
    administrador: Mapped["Administrador | None"] = relationship("Administrador", back_populates="usuario", uselist=False, cascade="all, delete-orphan")
    staff_sucursal: Mapped["StaffSucursal | None"] = relationship("StaffSucursal", back_populates="usuario", uselist=False, cascade="all, delete-orphan")


class Cliente(Base):
    """3.2 Tabla `clientes`: Extiende a `usuarios` para usuarios con rol de cliente."""

    __tablename__ = "clientes"

    usuario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("usuarios.id", ondelete="CASCADE"),
        primary_key=True,
    )

    usuario: Mapped["Usuario"] = relationship("Usuario", back_populates="cliente")
    direcciones: Mapped[list["Direccion"]] = relationship("Direccion", back_populates="cliente", cascade="all, delete-orphan")
    carritos: Mapped[list["Carrito"]] = relationship("Carrito", back_populates="cliente")
    pedidos: Mapped[list["Pedido"]] = relationship("Pedido", back_populates="cliente")


class Administrador(Base):
    """3.3 Tabla `administradores`: Extiende a `usuarios` para el personal administrativo."""

    __tablename__ = "administradores"

    usuario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("usuarios.id", ondelete="CASCADE"),
        primary_key=True,
    )
    rol: Mapped[str] = mapped_column(String(50), nullable=False, default="superadmin")

    usuario: Mapped["Usuario"] = relationship("Usuario", back_populates="administrador")


class StaffSucursal(Base):
    """3.4 Tabla `staff_sucursal`: Extiende a `usuarios` para personal operativo asignado a sucursal."""

    __tablename__ = "staff_sucursal"

    usuario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("usuarios.id", ondelete="CASCADE"),
        primary_key=True,
    )
    sucursal_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sucursales.id", ondelete="RESTRICT"),
        nullable=False,
    )

    usuario: Mapped["Usuario"] = relationship("Usuario", back_populates="staff_sucursal")
    sucursal: Mapped["Sucursal"] = relationship("Sucursal", back_populates="personal_staff")


class Direccion(Base):
    """3.5 Tabla `direcciones`: Direcciones de entrega asociadas a un cliente."""

    __tablename__ = "direcciones"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cliente_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("clientes.usuario_id", ondelete="CASCADE"),
        nullable=False,
    )
    calle: Mapped[str] = mapped_column(String(200), nullable=False)
    ciudad: Mapped[str] = mapped_column(String(100), nullable=False)
    codigo_postal: Mapped[str] = mapped_column(String(10), nullable=False)
    es_predeterminada: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    alias: Mapped[str | None] = mapped_column(String(50), nullable=True)
    nombre_recibe: Mapped[str | None] = mapped_column(String(150), nullable=True)
    numero_exterior: Mapped[str | None] = mapped_column(String(20), nullable=True)
    numero_interior: Mapped[str | None] = mapped_column(String(20), nullable=True)
    colonia: Mapped[str | None] = mapped_column(String(100), nullable=True)
    entidad: Mapped[str | None] = mapped_column(String(100), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(20), nullable=True)
    referencias: Mapped[str | None] = mapped_column(String(300), nullable=True)

    cliente: Mapped["Cliente"] = relationship("Cliente", back_populates="direcciones")


class Sucursal(Base):
    """3.6 Tabla `sucursales`: Puntos físicos de la tienda para inventario y recolección."""

    __tablename__ = "sucursales"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    direccion_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("direcciones.id", ondelete="SET NULL"),
        nullable=True,
    )
    telefono: Mapped[str | None] = mapped_column(String(20), nullable=True)
    horario: Mapped[str | None] = mapped_column(String(150), nullable=True)
    latitud: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitud: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    servicios: Mapped[list[str]] = mapped_column(JSONVariant, nullable=False, default=list)

    direccion: Mapped["Direccion | None"] = relationship("Direccion")
    inventario_items: Mapped[list["Inventario"]] = relationship("Inventario", back_populates="sucursal", cascade="all, delete-orphan")
    personal_staff: Mapped[list["StaffSucursal"]] = relationship("StaffSucursal", back_populates="sucursal")


class Categoria(Base):
    """3.7 Tabla `categorias`: Estructura jerárquica de categorías de producto."""

    __tablename__ = "categorias"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    categoria_padre_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("categorias.id", ondelete="SET NULL"),
        nullable=True,
    )

    padre: Mapped["Categoria | None"] = relationship("Categoria", remote_side="Categoria.id", back_populates="subcategorias")
    subcategorias: Mapped[list["Categoria"]] = relationship("Categoria", back_populates="padre")
    productos: Mapped[list["Producto"]] = relationship("Producto", back_populates="categoria")


class Producto(Base):
    """3.8 Tabla `productos`: Producto genérico independiente de sus variantes."""

    __tablename__ = "productos"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    categoria_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("categorias.id", ondelete="RESTRICT"),
        nullable=False,
    )
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    marca: Mapped[str | None] = mapped_column(String(100), nullable=True)
    estado: Mapped[str] = mapped_column(String(15), nullable=False, default="publicado")  # 'borrador', 'publicado'
    especificaciones: Mapped[dict[str, Any]] = mapped_column(JSONVariant, nullable=False, default=dict)

    categoria: Mapped["Categoria"] = relationship("Categoria", back_populates="productos")
    variantes: Mapped[list["Variante"]] = relationship("Variante", back_populates="producto", cascade="all, delete-orphan")
    imagenes: Mapped[list["ImagenProducto"]] = relationship(
        "ImagenProducto", back_populates="producto", cascade="all, delete-orphan", order_by="ImagenProducto.orden"
    )
    resenas: Mapped[list["Resena"]] = relationship("Resena", back_populates="producto", cascade="all, delete-orphan")


class Variante(Base):
    """3.9 Tabla `variantes`: SKU específico de un producto con atributos, precio e imagen."""

    __tablename__ = "variantes"

    sku: Mapped[str] = mapped_column(String(50), primary_key=True)
    producto_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("productos.id", ondelete="CASCADE"),
        nullable=False,
    )
    atributos: Mapped[dict[str, Any]] = mapped_column(JSONVariant, nullable=False, default=dict)
    precio: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    imagen_url: Mapped[str | None] = mapped_column(String(300), nullable=True)

    producto: Mapped["Producto"] = relationship("Producto", back_populates="variantes")
    inventarios: Mapped[list["Inventario"]] = relationship("Inventario", back_populates="variante", cascade="all, delete-orphan")


class Inventario(Base):
    """3.10 Tabla `inventario`: Existencias de cada variante por sucursal (PK compuesta)."""

    __tablename__ = "inventario"

    sucursal_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sucursales.id", ondelete="CASCADE"),
        primary_key=True,
    )
    variante_sku: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("variantes.sku", ondelete="CASCADE"),
        primary_key=True,
    )
    cantidad_disponible: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cantidad_reservada: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pasillo: Mapped[str | None] = mapped_column(String(20), nullable=True)

    sucursal: Mapped["Sucursal"] = relationship("Sucursal", back_populates="inventario_items")
    variante: Mapped["Variante"] = relationship("Variante", back_populates="inventarios")


class Carrito(Base):
    """3.11 Tabla `carritos`: Carrito de compras de un cliente registrado o invitado."""

    __tablename__ = "carritos"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cliente_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("clientes.usuario_id", ondelete="SET NULL"),
        nullable=True,
    )
    fecha_creacion: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="activo")  # 'activo', 'abandonado', 'convertido'

    cliente: Mapped["Cliente | None"] = relationship("Cliente", back_populates="carritos")
    items: Mapped[list["ItemCarrito"]] = relationship("ItemCarrito", back_populates="carrito", cascade="all, delete-orphan")


class ItemCarrito(Base):
    """3.12 Tabla `item_carrito`: Productos dentro de un carrito en 2FN (sin precio_unitario)."""

    __tablename__ = "item_carrito"

    carrito_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("carritos.id", ondelete="CASCADE"),
        primary_key=True,
    )
    variante_sku: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("variantes.sku", ondelete="CASCADE"),
        primary_key=True,
    )
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    carrito: Mapped["Carrito"] = relationship("Carrito", back_populates="items")
    variante: Mapped["Variante"] = relationship("Variante")


class Pedido(Base):
    """3.13 Tabla `pedidos`: Pedido confirmado generado a partir de un carrito tras el checkout."""

    __tablename__ = "pedidos"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cliente_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("clientes.usuario_id", ondelete="RESTRICT"),
        nullable=False,
    )
    folio: Mapped[str] = mapped_column(String(30), unique=True, nullable=False, index=True)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    estado: Mapped[str] = mapped_column(String(30), nullable=False, default="pendiente_pago")
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    codigo_recoleccion: Mapped[str | None] = mapped_column(String(6), nullable=True)

    cliente: Mapped["Cliente"] = relationship("Cliente", back_populates="pedidos")
    items: Mapped[list["ItemPedido"]] = relationship("ItemPedido", back_populates="pedido", cascade="all, delete-orphan")
    pagos: Mapped[list["Pago"]] = relationship("Pago", back_populates="pedido", cascade="all, delete-orphan")
    envios: Mapped[list["Envio"]] = relationship("Envio", back_populates="pedido", cascade="all, delete-orphan")
    historial: Mapped[list["HistorialPedido"]] = relationship(
        "HistorialPedido", back_populates="pedido", cascade="all, delete-orphan", order_by="HistorialPedido.fecha"
    )
    devoluciones: Mapped[list["Devolucion"]] = relationship(
        "Devolucion", back_populates="pedido", cascade="all, delete-orphan"
    )


class ItemPedido(Base):
    """3.14 Tabla `item_pedido`: Detalle de productos en un pedido con precio congelado de venta."""

    __tablename__ = "item_pedido"

    pedido_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("pedidos.id", ondelete="CASCADE"),
        primary_key=True,
    )
    variante_sku: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("variantes.sku", ondelete="RESTRICT"),
        primary_key=True,
    )
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    precio_unitario_venta: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    pedido: Mapped["Pedido"] = relationship("Pedido", back_populates="items")
    variante: Mapped["Variante"] = relationship("Variante")


class Pago(Base):
    """3.15 Tabla `pagos`: Registro de la transacción de pago asociada a un pedido (sin datos de tarjeta PCI-DSS)."""

    __tablename__ = "pagos"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pedido_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("pedidos.id", ondelete="CASCADE"),
        nullable=False,
    )
    monto: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    metodo: Mapped[str] = mapped_column(String(30), nullable=False)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="procesando")  # 'procesando', 'aprobado', 'rechazado', 'reembolsado'
    referencia_pasarela: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)

    pedido: Mapped["Pedido"] = relationship("Pedido", back_populates="pagos")


class Envio(Base):
    """3.16 Tabla `envios`: Información logística de entrega de un pedido."""

    __tablename__ = "envios"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pedido_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("pedidos.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)  # 'domicilio' o 'recoleccion_tienda'
    costo: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    numero_guia: Mapped[str | None] = mapped_column(String(50), nullable=True)
    estado: Mapped[str] = mapped_column(String(30), nullable=False, default="pendiente")  # 'pendiente', 'enviado', 'entregado', 'incidencia'
    sucursal_recoleccion_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sucursales.id", ondelete="SET NULL"),
        nullable=True,
    )
    direccion_entrega: Mapped[str | None] = mapped_column(String(400), nullable=True)

    pedido: Mapped["Pedido"] = relationship("Pedido", back_populates="envios")
    sucursal_recoleccion: Mapped["Sucursal | None"] = relationship("Sucursal")


# ---------------------------------------------------------------------------
# Tablas operativas (infraestructura): sustituyen el estado en memoria del proceso para que la
# plataforma sea persistente y segura con varias instancias. No forman parte del Diccionario de
# Datos de negocio (Anexo 3, 16 tablas); se versionan en la migración 0002.
# ---------------------------------------------------------------------------


class BitacoraAuditoria(Base):
    """Bitácora persistente de operaciones sensibles (Sec. 29.6, AE-39)."""

    __tablename__ = "bitacora_auditoria"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)
    tipo_evento: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    actor_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    recurso: Mapped[str] = mapped_column(String(255), nullable=False)
    detalles: Mapped[dict[str, Any]] = mapped_column(JSONVariant, nullable=False, default=dict)


class TokenRevocado(Base):
    """JTI de tokens JWT revocados por logout o rotación (AE-22)."""

    __tablename__ = "tokens_revocados"

    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    revocado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


class IntentoLoginFallido(Base):
    """Intentos fallidos de inicio de sesión para el bloqueo por fuerza bruta (Sec. 18.1)."""

    __tablename__ = "intentos_login_fallidos"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


class ReservaInventario(Base):
    """Reserva temporal de inventario con TTL (HU-05, RQ-DISP-001), ligada opcionalmente a un pedido."""

    __tablename__ = "reservas_inventario"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    variante_sku: Mapped[str] = mapped_column(
        String(50),
        ForeignKey("variantes.sku", ondelete="CASCADE"),
        nullable=False,
    )
    sucursal_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sucursales.id", ondelete="CASCADE"),
        nullable=False,
    )
    pedido_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("pedidos.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    estado: Mapped[str] = mapped_column(String(15), nullable=False, default="active", index=True)
    creada_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    expira_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)


class EventoWebhook(Base):
    """Eventos de webhook de pasarela ya procesados, para garantizar idempotencia (AE-29)."""

    __tablename__ = "eventos_webhook"

    event_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    resultado: Mapped[dict[str, Any]] = mapped_column(JSONVariant, nullable=False, default=dict)
    procesado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


# ---------------------------------------------------------------------------
# Tablas de la tienda en línea (migración 0003): imágenes, reseñas, lista de deseos, historial de
# estados del pedido, devoluciones y configuración que usa el frontend.
# ---------------------------------------------------------------------------


class ImagenProducto(Base):
    """Imágenes del producto con texto alternativo obligatorio (WCAG 1.1.1)."""

    __tablename__ = "imagenes_producto"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producto_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("productos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    texto_alternativo: Mapped[str] = mapped_column(String(200), nullable=False)
    orden: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    producto: Mapped["Producto"] = relationship("Producto", back_populates="imagenes")


class Resena(Base):
    """Reseña de un producto escrita por un cliente."""

    __tablename__ = "resenas"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producto_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("productos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    usuario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True
    )
    autor: Mapped[str] = mapped_column(String(150), nullable=False)
    calificacion: Mapped[int] = mapped_column(Integer, nullable=False)
    titulo: Mapped[str] = mapped_column(String(120), nullable=False)
    comentario: Mapped[str] = mapped_column(Text, nullable=False)
    compra_verificada: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    producto: Mapped["Producto"] = relationship("Producto", back_populates="resenas")


class ListaDeseos(Base):
    """Productos guardados por un usuario con el precio que tenían al guardarlos."""

    __tablename__ = "lista_deseos"

    usuario_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True
    )
    variante_sku: Mapped[str] = mapped_column(
        String(50), ForeignKey("variantes.sku", ondelete="CASCADE"), primary_key=True
    )
    precio_guardado: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    variante: Mapped["Variante"] = relationship("Variante")


class HistorialPedido(Base):
    """Cada cambio de estado de un pedido (línea de tiempo del cliente y registro del admin)."""

    __tablename__ = "historial_pedidos"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pedido_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("pedidos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    estado: Mapped[str] = mapped_column(String(30), nullable=False)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    actor: Mapped[str] = mapped_column(String(150), nullable=False, default="Sistema")
    nota: Mapped[str | None] = mapped_column(String(300), nullable=True)

    pedido: Mapped["Pedido"] = relationship("Pedido", back_populates="historial")


class Devolucion(Base):
    """Solicitud de devolución de un pedido entregado."""

    __tablename__ = "devoluciones"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pedido_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("pedidos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    folio: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    motivo: Mapped[str] = mapped_column(String(50), nullable=False)
    comentario: Mapped[str | None] = mapped_column(Text, nullable=True)
    articulos: Mapped[list[dict[str, Any]]] = mapped_column(JSONVariant, nullable=False, default=list)
    foto: Mapped[str | None] = mapped_column(String(300), nullable=True)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="solicitada")
    monto_reembolso: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    pedido: Mapped["Pedido"] = relationship("Pedido", back_populates="devoluciones")


class Configuracion(Base):
    """Configuración de la tienda editable por el admin (funciones activas, envíos y seguridad)."""

    __tablename__ = "configuracion"

    clave: Mapped[str] = mapped_column(String(60), primary_key=True)
    valor: Mapped[Any] = mapped_column(JSONVariant, nullable=False)
