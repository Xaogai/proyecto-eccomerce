"""Punto de entrada principal del backend (re-exporta `app` desde `backend.gateway.main`)."""

from backend.gateway.main import app

__all__ = ["app"]
