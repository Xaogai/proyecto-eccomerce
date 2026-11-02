"""Punto de entrada FastAPI para el microservicio de Inventario (`inventory`)."""

from fastapi import FastAPI
from backend.services.inventory.app.router import router as inventory_router

app = FastAPI(
    title="Ferremarket - Servicio de Inventario",
    version="1.0.0",
    description="Microservicio de control de existencias por sucursal y reservas temporales.",
)

app.include_router(inventory_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    """Verifica el estado operativo del microservicio de inventario."""
    return {"status": "ok", "service": "inventory"}
