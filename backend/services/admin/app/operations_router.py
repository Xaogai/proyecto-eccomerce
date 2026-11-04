"""Operación del admin: resumen del día, pedidos con cambios de estado y reportes (EP-34, EP-41 a EP-43, EP-46)."""

import csv
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import io
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.services.checkout.app.order_repository import OrderRepository
from backend.shared.database import get_db
from backend.shared.estados_pedido import TransicionInvalida, cambiar_estado, permitidas
from backend.shared.models import Categoria, EventoWebhook, Inventario, Pedido, Producto, Sucursal, Usuario, Variante
from backend.shared.security import require_roles

router = APIRouter(prefix="/api/v1/admin", tags=["Administración y Auditoría"])

GRUPOS: dict[str, tuple[str, ...]] = {
    "pago": ("pendiente_pago", "pago_rechazado"),
    "prep": ("confirmado", "en_preparacion"),
    "listos": ("listo_para_recoger", "enviado"),
    "inc": ("incidencia",),
    "fin": ("entregado", "cancelado", "reembolsado"),
}
PAGADOS = ("confirmado", "en_preparacion", "listo_para_recoger", "enviado", "entregado")
PERIODOS = {"hoy": 1, "7d": 7, "30d": 30, "90d": 90}
STOCK_BAJO = 5


class StatusChange(BaseModel):
    """Estado nuevo y nota opcional para el registro."""

    estado: str
    nota: str | None = Field(default=None, max_length=300)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _total(pedido: Pedido) -> Decimal:
    """Total cobrado: productos más envío."""
    envio = pedido.envios[0].costo if pedido.envios else Decimal("0.00")
    return Decimal(str(pedido.total)) + Decimal(str(envio))


def _order_row(db: Session, p: Pedido) -> dict[str, Any]:
    usuario = db.get(Usuario, p.cliente_id)
    envio = p.envios[0] if p.envios else None
    pickup = envio is not None and envio.tipo == "recoleccion_tienda"
    sucursal = envio.sucursal_recoleccion.nombre if envio and envio.sucursal_recoleccion else "sucursal"
    return {
        "id": p.id,
        "folio": p.folio,
        "cliente": usuario.nombre if usuario else "",
        "email": usuario.email if usuario else "",
        "entrega": f"Recoger en {sucursal}" if pickup else "Envío a domicilio",
        "fecha": p.fecha,
        "total": _total(p),
        "estado": p.estado,
    }


def _admin_order(db: Session, pedido: Pedido) -> dict[str, Any]:
    """Pedido con transiciones permitidas, avisos de la pasarela y registro de cambios."""
    data = OrderRepository(db)._serialize_order(pedido).model_dump(mode="json")
    eventos = [
        e
        for e in db.query(EventoWebhook).order_by(EventoWebhook.procesado_en).all()
        if e.resultado.get("pedido_id") == str(pedido.id)
    ]
    anteriores: list[str | None] = [None, *[h.estado for h in pedido.historial]]
    data["transiciones_permitidas"] = permitidas(pedido)
    data["avisos_pasarela"] = [
        {
            "fecha": _as_utc(e.procesado_en).isoformat(),
            "evento": f"Pago {e.resultado.get('payment_status', '')}",
            "resultado": "Procesado",
        }
        for e in eventos
    ]
    data["registro"] = [
        {"fecha": _as_utc(h.fecha).isoformat(), "de": anteriores[i], "a": h.estado, "actor": h.actor, "nota": h.nota}
        for i, h in reversed(list(enumerate(pedido.historial)))
    ]
    return data


def _order(db: Session, order_id: uuid.UUID) -> Pedido:
    pedido = db.get(Pedido, order_id)
    if pedido is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pedido no encontrado")
    return pedido


