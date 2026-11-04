"""Endpoints REST del microservicio de Catálogo (Sec. 13.1, HU-01, HU-02, HU-08, HU-09)."""

from decimal import Decimal
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from backend.services.catalog.app.product_repository import (
    PAGE_SIZE_DEFAULT,
    PAGE_SIZE_MAX,
    ProductQuery,
    ProductRepository,
)
from backend.services.catalog.app.schemas import (
    CategoryCreateRequest,
    CategoryTreeResponse,
    PaginatedProductsResponse,
    PaginatedReviewsResponse,
    ProductCreateRequest,
    ProductDetailResponse,
    ReviewCreateRequest,
    ReviewResponse,
    VariantPriceUpdateRequest,
)
from backend.shared.database import get_db
from backend.shared.models import Categoria, Usuario, Variante
from backend.shared.security import get_current_user, record_audit_event, require_roles

router = APIRouter(prefix="/api/v1", tags=["Catálogo y Búsqueda"])


def get_product_repository(db: Session = Depends(get_db)) -> ProductRepository:
    """Inyección de dependencias para ProductRepository conforme a Sec. 14.2."""
    return ProductRepository(db)


@router.get("/categories", response_model=list[CategoryTreeResponse])
def list_categories(
    repo: ProductRepository = Depends(get_product_repository),
) -> list[dict[str, Any]]:
    """
    Lista las categorías jerárquicas disponibles hasta 3 niveles (Sec. 13.1, HU-01).
    """
    return repo.list_categories_tree()


@router.post("/categories", response_model=CategoryTreeResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreateRequest,
    admin_user: Usuario = Depends(require_roles("admin")),
    repo: ProductRepository = Depends(get_product_repository),
) -> Any:
    """Da de alta una nueva categoría en el catálogo (requiere rol admin)."""
    cat = repo.create_category(payload.nombre, payload.categoria_padre_id)
    record_audit_event("category_created", str(admin_user.id), f"category:{cat.id}", {"nombre": cat.nombre})
    return {
        "id": cat.id,
        "nombre": cat.nombre,
        "categoria_padre_id": cat.categoria_padre_id,
        "subcategorias": [],
    }


@router.get("/products/{sku}", response_model=ProductDetailResponse)
def get_product(
    sku: str,
    sucursal_id: uuid.UUID | None = Query(default=None, description="Sucursal para el stock de cada variante"),
    repo: ProductRepository = Depends(get_product_repository),
) -> ProductDetailResponse:
    """
    Obtiene el detalle de un producto publicado y sus variantes por SKU (Sec. 13.1, Sec. 14.2, HU-02).
    """
    product = repo.get_by_sku(sku, sucursal_id=sucursal_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    return product


def _parse_attributes(raw: list[str] | str) -> dict[str, list[str]]:
    """Convierte `atributo=color:rojo,azul` (repetible) en {"color": ["rojo", "azul"]}."""
    parsed: dict[str, list[str]] = {}
    for item in [raw] if isinstance(raw, str) else raw:
        key, _, values = item.partition(":")
        if key and values:
            parsed.setdefault(key.strip(), []).extend(v.strip() for v in values.split(",") if v.strip())
    return parsed


@router.get("/products", response_model=PaginatedProductsResponse)
def list_products(
    category: uuid.UUID | None = Query(default=None, description="ID de categoría (incluye sus subcategorías)"),
    categoria_id: uuid.UUID | None = Query(default=None, description="Alias de ID de categoría"),
    page: int = Query(default=1, ge=1, description="Número de página"),
    page_size: int = Query(default=PAGE_SIZE_DEFAULT, ge=1, le=PAGE_SIZE_MAX),
    marca: str | None = Query(default=None, description="Una o varias marcas separadas por coma (HU-09)"),
    min_price: Decimal | None = Query(default=None, ge=0),
    max_price: Decimal | None = Query(default=None, ge=0),
    q: str | None = Query(default=None, description="Búsqueda por texto en nombre, marca y descripción"),
    atributo: list[str] = Query(default=[], description="Filtro `clave:valor1,valor2` (repetible)"),
    atributo_clave: str | None = Query(default=None, description="Clave de atributo (ej. color)"),
    atributo_valor: str | None = Query(default=None, description="Valor de atributo (ej. rojo)"),
    orden: str = Query(default="relevancia", pattern="^(relevancia|precio_asc|precio_desc|nuevo|calificacion)$"),
    sucursal_id: uuid.UUID | None = Query(default=None, description="Sucursal para el stock de cada producto"),
    disponible_hoy: bool = Query(default=False, description="Solo productos con stock en sucursal_id"),
    repo: ProductRepository = Depends(get_product_repository),
) -> PaginatedProductsResponse:
    """
    Lista productos publicados con filtros combinables, facetas, orden y paginación (Sec. 13.1, HU-01, HU-09).
    """
    atributos = _parse_attributes(atributo)
    if atributo_clave and atributo_valor:
        atributos.setdefault(atributo_clave, []).append(atributo_valor)
    items, total, facetas = repo.search(
        ProductQuery(
            category_id=category or categoria_id,
            page=page,
            page_size=page_size,
            q=q,
            marcas=[m.strip() for m in marca.split(",") if m.strip()] if marca else [],
            atributos=atributos,
            min_price=min_price,
            max_price=max_price,
            orden=orden,
            sucursal_id=sucursal_id,
            disponible_hoy=disponible_hoy,
        )
    )
    return PaginatedProductsResponse(page=page, page_size=page_size, total=total, items=items, facetas=facetas)


@router.get("/products/{sku}/resenas", response_model=PaginatedReviewsResponse)
def list_product_reviews(
    sku: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=5, ge=1, le=50),
    repo: ProductRepository = Depends(get_product_repository),
) -> PaginatedReviewsResponse:
    """Reseñas de un producto, las más recientes primero, con el resumen por estrellas."""
    product = repo.get_by_sku(sku)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    items, total, summary = repo.list_reviews(product.id, page, page_size)
    return PaginatedReviewsResponse(page=page, page_size=page_size, total=total, items=items, resumen=summary)


