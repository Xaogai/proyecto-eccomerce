"""Punto de entrada FastAPI para el microservicio de Carrito (`cart`)."""

from fastapi import FastAPI
from backend.services.cart.app.router import router as cart_router

app = FastAPI(
    title="Ferremarket - Servicio de Carrito de Compras",
    version="1.0.0",
    description="Microservicio de carrito persistente para clientes registrados e invitados (2FN).",
)

app.include_router(cart_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    """Verifica el estado operativo del microservicio de carrito."""
    return {"status": "ok", "service": "cart"}
