"""Catálogo del admin: productos con variantes, publicación, imágenes y árbol de categorías (EP-35 a EP-40)."""

from decimal import Decimal
from pathlib import Path
import secrets
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.services.catalog.app.product_repository import ProductRepository, normalize_text
from backend.shared.config import settings
from backend.shared.database import get_db
from backend.shared.models import Categoria, ImagenProducto, Inventario, ItemPedido, Producto, Sucursal, Usuario, Variante
from backend.shared.security import record_audit_event, require_roles

router = APIRouter(prefix="/api/v1/admin", tags=["Administración y Auditoría"])
media_router = APIRouter(prefix="/api/v1/media", tags=["Administración y Auditoría"], include_in_schema=False)

IMAGEN_TIPOS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
IMAGEN_MAX_BYTES = 5 * 1024 * 1024
MAX_NIVELES = 3


class VariantInput(BaseModel):
    """Variante en el formulario del admin; sin SKU se crea una nueva."""

    sku: str | None = Field(default=None, max_length=50)
    etiqueta: str = Field(default="Única", max_length=100)
    precio: Decimal = Field(default=Decimal("0.00"), ge=0)
    stock_total: int = Field(default=0, ge=0)


class ProductInput(BaseModel):
    """Información general y lista completa de variantes (las que no vienen se borran)."""

    nombre: str = Field(..., min_length=2, max_length=200)
    marca: str = Field(default="", max_length=100)
    categoria_id: uuid.UUID
    descripcion: str = ""
    especificaciones: dict[str, str] = Field(default_factory=dict)
    variantes: list[VariantInput] = Field(default_factory=list)


class CategoryInput(BaseModel):
    """Categoría nueva (hasta 3 niveles)."""

    nombre: str = Field(..., min_length=2, max_length=100)
    padre_id: uuid.UUID | None = None


class CategoryRename(BaseModel):
    """Nuevo nombre de la categoría."""

    nombre: str = Field(..., min_length=2, max_length=100)


def label_of(atributos: dict[str, Any]) -> str:
    """La misma etiqueta que muestra la tienda: "Rojo · 20V"."""
    values = [str(v) for v in (atributos or {}).values() if str(v)]
    return " · ".join(v[:1].upper() + v[1:] for v in values) or "Única"


def stock_total(db: Session, sku: str) -> int:
    """Piezas disponibles de la variante en todas las sucursales."""
    return int(
        db.query(func.coalesce(func.sum(Inventario.cantidad_disponible), 0)).filter(Inventario.variante_sku == sku).scalar()
        or 0
    )


def admin_status(db: Session, product: Producto) -> str:
    """Borrador, o publicado / agotado según el stock."""
    if product.estado != "publicado":
        return "borrador"
    return "publicado" if any(stock_total(db, v.sku) > 0 for v in product.variantes) else "agotado"


def category_label(db: Session, category_id: uuid.UUID) -> str:
    """"Herramientas Eléctricas › Taladros" (sin el departamento)."""
    path = ProductRepository(db).category_path(category_id)
    return " › ".join(c.nombre for c in path[1:]) or (path[0].nombre if path else "")


def product_row(db: Session, p: Producto) -> dict[str, Any]:
    """Renglón del listado del admin."""
    precios = [Decimal(str(v.precio)) for v in p.variantes if v.precio > 0]
    return {
        "id": p.id,
        "sku": p.variantes[0].sku if p.variantes else "",
        "nombre": p.nombre,
        "categoria_id": p.categoria_id,
        "categoria": category_label(db, p.categoria_id),
        "total_variantes": len(p.variantes),
        "precio_desde": min(precios) if precios else None,
        "stock_total": sum(stock_total(db, v.sku) for v in p.variantes),
        "estado": admin_status(db, p),
    }


def product_detail(db: Session, p: Producto) -> dict[str, Any]:
    """Ficha completa para el formulario de edición."""
    return {
        "id": p.id,
        "sku": p.variantes[0].sku if p.variantes else "",
        "nombre": p.nombre,
        "marca": p.marca or "",
        "categoria_id": p.categoria_id,
        "descripcion": p.descripcion or "",
        "especificaciones": {k: str(v) for k, v in (p.especificaciones or {}).items()},
        "imagenes": [{"id": i.id, "url": i.url, "texto_alternativo": i.texto_alternativo} for i in p.imagenes],
        "variantes": [
            {"sku": v.sku, "etiqueta": label_of(v.atributos), "precio": v.precio, "stock_total": stock_total(db, v.sku)}
            for v in p.variantes
        ],
        "estado": admin_status(db, p),
    }


