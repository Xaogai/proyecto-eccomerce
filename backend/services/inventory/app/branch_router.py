"""Panel de sucursal: inventario con ajustes, pedidos para recoger y entrega en mostrador (EP-48 a EP-52)."""

from datetime import datetime, timedelta, timezone
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.shared.database import get_db
from backend.shared.estados_pedido import TransicionInvalida, cambiar_estado, permitidas
from backend.shared.models import Envio, Inventario, Pedido, Producto, Sucursal, Usuario, Variante
from backend.shared.security import record_audit_event, require_roles

router = APIRouter(prefix="/api/v1/sucursal", tags=["Inventario y Sucursales"])

STOCK_MINIMO = 5
ATRASO = timedelta(hours=1)
PASOS_SUCURSAL = ("en_preparacion", "listo_para_recoger")


class AdjustInput(BaseModel):
    """Ajuste de piezas con su motivo (merma, conteo, devolución…)."""

    delta: int
    motivo: str = Field(..., min_length=3, max_length=200)


class StepInput(BaseModel):
    """Siguiente paso del pedido en la sucursal."""

    estado: str = Field(..., pattern="^(en_preparacion|listo_para_recoger)$")


class VerifyInput(BaseModel):
    """Código de 4 dígitos que muestra el cliente."""

    codigo: str
    pedido_id: uuid.UUID | None = None


class HandoverInput(BaseModel):
    """Entrega confirmada con identificación y productos revisados."""

    codigo: str
    identificacion_revisada: bool = False
    productos_revisados: bool = False


def branch_of(
    sucursal_id: uuid.UUID | None = Query(default=None, description="Solo admin: sucursal a consultar"),
    user: Usuario = Depends(require_roles("staff", "admin")),
    db: Session = Depends(get_db),
) -> Sucursal:
    """El staff ve solo la suya; el admin elige cualquiera (la primera si no indica)."""
    if user.tipo_usuario == "staff":
        if user.staff_sucursal is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes una sucursal asignada")
        return user.staff_sucursal.sucursal
    sucursal = db.get(Sucursal, sucursal_id) if sucursal_id else db.query(Sucursal).order_by(Sucursal.nombre).first()
    if sucursal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sucursal no encontrada")
    return sucursal


def _store(s: Sucursal) -> dict[str, Any]:
    return {"id": s.id, "nombre": s.nombre}


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _label(atributos: dict[str, Any]) -> str:
    values = [str(v) for v in (atributos or {}).values() if str(v)]
    return " · ".join(v[:1].upper() + v[1:] for v in values) or "Única"


# Pagados que siguen en el anaquel: el pago ya los descontó de disponibles, pero aún no salen de la sucursal.
EN_ANAQUEL = ("confirmado", "en_preparacion", "listo_para_recoger")


def _committed(db: Session, sucursal: Sucursal) -> dict[str, int]:
    """Piezas por SKU de pedidos pagados que esta sucursal todavía no entrega ni envía."""
    piezas: dict[str, int] = {}
    pedidos = (
        db.query(Pedido)
        .join(Envio, Envio.pedido_id == Pedido.id)
        .filter(Envio.sucursal_recoleccion_id == sucursal.id, Pedido.estado.in_(EN_ANAQUEL))
        .all()
    )
    for pedido in pedidos:
        for item in pedido.items:
            piezas[item.variante_sku] = piezas.get(item.variante_sku, 0) + item.cantidad
    return piezas


def _inventory_row(variante: Variante, inv: Inventario | None, comprometidas: int) -> dict[str, Any]:
    """Piezas = disponibles + apartadas (en checkout o pagadas sin entregar); las apartadas no se pueden vender."""
    apartadas = (inv.cantidad_reservada if inv else 0) + comprometidas
    piezas = (inv.cantidad_disponible if inv else 0) + apartadas
    estado = "out" if piezas <= 0 else "low" if piezas <= STOCK_MINIMO else "ok"
    return {
        "sku": variante.sku,
        "nombre": variante.producto.nombre,
        "etiqueta": _label(variante.atributos),
        "pasillo": (inv.pasillo if inv and inv.pasillo else "Sin asignar"),
        "piezas": piezas,
        "apartadas": apartadas,
        "minimo": STOCK_MINIMO,
        "estado": estado,
    }


def _rows(db: Session, sucursal: Sucursal) -> list[dict[str, Any]]:
    inventario = {i.variante_sku: i for i in db.query(Inventario).filter(Inventario.sucursal_id == sucursal.id)}
    variantes = (
        db.query(Variante).join(Producto).filter(Producto.estado == "publicado").order_by(Producto.nombre, Variante.sku).all()
    )
    comprometidas = _committed(db, sucursal)
    return [_inventory_row(v, inventario.get(v.sku), comprometidas.get(v.sku, 0)) for v in variantes]