@router.get("/dashboard")
def dashboard(_admin: Usuario = Depends(require_roles("admin")), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Indicadores del día, alertas por prioridad y ventas de los últimos 7 días."""
    ahora = datetime.now(timezone.utc)
    inicio_dia = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    pedidos = db.query(Pedido).all()
    hoy = [p for p in pedidos if _as_utc(p.fecha) >= inicio_dia]
    por_preparar = [p for p in pedidos if p.estado in GRUPOS["prep"]]
    atrasados = [p for p in por_preparar if ahora - _as_utc(p.fecha) > timedelta(hours=1)]
    rechazados = [p for p in pedidos if p.estado == "pago_rechazado"]
    agotadas = db.query(Inventario).filter(Inventario.cantidad_disponible == 0).count()
    bajo = (
        db.query(Inventario)
        .filter(Inventario.cantidad_disponible > 0, Inventario.cantidad_disponible <= STOCK_BAJO)
        .order_by(Inventario.cantidad_disponible)
        .first()
    )
    borradores = db.query(Producto).filter(Producto.estado == "borrador").count()

    alertas: list[dict[str, Any]] = [
        {"severidad": "alta", "titulo": f"Pedido {p.folio} en incidencia", "detalle": "Revisa la entrega con el cliente",
         "enlace": f"/admin/pedidos/{p.id}"}
        for p in pedidos
        if p.estado == "incidencia"
    ][:3]
    if bajo is not None:
        alertas.append({
            "severidad": "media",
            "titulo": f"Stock bajo: {bajo.variante.producto.nombre}",
            "detalle": f"Quedan {bajo.cantidad_disponible} en {bajo.sucursal.nombre}",
            "enlace": "/sucursal/inventario",
        })
    if borradores:
        alertas.append({"severidad": "baja", "titulo": f"{borradores} productos en borrador",
                        "detalle": "Revísalos y publícalos", "enlace": "/admin/productos?estado=borrador"})

    ventas_por_dia = []
    for i in range(6, -1, -1):
        dia = inicio_dia - timedelta(days=i)
        total = sum(
            (_total(p) for p in pedidos if p.estado in PAGADOS and dia <= _as_utc(p.fecha) < dia + timedelta(days=1)),
            Decimal("0.00"),
        )
        ventas_por_dia.append({"fecha": dia.isoformat(), "total": total})

    return {
        "indicadores": {
            "ventas_hoy": sum((_total(p) for p in hoy if p.estado in PAGADOS), Decimal("0.00")),
            "pedidos_hoy": len(hoy),
            "por_preparar": len(por_preparar),
            "por_preparar_atrasados": len(atrasados),
            "pagos_rechazados": len(rechazados),
            "variantes_agotadas": agotadas,
        },
        "alertas": alertas,
        "ventas_por_dia": ventas_por_dia,
    }


@router.get("/orders")
def list_admin_orders(
    q: str | None = Query(default=None, description="Folio, nombre o correo del cliente"),
    sucursal_id: uuid.UUID | None = Query(default=None, description="Pedidos para recoger en esa sucursal"),
    dias: int | None = Query(default=None, ge=1, le=365),
    grupo: str | None = Query(default=None, pattern="^(pago|prep|listos|inc|fin)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Pedidos más recientes primero con filtros y conteo por grupo de estado."""
    texto = (q or "").strip().lower()
    desde = datetime.now(timezone.utc) - timedelta(days=dias) if dias else None
    base = []
    for p in db.query(Pedido).order_by(Pedido.fecha.desc()).all():
        row = _order_row(db, p)
        envio = p.envios[0] if p.envios else None
        if texto and texto not in f"{row['folio']} {row['cliente']} {row['email']}".lower():
            continue
        if sucursal_id and not (envio and envio.tipo == "recoleccion_tienda" and envio.sucursal_recoleccion_id == sucursal_id):
            continue
        if desde and _as_utc(p.fecha) < desde:
            continue
        base.append(row)
    conteos = {"todos": len(base), **{g: sum(r["estado"] in estados for r in base) for g, estados in GRUPOS.items()}}
    filtered = [r for r in base if not grupo or r["estado"] in GRUPOS[grupo]]
    start = (page - 1) * page_size
    return {"page": page, "page_size": page_size, "total": len(filtered), "items": filtered[start : start + page_size],
            "conteos": conteos}


@router.get("/orders/{order_id}")
def get_admin_order(
    order_id: uuid.UUID, _admin: Usuario = Depends(require_roles("admin")), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Detalle del pedido para el admin."""
    return _admin_order(db, _order(db, order_id))


@router.post("/orders/{order_id}/estado")
def change_admin_order_status(
    order_id: uuid.UUID,
    payload: StatusChange,
    admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Cambia el estado solo a los permitidos (I3); el cambio queda en el registro con el nombre del admin."""
    pedido = _order(db, order_id)
    try:
        cambiar_estado(db, pedido, payload.estado, actor=admin.nombre, nota=(payload.nota or "").strip() or None)
    except TransicionInvalida as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail={"code": "invalid_transition", "message": str(exc)}
        ) from exc
    return _admin_order(db, pedido)


def _report(db: Session, periodo: str) -> dict[str, Any]:
    dias = PERIODOS[periodo]
    hasta = datetime.now(timezone.utc)
    desde = hasta.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=dias - 1)
    en_periodo = [p for p in db.query(Pedido).all() if _as_utc(p.fecha) >= desde]
    pagados = [p for p in en_periodo if p.estado in PAGADOS]
    ventas = sum((_total(p) for p in pagados), Decimal("0.00"))

    por_departamento: dict[str, Decimal] = {}
    for p in pagados:
        for item in p.items:
            categoria: Categoria | None = item.variante.producto.categoria if item.variante else None
            while categoria is not None and categoria.padre is not None:
                categoria = categoria.padre
            nombre = categoria.nombre if categoria else "Sin departamento"
            por_departamento[nombre] = por_departamento.get(nombre, Decimal("0.00")) + Decimal(str(item.subtotal))

    total_variantes = db.query(Variante).count()
    sucursales = []
    for s in db.query(Sucursal).order_by(Sucursal.nombre).all():
        filas = db.query(Inventario).filter(Inventario.sucursal_id == s.id).all()
        con_stock = sum(1 for f in filas if f.cantidad_disponible > 0)
        recoger = sum(
            1 for p in en_periodo
            if p.envios and p.envios[0].tipo == "recoleccion_tienda" and p.envios[0].sucursal_recoleccion_id == s.id
        )
        sucursales.append({
            "sucursal": s.nombre,
            "piezas": sum(f.cantidad_disponible for f in filas),
            "apartadas": sum(f.cantidad_reservada for f in filas),
            "agotados": total_variantes - con_stock,
            "pedidos_recoger": recoger,
        })
    return {
        "periodo": periodo,
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "ventas": ventas,
        "pedidos": len(pagados),
        "ticket_promedio": (ventas / len(pagados)).quantize(Decimal("0.01")) if pagados else Decimal("0.00"),
        "pagos_rechazados": sum(p.estado == "pago_rechazado" for p in en_periodo),
        "por_departamento": [
            {"nombre": n, "total": t} for n, t in sorted(por_departamento.items(), key=lambda kv: kv[1], reverse=True)
        ],
        "sucursales": sucursales,
    }


