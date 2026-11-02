"""Esquemas Pydantic para el servicio de Catálogo (Categorías, Productos y Variantes)."""

from decimal import Decimal
import uuid
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class CategoryCreateRequest(BaseModel):
    """Solicitud para crear una categoría (soporta jerarquía con categoria_padre_id)."""

    nombre: str = Field(..., min_length=2, max_length=100)
    categoria_padre_id: uuid.UUID | None = None


class CategoryTreeResponse(BaseModel):
    """Representación jerárquica de una categoría y sus subcategorías (HU-01)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    categoria_padre_id: uuid.UUID | None = None
    subcategorias: list["CategoryTreeResponse"] = Field(default_factory=list)


class VariantCreateInput(BaseModel):
    """Datos de una variante al dar de alta un producto (HU-02, HU-08)."""

    sku: str = Field(..., min_length=2, max_length=50)
    atributos: dict[str, Any] = Field(default_factory=dict)
    precio: Decimal = Field(..., gt=Decimal("0.00"))
    imagen_url: str | None = Field(default=None, max_length=300)
    stock_inicial: int = Field(default=0, ge=0)
    sucursal_id: uuid.UUID | None = None


class ProductCreateRequest(BaseModel):
    """Solicitud para dar de alta un producto con al menos una variante (Sec. 19 Completitud, HU-08)."""

    categoria_id: uuid.UUID
    nombre: str = Field(..., min_length=2, max_length=200)
    descripcion: str | None = None
    marca: str | None = Field(default=None, max_length=100)
    variantes: list[VariantCreateInput] = Field(..., min_length=1)


class VariantPriceUpdateRequest(BaseModel):
    """Solicitud para actualizar el precio de una variante (registra auditoría)."""

    precio: Decimal = Field(..., gt=Decimal("0.00"))


class VariantResponse(BaseModel):
    """Detalle de variante con SKU, atributos, precio y stock disponible (HU-02)."""

    sku: str
    producto_id: uuid.UUID
    atributos: dict[str, Any]
    precio: Decimal
    imagen_url: str | None = None
    stock_disponible: int = 0


class ProductDetailResponse(BaseModel):
    """Detalle completo de un producto y todas sus variantes (HU-01, HU-02)."""

    id: uuid.UUID
    categoria_id: uuid.UUID
    nombre: str
    descripcion: str | None = None
    marca: str | None = None
    variantes: list[VariantResponse]


class PaginatedProductsResponse(BaseModel):
    """Respuesta paginada del listado/búsqueda de productos."""

    page: int
    page_size: int
    total: int
    items: list[ProductDetailResponse]
