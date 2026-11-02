"""Punto de entrada FastAPI para el microservicio de Pagos (`payments`)."""

from fastapi import FastAPI
from backend.services.payments.app.router import router as payments_router

app = FastAPI(
    title="Ferremarket - Servicio de Pagos",
    version="1.0.0",
    description="Microservicio de procesamiento de pagos tokenizados (PCI-DSS SAQ-A).",
)

app.include_router(payments_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    """Verifica el estado operativo del microservicio de pagos."""
    return {"status": "ok", "service": "payments"}
