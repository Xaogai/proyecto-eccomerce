"""Servidor HTTP multihilo para la aplicación completa Ferremarket E-commerce (Gateway + 7 Microservicios + UI Web)."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import sys
from typing import Any
from urllib.parse import parse_qsl, urlsplit


def _ensure_venv() -> None:
    """Redirige automáticamente al intérprete de `.venv` si se ejecuta con el Python global sin dependencias."""
    try:
        import fastapi  # noqa: F401
        import sqlalchemy  # noqa: F401
    except ModuleNotFoundError:
        venv_python = Path(__file__).resolve().parent / ".venv" / "Scripts" / "python.exe"
        if venv_python.exists() and Path(sys.executable).resolve() != venv_python.resolve():
            result = subprocess.run([str(venv_python), *sys.argv], check=False)
            raise SystemExit(result.returncode)
        raise


_ensure_venv()

from fastapi.openapi.docs import get_swagger_ui_html  # noqa: E402

from backend.gateway.main import UI_HTML_PATH, app  # noqa: E402
from backend.shared.database import SessionLocal, engine  # noqa: E402
from backend.shared.migrations import upgrade_database  # noqa: E402
from backend.shared.seed import seed_synthetic_data  # noqa: E402
from backend.tests.conftest import InProcessASGIClient  # noqa: E402

_asgi_dispatcher = InProcessASGIClient(app)


class FerremarketHTTPHandler(BaseHTTPRequestHandler):
    """Manejador HTTP/1.1 sin dependencia de `socketpair` ni IOCP que despacha a FastAPI y sirve la UI Web."""

    protocol_version = "HTTP/1.1"

    def _send_bytes(self, status_code: int, content_type: str, body: bytes) -> None:
        self.send_response(status_code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def _handle_all(self, method: str) -> None:
        parsed = urlsplit(self.path)
        clean_path = parsed.path or "/"

        if method == "OPTIONS":
            self._send_bytes(204, "text/plain; charset=utf-8", b"")
            return

        if method == "GET" and clean_path in ("/", "/index.html"):
            html_bytes = UI_HTML_PATH.read_bytes()
            self._send_bytes(200, "text/html; charset=utf-8", html_bytes)
            return

        if method == "GET" and clean_path == "/docs":
            swagger_resp = get_swagger_ui_html(openapi_url="/openapi.json", title=app.title)
            self._send_bytes(200, "text/html; charset=utf-8", bytes(swagger_resp.body))
            return

        if method == "GET" and clean_path == "/openapi.json":
            openapi_bytes = json.dumps(app.openapi(), ensure_ascii=False).encode("utf-8")
            self._send_bytes(200, "application/json; charset=utf-8", openapi_bytes)
            return

        content_len = int(self.headers.get("Content-Length", "0") or "0")
        raw_body = self.rfile.read(content_len) if content_len > 0 else None
        req_headers = {k: v for k, v in self.headers.items()}
        query_params: dict[str, Any] = dict(parse_qsl(parsed.query, keep_blank_values=False))

        resp = _asgi_dispatcher.request(
            method=method,
            path=clean_path,
            content=raw_body,
            params=query_params,
            headers=req_headers,
        )
        body_bytes = resp.text.encode("utf-8")
        self._send_bytes(resp.status_code, "application/json; charset=utf-8", body_bytes)

    def do_GET(self) -> None:  # noqa: N802
        self._handle_all("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._handle_all("POST")

    def do_PUT(self) -> None:  # noqa: N802
        self._handle_all("PUT")

    def do_PATCH(self) -> None:  # noqa: N802
        self._handle_all("PATCH")

    def do_DELETE(self) -> None:  # noqa: N802
        self._handle_all("DELETE")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._handle_all("OPTIONS")


def main() -> None:
    """Aplica migraciones Alembic (0001 + 0002), puebla datos sintéticos y levanta el servidor HTTP en el puerto 8000."""
    upgrade_database(engine)
    with SessionLocal() as db:
        seed_info = seed_synthetic_data(db)

    server = ThreadingHTTPServer(("127.0.0.1", 8000), FerremarketHTTPHandler)
    print("==================================================================", flush=True)
    print(" FERREMARKET E-COMMERCE - APLICACION COMPLETA EN EJECUCION", flush=True)
    print("==================================================================", flush=True)
    print(" -> Interfaz Web (Tienda + Admin): http://localhost:8000/", flush=True)
    print(" -> Documentacion OpenAPI / Docs : http://localhost:8000/docs", flush=True)
    print(" -> Health Check Gateway         : http://localhost:8000/health", flush=True)
    print(f" -> Semilla Sintetica (AE-26)    : {seed_info}", flush=True)
    print("==================================================================", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    main()
