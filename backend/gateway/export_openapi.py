"""Escribe `openapi.json` en la raíz con el contrato actual de la API (sec. 14.4).

    python -m backend.gateway.export_openapi

La prueba `test_openapi_al_dia` falla si el archivo no coincide con los endpoints.
"""

import json
from pathlib import Path
from typing import Any

OPENAPI_PATH = Path(__file__).resolve().parents[2] / "openapi.json"


def render(spec: dict[str, Any]) -> str:
    """Formato estable del archivo: 2 espacios, acentos sin escapar y salto de línea final."""
    return json.dumps(spec, ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    """Genera el contrato desde la app y lo guarda."""
    from backend.gateway.main import app

    OPENAPI_PATH.write_text(render(app.openapi()), encoding="utf-8", newline="\n")
    print(f"{OPENAPI_PATH.name}: {len(app.openapi()['paths'])} rutas")


if __name__ == "__main__":
    main()
