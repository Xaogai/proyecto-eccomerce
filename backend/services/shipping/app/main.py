"""Punto de entrada FastAPI para el microservicio de Envíos (`shipping`)."""

from fastapi import FastAPI
from backend.services.shipping.app.router import router as shipping_router

app = FastAPI(
    title="Ferremarket - Servicio de Envíos y Logística",
    version="1.0.0",
    description="Microservicio de cálculo de envíos por código postal, recolección en tienda y rastreo.",
)

app.include_router(shipping_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    """Verifica el estado operativo del microservicio de envíos."""
    return {"status": "ok", "service": "shipping"}
