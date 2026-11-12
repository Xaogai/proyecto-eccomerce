"""Levanta la aplicación completa en un solo puerto, sin Docker: la API y, si existe, el build de React.

    python run_app.py                # http://127.0.0.1:8000
    HOST=0.0.0.0 PORT=8080 python run_app.py

Antes, para la tienda: `npm run build` en `frontend/`. Sin ese build se sirve solo la API (y su interfaz en /).
Las migraciones, los datos sintéticos y los roles de la base se aplican al arrancar (lifespan del gateway).
"""

import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
FRONTEND_DIST = ROOT / "frontend" / "dist"
API_PREFIXES = ("/api/", "/docs", "/redoc", "/openapi.json", "/health")


def _ensure_venv() -> None:
    """
    Usa el Python de `.venv` si existe (Windows, macOS o Linux) aunque se haya lanzado con otro.

    Sin `.venv`, revisa que estén instaladas todas las dependencias de `backend/requirements.txt`.
    """
    venv = ROOT / ".venv"
    if venv.is_dir() and Path(sys.prefix).resolve() != venv.resolve():
        for candidate in (venv / "Scripts" / "python.exe", venv / "bin" / "python"):
            if candidate.exists():
                raise SystemExit(subprocess.run([str(candidate), *sys.argv], check=False).returncode)
    from importlib.metadata import PackageNotFoundError, version

    missing = []
    for line in (ROOT / "backend" / "requirements.txt").read_text(encoding="utf-8").splitlines():
        name = line.split("==")[0].strip()
        if name:
            try:
                version(name)
            except PackageNotFoundError:
                missing.append(name)
    if missing:
        raise SystemExit(f"Faltan dependencias ({', '.join(missing)}): pip install -r backend/requirements.txt")


_ensure_venv()

import uvicorn  # noqa: E402
from starlette.exceptions import HTTPException  # noqa: E402
from starlette.staticfiles import StaticFiles  # noqa: E402
from starlette.types import Receive, Scope, Send  # noqa: E402

from backend.gateway.main import app  # noqa: E402


class SinglePageApp(StaticFiles):
    """Archivos del build de React; cualquier ruta que no sea un archivo regresa `index.html` (React Router)."""

    async def get_response(self, path: str, scope: Scope):  # type: ignore[no-untyped-def]
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            return await super().get_response("index.html", scope)


spa = SinglePageApp(directory=FRONTEND_DIST, html=True, check_dir=False)


async def application(scope: Scope, receive: Receive, send: Send) -> None:
    """La API atiende sus rutas y el arranque; lo demás lo sirve el build de React si está compilado."""
    path = scope.get("path", "")
    if scope["type"] != "http" or path.startswith(API_PREFIXES) or not (FRONTEND_DIST / "index.html").is_file():
        await app(scope, receive, send)
    else:
        await spa(scope, receive, send)


def main() -> None:
    """Arranca uvicorn en HOST:PORT (127.0.0.1:8000 por defecto)."""
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    built = (FRONTEND_DIST / "index.html").is_file()
    print(f"Ferremarket en http://{host}:{port}/  (documentación de la API en /docs)", flush=True)
    if not built:
        print("Sin build del frontend: corre `npm run build` en frontend/ para servir la tienda aquí.", flush=True)
    uvicorn.run(application, host=host, port=port)


if __name__ == "__main__":
    main()
