"""Punto de entrada FastAPI para el microservicio de Usuarios (`users`)."""

from fastapi import FastAPI
from backend.services.users.app.router import router as users_router

app = FastAPI(
    title="Ferremarket - Servicio de Usuarios y Autenticación",
    version="1.0.0",
    description="Microservicio de registro, autenticación JWT, perfiles, direcciones y derechos ARCO.",
)

app.include_router(users_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    """Verifica el estado operativo del microservicio de usuarios."""
    return {"status": "ok", "service": "users"}
