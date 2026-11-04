"""Solicitud de devolución de un pedido entregado (Mi cuenta, EP-19): productos, motivo, foto y reembolso."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
from pathlib import Path
import secrets
import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from backend.shared.config import settings
from backend.shared.configuracion import get_section
from backend.shared.database import get_db
from backend.shared.models import Devolucion, Pedido, Usuario
from backend.shared.security import get_current_user, record_audit_event

router = APIRouter(prefix="/api/v1/orders", tags=["Checkout y Pedidos"])

MOTIVOS_CON_FOTO = {"danado", "faltan_piezas"}
FOTO_MAX_BYTES = 5 * 1024 * 1024
FOTO_TIPOS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


class ReturnItemInput(BaseModel):
    """Producto y piezas a devolver."""

    variante_sku: str
    cantidad: int = Field(..., ge=1)


class ReturnData(BaseModel):
    """Campo `data` (JSON) del formulario de devolución."""

    articulos: list[ReturnItemInput] = Field(default_factory=list)
    motivo: str = ""
    comentario: str | None = Field(default=None, max_length=2000)
    metodo: str = Field(default="tienda", pattern="^(tienda|recoleccion)$")


class ReturnResponse(BaseModel):
    """Devolución registrada con instrucciones y monto a reembolsar."""

    id: uuid.UUID
    folio: str
    estado: str
    instrucciones: str
    monto_reembolso: Decimal


def _field_errors(errors: dict[str, str]) -> HTTPException:
    """422 con el formato de FastAPI para que el frontend marque cada campo."""
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=[{"loc": ["body", field], "msg": msg, "type": "value_error"} for field, msg in errors.items()],
    )


def _returned_qty(pedido: Pedido) -> dict[str, int]:
    """Piezas ya devueltas por SKU (en devoluciones que no fueron rechazadas)."""
    returned: dict[str, int] = {}
    for dev in pedido.devoluciones:
        if dev.estado == "rechazada":
            continue
        for art in dev.articulos:
            returned[art["variante_sku"]] = returned.get(art["variante_sku"], 0) + int(art["cantidad"])
    return returned


def _check_window(db: Session, pedido: Pedido) -> None:
    """Solo pedidos entregados y dentro del plazo de devolución configurado."""
    entregado = next((h.fecha for h in reversed(pedido.historial) if h.estado == "entregado"), None)
    dias = int(get_section(db, "envios")["dias_devolucion"])
    if pedido.estado != "entregado" or entregado is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "not_returnable", "message": "Solo se pueden devolver pedidos entregados."},
        )
    if entregado.tzinfo is None:
        entregado = entregado.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > entregado + timedelta(days=dias):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "return_window_closed", "message": "El plazo para devolver este pedido ya terminó."},
        )


def _validate(pedido: Pedido, data: ReturnData, foto: UploadFile | None) -> Decimal:
    """Revisa productos, piezas, motivo y foto; regresa el monto a reembolsar."""
    errors: dict[str, str] = {}
    if not data.articulos:
        errors["articulos"] = "Elige al menos un producto."
    if not data.motivo:
        errors["motivo"] = "Elige el motivo."
    if data.motivo in MOTIVOS_CON_FOTO and foto is None:
        errors["foto"] = "Agrega una foto del problema."
    if foto is not None and foto.content_type not in FOTO_TIPOS:
        errors["foto"] = "La foto debe ser JPG, PNG o WebP."
    comprados = {i.variante_sku: i for i in pedido.items}
    devueltos = _returned_qty(pedido)
    refund = Decimal("0.00")
    for art in data.articulos:
        item = comprados.get(art.variante_sku)
        if item is None or art.cantidad > item.cantidad - devueltos.get(art.variante_sku, 0):
            errors["articulos"] = "Revisa las piezas: no puedes devolver más de las que compraste."
            continue
        refund += Decimal(str(item.precio_unitario_venta)) * art.cantidad
    if errors:
        raise _field_errors(errors)
    return refund.quantize(Decimal("0.01"))


async def _save_photo(foto: UploadFile) -> str:
    """Guarda la foto en la carpeta de medios con nombre aleatorio y regresa ese nombre."""
    contenido = await foto.read()
    if len(contenido) > FOTO_MAX_BYTES:
        raise _field_errors({"foto": "La foto pesa más de 5 MB."})
    carpeta = Path(settings.media_dir) / "devoluciones"
    carpeta.mkdir(parents=True, exist_ok=True)
    nombre = f"{uuid.uuid4().hex}{FOTO_TIPOS[str(foto.content_type)]}"
    (carpeta / nombre).write_bytes(contenido)
    return f"devoluciones/{nombre}"


@router.post("/{order_id}/devoluciones", response_model=ReturnResponse, status_code=status.HTTP_201_CREATED)
async def create_return(
    order_id: uuid.UUID,
    data: str = Form(..., description="JSON con articulos, motivo, comentario y metodo"),
    foto: UploadFile | None = File(default=None),
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ReturnResponse:
    """Registra la devolución de productos de un pedido propio entregado dentro del plazo."""
    pedido = db.get(Pedido, order_id)
    if pedido is None or pedido.cliente_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado")
    try:
        parsed = ReturnData.model_validate(json.loads(data))
    except (ValueError, ValidationError) as exc:
        raise _field_errors({"data": "No pudimos leer la solicitud."}) from exc
    _check_window(db, pedido)
    refund = _validate(pedido, parsed, foto)
    foto_path = await _save_photo(foto) if foto is not None else None

    devolucion = Devolucion(
        pedido_id=pedido.id,
        folio=f"DEV-{secrets.randbelow(90000) + 10000}",
        motivo=parsed.motivo,
        comentario=parsed.comentario,
        articulos=[a.model_dump() for a in parsed.articulos],
        foto=foto_path,
        estado="en_revision",
        monto_reembolso=refund,
    )
    db.add(devolucion)
    db.commit()
    record_audit_event(
        "return_requested", str(current_user.id), f"order:{pedido.folio}", {"folio": devolucion.folio, "monto": str(refund)}
    )
    return ReturnResponse(
        id=devolucion.id,
        folio=devolucion.folio,
        estado=devolucion.estado,
        instrucciones=_instructions(pedido, parsed.metodo),
        monto_reembolso=refund,
    )


def _instructions(pedido: Pedido, metodo: str) -> str:
    """Qué hacer después según cómo entrega el cliente el producto."""
    if metodo == "recoleccion":
        return "Te llamaremos en 2 días hábiles para acordar la recolección en tu domicilio."
    envio: Any = pedido.envios[0] if pedido.envios else None
    sucursal = envio.sucursal_recoleccion.nombre if envio and envio.sucursal_recoleccion else "cualquier sucursal"
    return f"Lleva el producto con su empaque a {sucursal} y muestra el folio de la devolución."