def _product(db: Session, product_id: uuid.UUID) -> Producto:
    product = db.get(Producto, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    return product


def _set_stock(db: Session, sku: str, wanted: int) -> None:
    """Ajusta la diferencia en la primera sucursal (el detalle por sucursal se maneja en Sucursal)."""
    diff = wanted - stock_total(db, sku)
    if diff == 0:
        return
    branch = db.query(Sucursal).order_by(Sucursal.nombre).first()
    if branch is None:
        return
    inv = db.get(Inventario, (branch.id, sku))
    if inv is None:
        inv = Inventario(sucursal_id=branch.id, variante_sku=sku, cantidad_disponible=0, cantidad_reservada=0)
        db.add(inv)
    inv.cantidad_disponible = max(0, inv.cantidad_disponible + diff)


def _new_sku(db: Session, nombre: str) -> str:
    prefix = "".join(ch for ch in normalize_text(nombre).upper() if ch.isalnum())[:3] or "PRD"
    while True:
        sku = f"{prefix}-{secrets.randbelow(900000) + 100000}"
        if db.get(Variante, sku) is None:
            return sku


def _apply_variants(db: Session, product: Producto, variantes: list[VariantInput]) -> None:
    """Crea, actualiza y borra variantes; las que ya se vendieron no se pueden borrar."""
    wanted = {v.sku for v in variantes if v.sku}
    for existing in list(product.variantes):
        if existing.sku in wanted:
            continue
        if db.query(ItemPedido).filter(ItemPedido.variante_sku == existing.sku).first() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "variant_in_use", "message": f"La variante {existing.sku} ya tiene pedidos; no se puede borrar."},
            )
        product.variantes.remove(existing)
    db.flush()
    for v in variantes:
        variante = db.get(Variante, v.sku) if v.sku else None
        if variante is None or variante.producto_id != product.id:
            variante = Variante(sku=_new_sku(db, product.nombre), producto_id=product.id, atributos={}, precio=v.precio)
            db.add(variante)
        if v.etiqueta.strip() and v.etiqueta.strip() != label_of(variante.atributos):
            variante.atributos = {} if v.etiqueta.strip() == "Única" else {"versión": v.etiqueta.strip()}
        variante.precio = v.precio
        db.flush()
        _set_stock(db, variante.sku, v.stock_total)


def _validate_category(db: Session, category_id: uuid.UUID) -> None:
    if db.get(Categoria, category_id) is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[{"loc": ["body", "categoria_id"], "msg": "Elige una categoría.", "type": "value_error"}],
        )


