"""API Gateway unificado para el sistema de E-commerce Ferremarket (Sec. 13, Sec. 13.1)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import logging
from pathlib import Path
from typing import Any
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from backend.services.admin.app.audit_router import router as admin_audit_router
from backend.services.admin.app.catalog_router import media_router
from backend.services.admin.app.catalog_router import router as admin_catalog_router
from backend.services.admin.app.operations_router import router as admin_operations_router
from backend.services.admin.app.users_router import router as admin_users_router
from backend.services.cart.app.router import router as cart_router
from backend.services.catalog.app.router import router as catalog_router
from backend.services.checkout.app.returns import router as returns_router
from backend.services.checkout.app.router import router as checkout_router
from backend.services.inventory.app.branch_router import router as branch_router
from backend.services.inventory.app.router import router as inventory_router
from backend.services.payments.app.router import router as payments_router
from backend.services.payments.app.sandbox import router as payments_sandbox_router
from backend.services.shipping.app.router import router as shipping_router
from backend.services.users.app.account_router import router as account_router
from backend.services.users.app.router import router as users_router
from backend.shared.config import settings
from backend.shared.configuracion import get_section
from backend.shared.database import SessionLocal, engine, get_db
from backend.shared.db_controls import apply_database_controls
from backend.shared.migrations import upgrade_database
from backend.shared.seed import seed_synthetic_data

logger = logging.getLogger(__name__)

UI_HTML_PATH = Path(__file__).resolve().parent / "ui.html"


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Aplica las migraciones, carga los datos sintéticos (si `SEED_SYNTHETIC_DATA`) y configura los roles de la BD."""
    upgrade_database(engine)
    if settings.seed_synthetic_data:
        with SessionLocal() as db:
            seed_synthetic_data(db)
    logger.info("Controles de base de datos: %s", apply_database_controls(engine))
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
    allow_origins=settings.allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(admin_catalog_router)
app.include_router(admin_operations_router)
app.include_router(admin_users_router)
app.include_router(admin_audit_router)
app.include_router(media_router)
app.include_router(account_router)
app.include_router(catalog_router)
app.include_router(inventory_router)
app.include_router(branch_router)
app.include_router(cart_router)
app.include_router(checkout_router)
app.include_router(returns_router)
app.include_router(payments_router)
app.include_router(payments_sandbox_router)
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
