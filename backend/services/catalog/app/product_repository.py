"""Repositorio de Catálogo siguiendo el Patrón Repositorio (Sec. 14.2)."""

from decimal import Decimal
import uuid
from typing import Any
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.services.catalog.app.schemas import (
    ProductCreateRequest,
    ProductDetailResponse,
    VariantResponse,
)
from backend.shared.models import Categoria, Inventario, Producto, Sucursal, Variante

PAGE_SIZE_DEFAULT = 20


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
        all_cats = self.db.query(Categoria).all()
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

    def _serialize_product(self, product: Producto) -> ProductDetailResponse:
        """Construye la respuesta de un producto incluyendo el stock total por variante."""
        variant_responses: list[VariantResponse] = []
        for var in product.variantes:
            total_stock = (
                self.db.query(func.coalesce(func.sum(Inventario.cantidad_disponible), 0))
                .filter(Inventario.variante_sku == var.sku)
                .scalar()
            )
            variant_responses.append(
                VariantResponse(
                    sku=var.sku,
                    producto_id=var.producto_id,
                    atributos=var.atributos or {},
                    precio=Decimal(str(var.precio)),
                    imagen_url=var.imagen_url,
                    stock_disponible=int(total_stock or 0),
                )
            )
        return ProductDetailResponse(
            id=product.id,
            categoria_id=product.categoria_id,
            nombre=product.nombre,
            descripcion=product.descripcion,
            marca=product.marca,
            variantes=variant_responses,
        )

    def get_by_sku(self, sku: str) -> ProductDetailResponse | None:
        """
        Obtiene el detalle de un producto y todas sus variantes a partir de un SKU (Sec. 13.1, 14.2).

        Args:
            sku: Código único de variante (SKU).

        Returns:
            ProductDetailResponse | None: Producto con variantes y stock, o None si no existe.
        """
        variante = self.db.query(Variante).filter(Variante.sku == sku).first()
        if not variante:
            return None
        return self._serialize_product(variante.producto)

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
        """
        Lista productos paginados con soporte de filtrado por categoría, marca, precio y atributos (HU-01, HU-09).

        Args:
            category_id: UUID de la categoría a filtrar.
            page: Número de página (1-indexed).
            marca: Filtro opcional por marca.
            min_price: Precio mínimo de variante.
            max_price: Precio máximo de variante.
            q: Término de búsqueda en nombre o descripción.
            atributo_clave: Clave de atributo dinámico (ej. 'color').
            atributo_valor: Valor esperado del atributo.

        Returns:
            tuple[list[ProductDetailResponse], int]: Lista de productos y total de coincidencias.
        """
        query = self.db.query(Producto)
        if category_id is not None:
            query = query.filter(Producto.categoria_id == category_id)
        if marca:
            query = query.filter(Producto.marca.ilike(f"%{marca}%"))
        if q:
            query = query.filter(Producto.nombre.ilike(f"%{q}%"))
        if min_price is not None or max_price is not None:
            query = query.join(Variante)
            if min_price is not None:
                query = query.filter(Variante.precio >= min_price)
            if max_price is not None:
                query = query.filter(Variante.precio <= max_price)
            query = query.distinct()

        products = query.offset((page - 1) * PAGE_SIZE_DEFAULT).limit(PAGE_SIZE_DEFAULT).all()
        results = [self._serialize_product(p) for p in products]
        if atributo_clave and atributo_valor:
            results = [
                r
                for r in results
                if any(str(v.atributos.get(atributo_clave, "")).lower() == atributo_valor.lower() for v in r.variantes)
            ]
        return results, len(results)

    def create_product(self, payload: ProductCreateRequest) -> ProductDetailResponse:
        """
        Da de alta un producto junto con sus variantes e inventario inicial (HU-08, Sec. 19 Completitud).

        Args:
            payload: Datos del producto y su lista de variantes (mínimo 1).

        Returns:
            ProductDetailResponse: Producto creado con variantes.
        """
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
