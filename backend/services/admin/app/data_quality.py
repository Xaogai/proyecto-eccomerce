"""Verificación de calidad de datos y de seguridad del esquema (Sec. 19, RQ-DAT-001, RQ-SEG-002, AE-14, AE-39)."""

from decimal import Decimal
from typing import Any

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from backend.shared.db_controls import controls_summary
from backend.shared.models import BitacoraAuditoria, ItemCarrito, Pago, Pedido

SENSITIVE_OPS = ("payment", "price_change", "stock_change", "role_change")
AUDIT_SAMPLE_SIZE = 25
ORDER_SAMPLE_SIZE = 30
CARD_COLUMNS = ("card_number", "cvv", "pan", "numero_tarjeta")
CENT = Decimal("0.01")


def _order_discrepancies(orders: list[Pedido]) -> list[dict[str, str]]:
    """Pedidos cuyo total no es la suma de sus productos o con un subtotal distinto a cantidad × precio."""
    found = []
    for order in orders:
        items_sum = sum((Decimal(str(i.subtotal)) for i in order.items), Decimal("0.00")).quantize(CENT)
        total = Decimal(str(order.total)).quantize(CENT)
        lines_ok = all(
            Decimal(str(i.subtotal)).quantize(CENT) == (Decimal(str(i.precio_unitario_venta)) * i.cantidad).quantize(CENT)
            for i in order.items
        )
        if items_sum != total or not lines_ok:
            found.append({"folio": order.folio, "recorded_total": str(total), "calculated_sum": str(items_sum)})
    return found


def _audit_counts(db: Session) -> dict[str, dict[str, int]]:
    """Registros de bitácora por operación sensible, separando los reales de los del generador sintético."""
    counts = {op: {"reales": 0, "sinteticos": 0} for op in SENSITIVE_OPS}
    rows = db.query(BitacoraAuditoria.tipo_evento, BitacoraAuditoria.detalles).filter(
        BitacoraAuditoria.tipo_evento.in_(SENSITIVE_OPS)
    )
    for tipo, detalles in rows:
        kind = "sinteticos" if (detalles or {}).get("synthetic_seed") else "reales"
        counts[tipo][kind] += 1
    return counts


def data_quality_report(db: Session) -> dict[str, Any]:
    """
    Concilia el 100% de los pedidos, revisa 2FN y PCI-DSS en el esquema y cuenta la bitácora para el muestreo.

    Las muestras del generador sintético (sec. 20) se informan aparte: el muestreo AE-39 solo
    se da por cumplido con registros reales.
    """
    orders = db.query(Pedido).all()
    discrepancies = _order_discrepancies(orders)
    item_carrito_cols = [c.name for c in ItemCarrito.__table__.columns]
    pagos_cols = [c.name for c in Pago.__table__.columns]
    deployed_tables = sorted(inspect(db.get_bind()).get_table_names())
    audit = _audit_counts(db)
    return {
        "rq_dat_001_orders_checked": len(orders),
        "rq_dat_001_discrepancies_count": len(discrepancies),
        "rq_dat_001_discrepancies": discrepancies,
        "rq_dat_001_compliant": not discrepancies,
        "rq_dat_001_muestra_minima_30_pedidos": len(orders) >= ORDER_SAMPLE_SIZE,
        "anexo_2_2fn_item_carrito_columns": item_carrito_cols,
        "anexo_2_2fn_compliant": "precio_unitario" not in item_carrito_cols,
        "rq_seg_002_pagos_columns": pagos_cols,
        "rq_seg_002_pci_dss_compliant": not any(col in pagos_cols for col in CARD_COLUMNS),
        "ae_39_audit_log_counts_by_sensitive_op": audit,
        "ae_39_sampling_25_per_op_compliant": all(c["reales"] >= AUDIT_SAMPLE_SIZE for c in audit.values()),
        "ae_39_muestra_con_datos_sinteticos": all(
            c["reales"] + c["sinteticos"] >= AUDIT_SAMPLE_SIZE for c in audit.values()
        ),
        "deployed_tables_count": len(deployed_tables),
        "deployed_tables": deployed_tables,
        "db_audit_controls": controls_summary(db.connection()),
    }