@router.post("/products/{sku}/resenas", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
def create_product_review(
    sku: str,
    payload: ReviewCreateRequest,
    current_user: Usuario = Depends(get_current_user),
    repo: ProductRepository = Depends(get_product_repository),
) -> ReviewResponse:
    """Publica la reseña de un cliente; se marca como compra verificada si compró el producto."""
    product = repo.get_by_sku(sku)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    review = repo.create_review(product.id, current_user, payload.calificacion, payload.titulo, payload.comentario)
    record_audit_event("review_created", str(current_user.id), f"product:{product.id}", {"rating": review.calificacion})
    return review


@router.get("/product-image/{sku}.svg", include_in_schema=False)
def get_product_svg_illustration(sku: str, db: Session = Depends(get_db)) -> Response:
    """Genera dinámicamente la ilustración vectorial comercial de una variante de producto."""
    variante = db.query(Variante).filter(Variante.sku == sku).first()
    title = variante.producto.nombre[:28] if (variante and variante.producto) else sku
    brand = (variante.producto.marca or "FERREMARKET PRO").upper() if (variante and variante.producto) else "PRO"
    attrs = " • ".join(str(v) for v in (variante.atributos or {}).values())[:36] if variante else ""
    color_name = str((variante.atributos or {}).get("color", "")).lower() if variante else ""
    palette = {
        "rojo": ("#7f1d1d", "#ef4444"),
        "amarillo": ("#713f12", "#facc15"),
        "azul": ("#1e3a8a", "#38bdf8"),
        "naranja": ("#7c2d12", "#f97316"),
        "terracota": ("#7c2d12", "#fb923c"),
        "blanco": ("#0f766e", "#2dd4bf"),
    }
    bg_hex, accent_hex = palette.get(color_name, ("#1e293b", "#f96302"))
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0%" stop-color="{bg_hex}"/><stop offset="100%" stop-color="#0f172a"/>'
        f'</linearGradient></defs>'
        f'<rect width="480" height="320" fill="url(#g)"/>'
        f'<circle cx="400" cy="70" r="90" fill="{accent_hex}" opacity="0.22"/>'
        f'<rect x="28" y="26" width="150" height="28" rx="6" fill="{accent_hex}"/>'
        f'<text x="103" y="45" font-family="Segoe UI, Arial, sans-serif" font-size="12" font-weight="800" '
        f'fill="#0f172a" text-anchor="middle">{brand}</text>'
        f'<text x="28" y="185" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="800" '
        f'fill="#ffffff">{title}</text>'
        f'<text x="28" y="218" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="600" '
        f'fill="#cbd5e1">{sku} — {attrs}</text>'
        f'<rect x="28" y="248" width="96" height="6" rx="3" fill="{accent_hex}"/>'
        f'</svg>'
    )
    return Response(content=svg, media_type="image/svg+xml")


@router.post("/products", response_model=ProductDetailResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreateRequest,
    admin_user: Usuario = Depends(require_roles("admin")),
    repo: ProductRepository = Depends(get_product_repository),
) -> ProductDetailResponse:
    """
    Da de alta un producto y sus variantes (HU-08, Sec. 19 Completitud).
    """
    cat = repo.db.query(Categoria).filter(Categoria.id == payload.categoria_id).first()
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="La categoría especificada no existe")
    product = repo.create_product(payload)
    record_audit_event(
        "product_created",
        str(admin_user.id),
        f"product:{product.id}",
        {"nombre": product.nombre, "variantes_count": len(product.variantes)},
    )
    return product


@router.patch("/variants/{sku}/price")
def update_variant_price(
    sku: str,
    payload: VariantPriceUpdateRequest,
    admin_user: Usuario = Depends(require_roles("admin")),
    repo: ProductRepository = Depends(get_product_repository),
) -> dict[str, Any]:
    """
    Actualiza el precio de una variante y deja constancia en la bitácora de auditoría.
    """
    variante, old_price = repo.update_variant_price(sku, payload.precio)
    if not variante:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variante no encontrada")
    record_audit_event(
        "price_change",
        str(admin_user.id),
        f"variant:{sku}",
        {"old_price": str(old_price), "new_price": str(payload.precio)},
    )
    return {"sku": variante.sku, "precio_anterior": old_price, "precio_nuevo": variante.precio}
