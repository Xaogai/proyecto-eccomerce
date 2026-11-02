"""Punto de entrada FastAPI para el microservicio de Checkout (`checkout`)."""

from fastapi import FastAPI
from backend.services.checkout.app.router import router as checkout_router

app = FastAPI(
    title="Ferremarket - Servicio de Checkout y Pedidos",
    version="1.0.0",
    description="Microservicio de creación de órdenes, reserva previa y confirmación vía webhooks.",
)

app.include_router(checkout_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    """Verifica el estado operativo del microservicio de checkout."""
    return {"status": "ok", "service": "checkout"}
