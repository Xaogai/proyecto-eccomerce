"""Punto de entrada FastAPI para el microservicio de Catálogo (`catalog`)."""

from fastapi import FastAPI
from backend.services.catalog.app.router import router as catalog_router

app = FastAPI(
    title="Ferremarket - Servicio de Catálogo",
    version="1.0.0",
    description="Microservicio para gestión de categorías jerárquicas, productos, variantes y búsqueda.",
)

app.include_router(catalog_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    """Verifica el estado operativo del microservicio de catálogo."""
    return {"status": "ok", "service": "catalog"}