@router.get("/inventario")
def branch_inventory(
    q: str | None = Query(default=None, description="Producto, SKU o pasillo"),
    estado: str | None = Query(default=None, pattern="^(low|out)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    sucursal: Sucursal = Depends(branch_of),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Inventario de la sucursal con conteo de pocas piezas y agotados."""
    texto = (q or "").strip().lower()
    todas = [r for r in _rows(db, sucursal) if not texto or texto in f"{r['nombre']} {r['sku']} {r['pasillo']}".lower()]
    conteos = {"todos": len(todas), "low": sum(r["estado"] == "low" for r in todas), "out": sum(r["estado"] == "out" for r in todas)}
    filtradas = [r for r in todas if not estado or r["estado"] == estado]
    start = (page - 1) * page_size
    return {
        "sucursal": _store(sucursal),
        "page": page,
        "page_size": page_size,
        "total": len(filtradas),
        "items": filtradas[start : start + page_size],
        "conteos": conteos,
    }


@router.post("/inventario/{sku}/ajuste")
def adjust_inventory(
    sku: str,
    payload: AdjustInput,
    sucursal: Sucursal = Depends(branch_of),
    user: Usuario = Depends(require_roles("staff", "admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Suma o resta piezas con motivo; nunca deja menos piezas de las apartadas por pedidos."""
    variante = db.get(Variante, sku)
    if variante is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Producto no encontrado")
    if payload.delta == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[{"loc": ["body", "delta"], "msg": "El ajuste debe ser de al menos una pieza.", "type": "value_error"}],
        )
    inv = db.get(Inventario, (sucursal.id, sku))
    if inv is None:
        inv = Inventario(sucursal_id=sucursal.id, variante_sku=sku, cantidad_disponible=0, cantidad_reservada=0)
        db.add(inv)
    apartadas = inv.cantidad_reservada + _committed(db, sucursal).get(sku, 0)
    if inv.cantidad_disponible + payload.delta < 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "below_reserved",
                "message": f"No puedes dejar menos de {apartadas} piezas: están apartadas por pedidos.",
                "apartadas": apartadas,
            },
        )
    anterior = inv.cantidad_disponible + apartadas
    inv.cantidad_disponible += payload.delta
    db.commit()
    record_audit_event(
        "stock_adjustment", str(user.id), f"inventory:{sucursal.id}:{sku}",
        {"anterior": anterior, "delta": payload.delta, "motivo": payload.motivo.strip()},
    )
    return _inventory_row(variante, inv, apartadas - inv.cantidad_reservada)


def _pickups(db: Session, sucursal: Sucursal) -> list[Pedido]:
    return (
        db.query(Pedido)
        .join(Envio, Envio.pedido_id == Pedido.id)
        .filter(Envio.tipo == "recoleccion_tienda", Envio.sucursal_recoleccion_id == sucursal.id)
        .order_by(Pedido.fecha)
        .all()
    )


def _shelf(pedido: Pedido) -> str:
    """Estante fijo por pedido para que staff y cliente hablen del mismo lugar."""
    return f"R-0{int(pedido.id.hex[:4], 16) % 9 + 1}"


def _when(pedido: Pedido, estado: str) -> datetime | None:
    fecha = next((h.fecha for h in reversed(pedido.historial) if h.estado == estado), None)
    return _as_utc(fecha) if fecha else None


def _short_name(nombre: str) -> str:
    partes = nombre.split()
    return f"{partes[0]} {partes[1][0]}." if len(partes) > 1 else nombre


def _pickup_row(db: Session, pedido: Pedido) -> dict[str, Any]:
    usuario = db.get(Usuario, pedido.cliente_id)
    pagado = _when(pedido, "confirmado") or _as_utc(pedido.fecha)
    if pedido.estado in ("listo_para_recoger", "entregado"):
        ubicacion = f"Estante {_shelf(pedido)}"
    else:
        pasillos = sorted({
            (inv.pasillo or "").split("-")[0]
            for item in pedido.items
            for inv in item.variante.inventarios
            if inv.sucursal_id == pedido.envios[0].sucursal_recoleccion_id and inv.pasillo
        })
        ubicacion = f"{'Pasillos' if len(pasillos) > 1 else 'Pasillo'} {' y '.join(pasillos)}" if pasillos else ""
    return {
        "id": pedido.id,
        "folio": pedido.folio,
        "cliente": _short_name(usuario.nombre) if usuario else "",
        "estado": pedido.estado,
        "piezas": sum(i.cantidad for i in pedido.items),
        "ubicacion": ubicacion,
        "pagado_en": pagado,
        "listo_en": _when(pedido, "listo_para_recoger"),
        "entregado_en": _when(pedido, "entregado"),
        "atrasado": pedido.estado in ("confirmado", "en_preparacion") and datetime.now(timezone.utc) - pagado > ATRASO,
        "transiciones": [e for e in permitidas(pedido) if e in PASOS_SUCURSAL],
    }


@router.get("/recolecciones")
def pickup_board(sucursal: Sucursal = Depends(branch_of), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Pedidos para recoger por columna: por preparar, listos y entregados hoy."""
    inicio_dia = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    pedidos = _pickups(db, sucursal)
    entregados = [p for p in pedidos if p.estado == "entregado" and (_when(p, "entregado") or inicio_dia) >= inicio_dia]
    return {
        "sucursal": _store(sucursal),
        "por_preparar": [_pickup_row(db, p) for p in pedidos if p.estado in ("confirmado", "en_preparacion")],
        "listos": [_pickup_row(db, p) for p in pedidos if p.estado == "listo_para_recoger"],
        "entregados_hoy": [_pickup_row(db, p) for p in entregados],
    }


def _branch_order(db: Session, sucursal: Sucursal, order_id: uuid.UUID) -> Pedido:
    pedido = db.get(Pedido, order_id)
    envio = pedido.envios[0] if pedido and pedido.envios else None
    if pedido is None or envio is None or envio.sucursal_recoleccion_id != sucursal.id or envio.tipo != "recoleccion_tienda":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No encontramos ese pedido en esta sucursal.")
    return pedido


@router.post("/recolecciones/{order_id}/estado")
def advance_pickup(
    order_id: uuid.UUID,
    payload: StepInput,
    sucursal: Sucursal = Depends(branch_of),
    user: Usuario = Depends(require_roles("staff", "admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Empezar a preparar o marcar listo (avisa al cliente); los pedidos solo avanzan."""
    pedido = _branch_order(db, sucursal, order_id)
    try:
        cambiar_estado(db, pedido, payload.estado, actor=user.nombre)
    except TransicionInvalida as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "invalid_transition", "message": "Otra persona ya cambió este pedido. Actualizamos la lista."},
        ) from exc
    return _pickup_row(db, pedido)


def _handover(db: Session, pedido: Pedido) -> dict[str, Any]:
    usuario = db.get(Usuario, pedido.cliente_id)
    pago = pedido.pagos[-1] if pedido.pagos else None
    return {
        "id": pedido.id,
        "folio": pedido.folio,
        "cliente": usuario.nombre if usuario else "",
        "email": usuario.email if usuario else "",
        "estante": _shelf(pedido),
        "pago": pago.metodo if pago else None,
        "productos": [
            {"nombre": i.variante.producto.nombre, "etiqueta": _label(i.variante.atributos), "cantidad": i.cantidad}
            for i in pedido.items
        ],
        "estado": pedido.estado,
    }


def _check_code(codigo: str) -> None:
    if not (len(codigo) == 4 and codigo.isdigit()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[{"loc": ["body", "codigo"], "msg": "El código tiene 4 dígitos.", "type": "value_error"}],
        )


@router.post("/recolecciones/verificar")
def verify_pickup(payload: VerifyInput, sucursal: Sucursal = Depends(branch_of), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Busca el pedido listo con ese código en la sucursal."""
    _check_code(payload.codigo)
    for pedido in _pickups(db, sucursal):
        if pedido.estado == "listo_para_recoger" and pedido.codigo_recoleccion == payload.codigo:
            if payload.pedido_id is None or pedido.id == payload.pedido_id:
                return _handover(db, pedido)
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": "No hay pedidos listos con ese código en esta sucursal. Revisa los 4 dígitos."},
    )


@router.post("/recolecciones/{order_id}/entregar")
def hand_over(
    order_id: uuid.UUID,
    payload: HandoverInput,
    sucursal: Sucursal = Depends(branch_of),
    user: Usuario = Depends(require_roles("staff", "admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Entrega en mostrador: código correcto, identificación y productos revisados."""
    pedido = _branch_order(db, sucursal, order_id)
    if pedido.codigo_recoleccion != payload.codigo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "El código no corresponde a este pedido."},
        )
    if not (payload.identificacion_revisada and payload.productos_revisados):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[{"loc": ["body", "checks"], "msg": "Confirma la identificación y los productos antes de entregar.",
                     "type": "value_error"}],
        )
    try:
        cambiar_estado(db, pedido, "entregado", actor=user.nombre, nota="Entregado en mostrador con identificación")
    except TransicionInvalida as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "invalid_transition", "message": "Este pedido ya no está listo para entregar."},
        ) from exc
    return _handover(db, pedido)
