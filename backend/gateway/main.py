"""API Gateway unificado para el sistema de E-commerce Ferremarket (Sec. 13, Sec. 13.1)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from decimal import Decimal
from pathlib import Path
from typing import Any
from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from backend.services.cart.app.router import router as cart_router
from backend.services.catalog.app.router import router as catalog_router
from backend.services.checkout.app.router import router as checkout_router
from backend.services.inventory.app.router import router as inventory_router
from backend.services.payments.app.router import router as payments_router
from backend.services.shipping.app.router import router as shipping_router
from backend.services.users.app.router import router as users_router
from backend.shared.configuracion import get_section
from backend.shared.database import SessionLocal, engine, get_db
from backend.shared.migrations import upgrade_database
from backend.shared.models import ItemCarrito, Pago, Pedido, Usuario
from backend.shared.security import get_audit_logs, require_roles
from backend.shared.seed import seed_synthetic_data

UI_HTML_PATH = Path(__file__).resolve().parent / "ui.html"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Ejecuta las migraciones de Alembic y puebla los datos sintéticos al arrancar el servidor."""
    upgrade_database(engine)
    with SessionLocal() as db:
        seed_synthetic_data(db)
    yield


app = FastAPI(
    title="Ferremarket E-commerce API Gateway",
    version="1.0.0",
    lifespan=lifespan,
    description=(
        "API Gateway unificado (OpenAPI 3.1) que integra los microservicios de "
        "Catálogo, Usuarios/Auth, Inventario, Carrito, Checkout, Pagos y Envíos."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(catalog_router)
app.include_router(inventory_router)
app.include_router(cart_router)
app.include_router(checkout_router)
app.include_router(payments_router)
app.include_router(shipping_router)


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def serve_web_ui() -> HTMLResponse:
    """Sirve la interfaz web interactiva de Ferremarket directamente desde el Gateway."""
    return HTMLResponse(content=UI_HTML_PATH.read_text(encoding="utf-8"))


@app.get("/health", tags=["Monitoreo y Salud"])
def gateway_health() -> dict[str, Any]:
    """Endpoint de monitoreo de disponibilidad (Sec. 35, Compromiso 1 Uptime)."""
    return {
        "status": "ok",
        "gateway": "operational",
        "version": "1.0.0",
        "services": [
            "users",
            "catalog",
            "inventory",
            "cart",
            "checkout",
            "payments",
            "shipping",
        ],
    }


@app.get("/api/v1/funciones", tags=["Monitoreo y Salud"])
def feature_flags(db: Session = Depends(get_db)) -> dict[str, bool]:
    """Funciones activas de la tienda (vista 360, calculadora, comparador, reseñas y fila de espera)."""
    return {k: bool(v) for k, v in get_section(db, "funciones").items()}


@app.get("/api/v1/admin/audit-logs", tags=["Administración y Auditoría"])
def read_audit_logs(
    event_type: str | None = Query(default=None, description="Filtrar por tipo de evento sensible"),
    _admin: Usuario = Depends(require_roles("admin")),
) -> list[dict[str, Any]]:
    """
    Consulta la bitácora de operaciones sensibles: pagos, cambios de precio, stock, rol y accesos (Sec. 29.6, AE-39).
    """
    return get_audit_logs(event_type=event_type)


@app.get("/api/v1/admin/data-quality-report", tags=["Administración y Auditoría"])
def verify_data_quality(
    _admin: Usuario = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Ejecuta la verificación automatizada de Calidad de Datos y Seguridad de Esquema (Sec. 19, RQ-DAT-001, RQ-SEG-002, AE-14, AE-25):
    - Conciliación del 100% de pedidos: `total == sum(item.subtotal)` y `subtotal == cantidad * precio_unitario_venta`.
    - Verificación de 2FN en `item_carrito` (ausencia de columna `precio_unitario`).
    - Verificación PCI-DSS en `pagos` (ausencia de columnas de tarjeta/CVV).
    """
    orders = db.query(Pedido).all()
    discrepancies: list[dict[str, Any]] = []
    for order in orders:
        calculated_sum = sum(
            (Decimal(str(i.subtotal)) for i in order.items),
            Decimal("0.00"),
        ).quantize(Decimal("0.01"))
        order_total = Decimal(str(order.total)).quantize(Decimal("0.01"))
        item_math_ok = all(
            Decimal(str(i.subtotal)).quantize(Decimal("0.01"))
            == (Decimal(str(i.precio_unitario_venta)) * Decimal(i.cantidad)).quantize(Decimal("0.01"))
            for i in order.items
        )
        if calculated_sum != order_total or not item_math_ok:
            discrepancies.append(
                {
                    "folio": order.folio,
                    "recorded_total": str(order_total),
                    "calculated_sum": str(calculated_sum),
                }
            )

    item_carrito_cols = [c.name for c in ItemCarrito.__table__.columns]
    pagos_cols = [c.name for c in Pago.__table__.columns]
    inspector = inspect(db.get_bind())
    deployed_tables = sorted(inspector.get_table_names())

    return {
        "rq_dat_001_orders_checked": len(orders),
        "rq_dat_001_discrepancies_count": len(discrepancies),
        "rq_dat_001_compliant": len(discrepancies) == 0,
        "anexo_2_2fn_item_carrito_columns": item_carrito_cols,
        "anexo_2_2fn_compliant": "precio_unitario" not in item_carrito_cols,
        "rq_seg_002_pagos_columns": pagos_cols,
        "rq_seg_002_pci_dss_compliant": not any(
            col in pagos_cols for col in ("card_number", "cvv", "pan", "numero_tarjeta")
        ),
        "deployed_tables_count": len(deployed_tables),
        "deployed_tables": deployed_tables,
    }


@app.post("/api/v1/admin/seed-synthetic", tags=["Administración y Auditoría"])
def trigger_synthetic_seed(
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Ejecuta migraciones de Alembic y genera datos sintéticos de prueba (Sec. 20, AE-26)."""
    upgrade_database(engine)
    return seed_synthetic_data(db)
