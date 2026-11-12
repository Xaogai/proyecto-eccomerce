"""Repositorio de Catálogo siguiendo el Patrón Repositorio (Sec. 14.2)."""

from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal
import unicodedata
import uuid
from typing import Any
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from backend.services.catalog.app.schemas import (
    CategoryPathItem,
    Facet,
    FacetOption,
    ImageResponse,
    ProductCreateRequest,
    ProductDetailResponse,
    ReviewResponse,
    ReviewSummary,
    VariantResponse,
)
from backend.shared.models import (
    Categoria,
    Cliente,
    Inventario,
    ItemPedido,
    Pedido,
    Producto,
    Resena,
    Sucursal,
    Usuario,
    Variante,
)

PAGE_SIZE_DEFAULT = 20
PAGE_SIZE_MAX = 96
ESTADOS_PEDIDO_COMPRADO = {"confirmado", "en_preparacion", "listo_para_recoger", "enviado", "entregado"}


def normalize_text(text: str) -> str:
    """Minúsculas y sin acentos, para buscar "rotomartillo" y encontrar "Rotomartillo"."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


@dataclass
class ProductQuery:
    """Filtros del listado (HU-01, HU-09). Los precios van en pesos."""

    category_id: uuid.UUID | None = None
    page: int = 1
    page_size: int = PAGE_SIZE_DEFAULT
    q: str | None = None
    marcas: list[str] = field(default_factory=list)
    atributos: dict[str, list[str]] = field(default_factory=dict)
    min_price: Decimal | None = None
    max_price: Decimal | None = None
    orden: str = "relevancia"
    sucursal_id: uuid.UUID | None = None
    disponible_hoy: bool = False


@dataclass
class _Row:
    """Producto ya serializado con los datos que usan los filtros y el orden."""

    product: Producto
    detail: ProductDetailResponse
    min_price: Decimal
    attrs: dict[str, set[str]]


class ProductRepository:
    """Encapsula el acceso a datos de categorías, productos y variantes (Sec. 14.2)."""

    def __init__(self, db_session: Session) -> None:
        """Inicializa el repositorio con la sesión de base de datos."""
        self.db = db_session

    def list_categories_tree(self) -> list[dict[str, Any]]:
        """
        Lista las categorías jerárquicas hasta 3 niveles (HU-01).

        Returns:
            list[dict[str, Any]]: Árbol de categorías raíz con sus subcategorías.
        """
        all_cats = self.db.query(Categoria).order_by(Categoria.nombre).all()
        by_parent: dict[uuid.UUID | None, list[Categoria]] = {}
        for cat in all_cats:
            by_parent.setdefault(cat.categoria_padre_id, []).append(cat)

        def build_node(cat: Categoria, depth: int) -> dict[str, Any]:
            children = by_parent.get(cat.id, []) if depth < 3 else []
            return {
                "id": cat.id,
                "nombre": cat.nombre,
                "categoria_padre_id": cat.categoria_padre_id,
                "subcategorias": [build_node(child, depth + 1) for child in children],
            }

        roots = by_parent.get(None, [])
        return [build_node(root, 1) for root in roots]

    def create_category(self, nombre: str, categoria_padre_id: uuid.UUID | None = None) -> Categoria:
        """
        Crea una nueva categoría en el catálogo.

        Args:
            nombre: Nombre de la categoría.
            categoria_padre_id: UUID de la categoría padre opcional.

        Returns:
            Categoria: Entidad creada.
        """
        cat = Categoria(nombre=nombre, categoria_padre_id=categoria_padre_id)
        self.db.add(cat)
        self.db.commit()
        self.db.refresh(cat)
        return cat

    def category_with_descendants(self, category_id: uuid.UUID) -> set[uuid.UUID]:
        """IDs de la categoría y de todas sus subcategorías (un departamento muestra todo lo que contiene)."""
        rows = self.db.query(Categoria.id, Categoria.categoria_padre_id).all()
        children: dict[uuid.UUID | None, list[uuid.UUID]] = {}
        for cat_id, parent_id in rows:
            children.setdefault(parent_id, []).append(cat_id)
        found: set[uuid.UUID] = set()
        pending = [category_id]
        while pending:
            current = pending.pop()
            if current in found:
                continue
            found.add(current)
            pending.extend(children.get(current, []))
        return found

    def category_path(self, category_id: uuid.UUID) -> list[CategoryPathItem]:
        """Ruta desde el departamento hasta la categoría del producto (migas de pan)."""
        path: list[CategoryPathItem] = []
        current = self.db.get(Categoria, category_id)
        while current is not None and len(path) < 3:
            path.insert(0, CategoryPathItem(id=current.id, nombre=current.nombre))
            current = current.padre
        return path

    def _rating(self, product_id: uuid.UUID) -> tuple[float, int]:
        avg, count = (
            self.db.query(func.avg(Resena.calificacion), func.count(Resena.id))
            .filter(Resena.producto_id == product_id)
            .one()
        )
        return round(float(avg or 0), 1), int(count or 0)

    def _stock(self, sku: str, sucursal_id: uuid.UUID | None) -> tuple[int, int | None]:
        """Piezas disponibles (sin las apartadas) en todas las sucursales y en la sucursal pedida."""
        rows = (
            self.db.query(Inventario.sucursal_id, Inventario.cantidad_disponible, Inventario.cantidad_reservada)
            .filter(Inventario.variante_sku == sku)
            .all()
        )
        total = sum(max(0, disp) for _, disp, _ in rows)
        in_branch = None
        if sucursal_id is not None:
            in_branch = sum(max(0, disp) for branch, disp, _ in rows if branch == sucursal_id)
        return int(total), in_branch

    def _serialize_product(
        self, product: Producto, sucursal_id: uuid.UUID | None = None, with_path: bool = False
    ) -> ProductDetailResponse:
        """Construye la respuesta de un producto con stock por variante, imágenes y calificación."""
        variant_responses: list[VariantResponse] = []
        for var in product.variantes:
            total_stock, branch_stock = self._stock(var.sku, sucursal_id)
            variant_responses.append(
                VariantResponse(
                    sku=var.sku,
                    producto_id=var.producto_id,
                    atributos=var.atributos or {},
                    precio=Decimal(str(var.precio)),
                    imagen_url=var.imagen_url,
                    stock_disponible=total_stock,
                    stock_sucursal=branch_stock,
                )
            )
        images = [ImageResponse(url=img.url, texto_alternativo=img.texto_alternativo) for img in product.imagenes]
        if not images:
            images = [
                ImageResponse(url=var.imagen_url, texto_alternativo=product.nombre)
                for var in product.variantes[:1]
                if var.imagen_url
            ]
        avg, count = self._rating(product.id)
        return ProductDetailResponse(
            id=product.id,
            categoria_id=product.categoria_id,
            nombre=product.nombre,
            descripcion=product.descripcion,
            marca=product.marca,
            variantes=variant_responses,
            estado=product.estado,
            especificaciones=product.especificaciones or {},
            imagenes=images,
            calificacion_promedio=avg,
            total_resenas=count,
            ruta_categoria=self.category_path(product.categoria_id) if with_path else [],
        )

    def get_by_sku(
        self, sku: str, sucursal_id: uuid.UUID | None = None, include_drafts: bool = False
    ) -> ProductDetailResponse | None:
        """
        Obtiene el detalle de un producto y todas sus variantes a partir de un SKU (Sec. 13.1, 14.2).

        Args:
            sku: Código único de variante (SKU).
            sucursal_id: Sucursal para informar el stock de cada variante en ella.
            include_drafts: Si es False, un producto en borrador no se encuentra (tienda pública).

        Returns:
            ProductDetailResponse | None: Producto con variantes y stock, o None si no existe.
        """
        variante = self.db.query(Variante).filter(Variante.sku == sku).first()
        if not variante:
            return None
        if variante.producto.estado != "publicado" and not include_drafts:
            return None
        return self._serialize_product(variante.producto, sucursal_id=sucursal_id, with_path=True)

    def _rows(self, query: ProductQuery) -> list[_Row]:
        """Productos publicados de la categoría y la búsqueda, antes de los filtros de facetas."""
        db_query = (
            self.db.query(Producto)
            .options(selectinload(Producto.variantes), selectinload(Producto.imagenes))
            .filter(Producto.estado == "publicado")
        )
        if query.category_id is not None:
            db_query = db_query.filter(Producto.categoria_id.in_(self.category_with_descendants(query.category_id)))
        rows: list[_Row] = []
        terms = normalize_text(query.q).split() if query.q else []
        for product in db_query.all():
            if not product.variantes:
                continue
            if terms:
                haystack = normalize_text(f"{product.nombre} {product.marca or ''} {product.descripcion or ''}")
                if not all(term in haystack for term in terms):
                    continue
            attrs: dict[str, set[str]] = {}
            for var in product.variantes:
                for key, value in (var.atributos or {}).items():
                    attrs.setdefault(str(key), set()).add(str(value))
            if product.marca:
                attrs["marca"] = {product.marca}
            rows.append(
                _Row(
                    product=product,
                    detail=self._serialize_product(product, sucursal_id=query.sucursal_id),
                    min_price=min(Decimal(str(v.precio)) for v in product.variantes),
                    attrs=attrs,
                )
            )
        return rows

    @staticmethod
    def _passes(row: _Row, query: ProductQuery, except_key: str | None = None) -> bool:
        """Aplica los filtros menos el de la faceta `except_key` (así cada faceta cuenta sobre el resto)."""
        selected = dict(query.atributos)
        if query.marcas:
            selected["marca"] = query.marcas
        for key, values in selected.items():
            if key == except_key or not values:
                continue
            wanted = {normalize_text(v) for v in values}
            if not {normalize_text(v) for v in row.attrs.get(key, set())} & wanted:
                return False
        if except_key != "precio":
            if query.min_price is not None and row.min_price < query.min_price:
                return False
            if query.max_price is not None and row.min_price > query.max_price:
                return False
        if query.disponible_hoy and query.sucursal_id is not None:
            if not any((v.stock_sucursal or 0) > 0 for v in row.detail.variantes):
                return False
        return True

    @staticmethod
    def _facets(rows: list[_Row], query: ProductQuery) -> list[Facet]:
        """Marca primero y después cada atributo, con conteos que respetan los demás filtros."""
        keys = ["marca", *sorted({k for r in rows for k in r.attrs if k != "marca"})]
        selected = dict(query.atributos)
        if query.marcas:
            selected["marca"] = query.marcas
        facets: list[Facet] = []
        for key in keys:
            counts: dict[str, int] = {}
            for row in rows:
                if ProductRepository._passes(row, query, except_key=key):
                    for value in row.attrs.get(key, set()):
                        counts[value] = counts.get(value, 0) + 1
            chosen = selected.get(key, [])
            for value in chosen:
                counts.setdefault(value, 0)
            if len(counts) < 2 and not chosen:
                continue
            titulo = "Marca" if key == "marca" else key.replace("_", " ").capitalize()
            facets.append(
                Facet(
                    clave=key,
                    titulo=titulo,
                    opciones=[
                        FacetOption(valor=value, total=total, seleccionada=value in chosen)
                        for value, total in sorted(counts.items(), key=lambda kv: normalize_text(kv[0]))
                    ],
                )
            )
        return facets

    @staticmethod
    def _sort_key(query: ProductQuery) -> Callable[[_Row], Any]:
        """Criterio de orden: precio, calificación o relevancia de la búsqueda."""
        terms = normalize_text(query.q).split() if query.q else []

        def relevance(row: _Row) -> tuple[int, int]:
            name = normalize_text(row.product.nombre)
            score = sum(3 if name.startswith(t) else 2 if t in name else 1 for t in terms)
            return (-score, -row.detail.total_resenas)

        sorters: dict[str, Callable[[_Row], Any]] = {
            "precio_asc": lambda r: r.min_price,
            "precio_desc": lambda r: -r.min_price,
            "calificacion": lambda r: (-r.detail.calificacion_promedio, -r.detail.total_resenas),
            "nuevo": lambda r: normalize_text(r.product.nombre),
        }
        return sorters.get(query.orden, relevance)

    def search(self, query: ProductQuery) -> tuple[list[ProductDetailResponse], int, list[Facet]]:
        """
        Lista productos publicados con filtros combinables, facetas, orden y paginación (HU-01, HU-09).

        Returns:
            tuple: Productos de la página, total de coincidencias y facetas.
        """
        rows = self._rows(query)
        filtered = sorted((r for r in rows if self._passes(r, query)), key=self._sort_key(query))
        start = (query.page - 1) * query.page_size
        page_items = [r.detail for r in filtered[start : start + query.page_size]]
        return page_items, len(filtered), self._facets(rows, query)

    def list_by_category(
        self,
        category_id: uuid.UUID | None = None,
        page: int = 1,
        marca: str | None = None,
        min_price: Decimal | None = None,
        max_price: Decimal | None = None,
        q: str | None = None,
        atributo_clave: str | None = None,
        atributo_valor: str | None = None,
    ) -> tuple[list[ProductDetailResponse], int]:
        """Compatibilidad con la firma anterior: delega en `search`."""
        atributos = {atributo_clave: [atributo_valor]} if atributo_clave and atributo_valor else {}
        items, total, _ = self.search(
            ProductQuery(
                category_id=category_id,
                page=page,
                q=q,
                marcas=[marca] if marca else [],
                atributos=atributos,
                min_price=min_price,
                max_price=max_price,
            )
        )
        return items, total

    def create_product(self, payload: ProductCreateRequest) -> ProductDetailResponse:
        """
        Da de alta un producto junto con sus variantes e inventario inicial (HU-08, Sec. 19 Completitud).

        Args:
            payload: Datos del producto y su lista de variantes (mínimo 1).

        Returns:
            ProductDetailResponse: Producto creado con variantes.
        """
        requested_skus = [v.sku for v in payload.variantes]
        if len(requested_skus) != len(set(requested_skus)):
            raise ValueError("El producto contiene SKUs duplicados en la misma solicitud")
        existing_sku = (
            self.db.query(Variante.sku)
            .filter(Variante.sku.in_(requested_skus))
            .first()
        )
        if existing_sku is not None:
            raise ValueError(f"El SKU '{existing_sku[0]}' ya se encuentra registrado en el catálogo")

        product = Producto(
            categoria_id=payload.categoria_id,
            nombre=payload.nombre,
            descripcion=payload.descripcion,
            marca=payload.marca,
        )
        self.db.add(product)
        self.db.flush()

        default_branch = self.db.query(Sucursal).first()
        for var_in in payload.variantes:
            variante = Variante(
                sku=var_in.sku,
                producto_id=product.id,
                atributos=var_in.atributos,
                precio=var_in.precio,
                imagen_url=var_in.imagen_url,
            )
            self.db.add(variante)
            self.db.flush()

            branch_id = var_in.sucursal_id or (default_branch.id if default_branch else None)
            if branch_id is not None:
                inv = Inventario(
                    sucursal_id=branch_id,
                    variante_sku=variante.sku,
                    cantidad_disponible=var_in.stock_inicial,
                    cantidad_reservada=0,
                )
                self.db.add(inv)

        self.db.commit()
        self.db.refresh(product)
        return self._serialize_product(product)

    def update_variant_price(self, sku: str, new_price: Decimal) -> tuple[Variante | None, Decimal | None]:
        """
        Actualiza el precio de una variante y retorna el precio anterior para auditoría.

        Args:
            sku: SKU de la variante.
            new_price: Nuevo precio de venta.

        Returns:
            tuple[Variante | None, Decimal | None]: Variante actualizada y precio previo.
        """
        variante = self.db.query(Variante).filter(Variante.sku == sku).first()
        if not variante:
            return None, None
        old_price = Decimal(str(variante.precio))
        variante.precio = new_price
        self.db.commit()
        self.db.refresh(variante)
        return variante, old_price

    # Reseñas

    def list_reviews(
        self, product_id: uuid.UUID, page: int, page_size: int
    ) -> tuple[list[ReviewResponse], int, ReviewSummary]:
        """Reseñas del producto, las más recientes primero, con promedio y conteo por estrellas."""
        base = self.db.query(Resena).filter(Resena.producto_id == product_id)
        total = base.count()
        reviews = base.order_by(Resena.fecha.desc()).offset((page - 1) * page_size).limit(page_size).all()
        by_star = [0, 0, 0, 0, 0]
        for (rating,) in self.db.query(Resena.calificacion).filter(Resena.producto_id == product_id).all():
            by_star[5 - int(rating)] += 1
        avg, _ = self._rating(product_id)
        return (
            [self._serialize_review(r) for r in reviews],
            total,
            ReviewSummary(promedio=avg, total=total, por_estrellas=by_star),
        )

    @staticmethod
    def _serialize_review(review: Resena) -> ReviewResponse:
        return ReviewResponse(
            id=review.id,
            autor=review.autor,
            calificacion=review.calificacion,
            titulo=review.titulo,
            comentario=review.comentario,
            fecha=review.fecha,
            compra_verificada=review.compra_verificada,
        )

    def has_purchased(self, user_id: uuid.UUID, product_id: uuid.UUID) -> bool:
        """True si el usuario tiene un pedido pagado con alguna variante del producto."""
        return (
            self.db.query(ItemPedido)
            .join(Pedido, Pedido.id == ItemPedido.pedido_id)
            .join(Variante, Variante.sku == ItemPedido.variante_sku)
            .join(Cliente, Cliente.usuario_id == Pedido.cliente_id)
            .filter(
                Pedido.cliente_id == user_id,
                Variante.producto_id == product_id,
                Pedido.estado.in_(ESTADOS_PEDIDO_COMPRADO),
            )
            .first()
            is not None
        )

    def create_review(
        self, product_id: uuid.UUID, user: Usuario, calificacion: int, titulo: str, comentario: str
    ) -> ReviewResponse:
        """Guarda la reseña con autor "Nombre I." y compra verificada si el usuario compró el producto."""
        parts = user.nombre.split()
        autor = f"{parts[0]} {parts[1][0]}." if len(parts) > 1 else user.nombre
        review = Resena(
            producto_id=product_id,
            usuario_id=user.id,
            autor=autor,
            calificacion=calificacion,
            titulo=titulo.strip(),
            comentario=comentario.strip(),
            compra_verificada=self.has_purchased(user.id, product_id),
        )
        self.db.add(review)
        self.db.commit()
        self.db.refresh(review)
        return self._serialize_review(review)