@router.get("/reports")
def report(
    periodo: str = Query(default="7d", pattern="^(hoy|7d|30d|90d)$"),
    _admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Ventas, pedidos, ticket promedio, ventas por departamento e inventario por sucursal del periodo."""
    return _report(db, periodo)


@router.get("/reports/export.csv")
def report_csv(
    periodo: str = Query(default="7d", pattern="^(hoy|7d|30d|90d)$"),
    _admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> Response:
    """Pedidos del periodo en CSV (UTF-8 con BOM para que Excel respete los acentos)."""
    desde = datetime.now(timezone.utc) - timedelta(days=PERIODOS[periodo])
    salida = io.StringIO()
    writer = csv.writer(salida)
    writer.writerow(["Folio", "Fecha", "Cliente", "Correo", "Entrega", "Estado", "Total"])
    for p in db.query(Pedido).order_by(Pedido.fecha.desc()).all():
        if _as_utc(p.fecha) < desde:
            continue
        row = _order_row(db, p)
        writer.writerow([row["folio"], _as_utc(p.fecha).isoformat(), row["cliente"], row["email"], row["entrega"],
                         row["estado"], f"{row['total']:.2f}"])
    return Response(
        content="﻿" + salida.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="reporte-{periodo}.csv"'},
    )