@router.get("/products")
def list_admin_products(
    q: str | None = Query(default=None),
    categoria_id: uuid.UUID | None = Query(default=None),
    estado: str | None = Query(default=None, pattern="^(publicado|borrador|agotado)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Productos (incluidos borradores) con búsqueda por nombre o SKU y conteo por estado."""
    query = db.query(Producto)
    if categoria_id is not None:
        query = query.filter(Producto.categoria_id.in_(ProductRepository(db).category_with_descendants(categoria_id)))
    terms = normalize_text(q).split() if q else []
    rows = []
    for p in query.order_by(Producto.nombre).all():
        haystack = normalize_text(f"{p.nombre} {' '.join(v.sku for v in p.variantes)}")
        if all(t in haystack for t in terms):
            rows.append(product_row(db, p))
    conteos = {"todos": len(rows), **{e: sum(r["estado"] == e for r in rows) for e in ("publicado", "borrador", "agotado")}}
    filtered = [r for r in rows if not estado or r["estado"] == estado]
    start = (page - 1) * page_size
    return {"page": page, "page_size": page_size, "total": len(filtered), "items": filtered[start : start + page_size], "conteos": conteos}


@router.get("/products/{product_id}")
def get_admin_product(
    product_id: uuid.UUID, _admin: Usuario = Depends(require_roles("admin")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Ficha del producto para editarla."""
    return product_detail(db, _product(db, product_id))


@router.post("/products", status_code=status.HTTP_201_CREATED)
def create_admin_product(
    payload: ProductInput, admin: Usuario = Depends(require_roles("admin")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Producto nuevo; queda en borrador hasta publicarlo."""
    _validate_category(db, payload.categoria_id)
    product = Producto(
        categoria_id=payload.categoria_id,
        nombre=payload.nombre.strip(),
        marca=payload.marca.strip() or None,
        descripcion=payload.descripcion,
        especificaciones=payload.especificaciones,
        estado="borrador",
    )
    db.add(product)
    db.flush()
    _apply_variants(db, product, payload.variantes)
    db.commit()
    db.refresh(product)
    record_audit_event("product_created", str(admin.id), f"product:{product.id}", {"nombre": product.nombre})
    return product_detail(db, product)


@router.patch("/products/{product_id}")
def update_admin_product(
    product_id: uuid.UUID,
    payload: ProductInput,
    admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Guarda información, especificaciones y variantes; los cambios de precio quedan en la bitácora."""
    product = _product(db, product_id)
    _validate_category(db, payload.categoria_id)
    before = {v.sku: str(v.precio) for v in product.variantes}
    product.nombre = payload.nombre.strip()
    product.marca = payload.marca.strip() or None
    product.categoria_id = payload.categoria_id
    product.descripcion = payload.descripcion
    product.especificaciones = payload.especificaciones
    _apply_variants(db, product, payload.variantes)
    db.commit()
    db.refresh(product)
    for v in product.variantes:
        if v.sku in before and before[v.sku] != str(v.precio):
            record_audit_event(
                "price_change", str(admin.id), f"variant:{v.sku}", {"old_price": before[v.sku], "new_price": str(v.precio)}
            )
    return product_detail(db, product)


@router.post("/products/{product_id}/publicar")
def publish_product(
    product_id: uuid.UUID, admin: Usuario = Depends(require_roles("admin")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Publica solo si alguna variante tiene precio y stock (I2)."""
    product = _product(db, product_id)
    if not any(v.precio > 0 and stock_total(db, v.sku) > 0 for v in product.variantes):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "no_valid_variant", "message": "Para publicar necesitas una variante con precio y stock."},
        )
    product.estado = "publicado"
    db.commit()
    record_audit_event("product_published", str(admin.id), f"product:{product.id}")
    return product_detail(db, product)


@router.post("/products/{product_id}/despublicar")
def unpublish_product(
    product_id: uuid.UUID, admin: Usuario = Depends(require_roles("admin")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Regresa el producto a borrador (deja de verse en la tienda)."""
    product = _product(db, product_id)
    product.estado = "borrador"
    db.commit()
    record_audit_event("product_unpublished", str(admin.id), f"product:{product.id}")
    return product_detail(db, product)


@router.post("/products/{product_id}/imagenes", status_code=status.HTTP_201_CREATED)
async def upload_product_image(
    product_id: uuid.UUID,
    archivo: UploadFile = File(...),
    texto_alternativo: str = Form(..., min_length=3, max_length=200),
    _admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Imagen con texto alternativo obligatorio (WCAG 1.1.1); JPG, PNG o WebP hasta 5 MB."""
    product = _product(db, product_id)
    if archivo.content_type not in IMAGEN_TIPOS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[{"loc": ["body", "archivo"], "msg": "La imagen debe ser JPG, PNG o WebP.", "type": "value_error"}],
        )
    contenido = await archivo.read()
    if len(contenido) > IMAGEN_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[{"loc": ["body", "archivo"], "msg": "La imagen pesa más de 5 MB.", "type": "value_error"}],
        )
    carpeta = Path(settings.media_dir) / "productos"
    carpeta.mkdir(parents=True, exist_ok=True)
    nombre = f"{uuid.uuid4().hex}{IMAGEN_TIPOS[str(archivo.content_type)]}"
    (carpeta / nombre).write_bytes(contenido)
    imagen = ImagenProducto(
        producto_id=product.id,
        url=f"/api/v1/media/productos/{nombre}",
        texto_alternativo=texto_alternativo.strip(),
        orden=len(product.imagenes),
    )
    db.add(imagen)
    db.commit()
    return {"id": imagen.id, "url": imagen.url, "texto_alternativo": imagen.texto_alternativo}


@media_router.get("/productos/{nombre}")
def product_image_file(nombre: str) -> FileResponse:
    """Imágenes públicas de productos. Las fotos de devoluciones no se sirven aquí."""
    ruta = (Path(settings.media_dir) / "productos" / nombre).resolve()
    if ruta.parent != (Path(settings.media_dir) / "productos").resolve() or not ruta.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Imagen no encontrada")
    return FileResponse(ruta)


# Categorías


def _count_products(db: Session) -> dict[uuid.UUID, int]:
    rows = db.query(Producto.categoria_id, func.count(Producto.id)).group_by(Producto.categoria_id).all()
    return {cat_id: int(n) for cat_id, n in rows}


@router.get("/categories")
def admin_categories(_admin: Usuario = Depends(require_roles("admin")), db: Session = Depends(get_db)) -> list[dict[str, Any]]:
    """Árbol con cuántos productos tiene cada categoría (incluidas sus subcategorías)."""
    directos = _count_products(db)

    def node(c: dict[str, Any]) -> dict[str, Any]:
        children = [node(s) for s in c["subcategorias"]]
        total = directos.get(c["id"], 0) + sum(ch["total_productos"] for ch in children)
        return {"id": c["id"], "nombre": c["nombre"], "total_productos": total, "subcategorias": children}

    return [node(c) for c in ProductRepository(db).list_categories_tree()]


def _depth(db: Session, category: Categoria | None) -> int:
    depth = 0
    while category is not None:
        depth += 1
        category = category.padre
    return depth


@router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_admin_category(
    payload: CategoryInput, admin: Usuario = Depends(require_roles("admin")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Categoría nueva con nombre único entre sus hermanas y máximo 3 niveles."""
    padre = db.get(Categoria, payload.padre_id) if payload.padre_id else None
    if payload.padre_id and padre is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[{"loc": ["body", "padre_id"], "msg": "La categoría padre no existe.", "type": "value_error"}],
        )
    if _depth(db, padre) >= MAX_NIVELES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "max_depth", "message": "Máximo 3 niveles: una subcategoría no admite más niveles."},
        )
    _unique_name(db, payload.nombre, payload.padre_id)
    categoria = Categoria(nombre=payload.nombre.strip(), categoria_padre_id=payload.padre_id)
    db.add(categoria)
    db.commit()
    record_audit_event("category_created", str(admin.id), f"category:{categoria.id}", {"nombre": categoria.nombre})
    return {"id": categoria.id, "nombre": categoria.nombre}


def _unique_name(db: Session, nombre: str, padre_id: uuid.UUID | None, exclude: uuid.UUID | None = None) -> None:
    hermanas = db.query(Categoria).filter(Categoria.categoria_padre_id == padre_id).all()
    if any(normalize_text(c.nombre) == normalize_text(nombre) and c.id != exclude for c in hermanas):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[{"loc": ["body", "nombre"], "msg": "Ya existe una categoría con ese nombre.", "type": "value_error"}],
        )


@router.patch("/categories/{category_id}")
def rename_admin_category(
    category_id: uuid.UUID,
    payload: CategoryRename,
    admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Renombra la categoría (su dirección web en la tienda cambia con el nombre)."""
    categoria = db.get(Categoria, category_id)
    if categoria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoría no encontrada")
    _unique_name(db, payload.nombre, categoria.categoria_padre_id, exclude=categoria.id)
    categoria.nombre = payload.nombre.strip()
    db.commit()
    record_audit_event("category_renamed", str(admin.id), f"category:{categoria.id}", {"nombre": categoria.nombre})
    return {"id": categoria.id, "nombre": categoria.nombre}


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_admin_category(
    category_id: uuid.UUID, admin: Usuario = Depends(require_roles("admin")), db: Session = Depends(get_db)
) -> None:
    """Solo se borra una categoría sin subcategorías ni productos."""
    categoria = db.get(Categoria, category_id)
    if categoria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoría no encontrada")
    if categoria.subcategorias or categoria.productos:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "not_empty", "message": "Solo puedes eliminar categorías sin productos ni subcategorías."},
        )
    db.delete(categoria)
    db.commit()
    record_audit_event("category_deleted", str(admin.id), f"category:{category_id}")
