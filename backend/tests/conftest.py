"""Configuración compartida de fixtures de Pytest para pruebas unitarias y de integración."""

from collections.abc import Generator
from dataclasses import dataclass
import inspect
import json
from typing import Any, Callable, get_args
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.params import Body, Depends as DependsParam, Header as HeaderParam, Path as PathParam, Query as QueryParam
from fastapi.routing import APIRoute
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ValidationError
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend.gateway.main import app
from backend.services.payments.app.gateway_factory import circuit_breaker
from backend.shared.database import Base, get_db, set_operational_session_factory
from backend.shared.seed import seed_synthetic_data

TEST_SQLITE_URL = "sqlite+pysqlite:///:memory:"

test_engine = create_engine(
    TEST_SQLITE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@dataclass
class ClientResponse:
    """Respuesta HTTP simulada en memoria compatible con `TestClient`."""

    status_code: int
    _data: Any
    text: str

    def json(self) -> Any:
        """Retorna el cuerpo deserializado como JSON."""
        return self._data


class _DummyRequest:
    """Objeto Request ligero para endpoints que leen el cuerpo crudo (ej. webhooks)."""

    def __init__(self, raw_body: bytes, headers: dict[str, str]) -> None:
        self._raw_body = raw_body
        self.headers = headers

    async def body(self) -> bytes:
        """Retorna los bytes crudos de la petición."""
        return self._raw_body


class InProcessASGIClient:
    """
    Cliente de pruebas en memoria para FastAPI que resuelve rutas, modelos Pydantic y dependencias (`Depends`)
    sin abrir sockets TCP (`socketpair`), evitando bloqueos del firewall/sandbox de Windows.
    """

    def __init__(self, fastapi_app: FastAPI) -> None:
        self.app = fastapi_app

    def get(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> ClientResponse:
        return self.request("GET", path, params=params, headers=headers)

    def post(
        self,
        path: str,
        json: dict[str, Any] | None = None,
        content: bytes | None = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> ClientResponse:
        return self.request("POST", path, json_body=json, content=content, params=params, headers=headers)

    def put(
        self,
        path: str,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> ClientResponse:
        return self.request("PUT", path, json_body=json, headers=headers)

    def patch(
        self,
        path: str,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, Any] | None = None,
    ) -> ClientResponse:
        return self.request("PATCH", path, json_body=json, params=params, headers=headers)

    def delete(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> ClientResponse:
        return self.request("DELETE", path, params=params, headers=headers)

    def _iter_api_routes(self) -> list[APIRoute]:
        routes: list[APIRoute] = []
        for item in self.app.routes:
            if isinstance(item, APIRoute):
                routes.append(item)
            elif hasattr(item, "original_router"):
                for sub in item.original_router.routes:
                    if isinstance(sub, APIRoute):
                        routes.append(sub)
        return routes

    def _match_route(self, method: str, path: str) -> tuple[APIRoute, dict[str, str]]:
        clean_path = path.split("?")[0]
        for route in self._iter_api_routes():
            if route.methods and method.upper() in route.methods:
                match = route.path_regex.match(clean_path)
                if match:
                    return route, match.groupdict()
        raise HTTPException(status_code=404, detail=f"Ruta no encontrada: {method} {path}")

    def _convert_primitive(self, val: Any, annotation: Any) -> Any:
        if val is None:
            return None
        args = get_args(annotation)
        if args:
            non_none = [a for a in args if a is not type(None)]
            if len(non_none) == 1:
                annotation = non_none[0]
        if annotation is uuid.UUID and not isinstance(val, uuid.UUID):
            return uuid.UUID(str(val))
        if annotation is int and not isinstance(val, int):
            return int(val)
        return val

    def _extract_header(self, param_name: str, headers: dict[str, str], default_val: Any) -> Any:
        header_key = param_name.replace("_", "-").lower()
        for hk, hv in headers.items():
            if hk.lower() == header_key:
                return hv
        return default_val

    def _resolve_param(
        self,
        name: str,
        param: inspect.Parameter,
        path_params: dict[str, str],
        query_params: dict[str, Any],
        headers: dict[str, str],
        body_dict: dict[str, Any] | None,
        raw_body: bytes,
        cleanup_generators: list[Generator[Any, None, None]],
    ) -> Any:
        default = param.default
        annotation = param.annotation
        if isinstance(default, DependsParam):
            dep_fn = default.dependency or annotation
            return self._resolve_callable(
                dep_fn, path_params, query_params, headers, body_dict, raw_body, cleanup_generators
            )
        if annotation is Request or name == "request":
            return _DummyRequest(raw_body=raw_body, headers=headers)
        if isinstance(annotation, type) and issubclass(annotation, BaseModel):
            return annotation.model_validate(body_dict or {})
        if name in path_params:
            return self._convert_primitive(path_params[name], annotation)
        if isinstance(default, HeaderParam):
            raw_hdr = self._extract_header(name, headers, default.default)
            return self._convert_primitive(raw_hdr, annotation)
        if isinstance(default, (QueryParam, PathParam, Body)):
            alias_key = getattr(default, "alias", None) or name
            val = query_params.get(alias_key, query_params.get(name, default.default))
            return self._convert_primitive(val, annotation)
        if name in query_params:
            return self._convert_primitive(query_params[name], annotation)
        return default

    def _invoke_target(
        self,
        actual_fn: Callable[..., Any],
        kwargs: dict[str, Any],
        cleanup_generators: list[Generator[Any, None, None]],
    ) -> Any:
        if inspect.isgeneratorfunction(actual_fn):
            gen = actual_fn(**kwargs)
            cleanup_generators.append(gen)
            return next(gen)
        if inspect.iscoroutinefunction(actual_fn):
            coro = actual_fn(**kwargs)
            try:
                coro.send(None)
            except StopIteration as stop:
                return stop.value
        return actual_fn(**kwargs)

    def _resolve_callable(
        self,
        fn: Callable[..., Any],
        path_params: dict[str, str],
        query_params: dict[str, Any],
        headers: dict[str, str],
        body_dict: dict[str, Any] | None,
        raw_body: bytes,
        cleanup_generators: list[Generator[Any, None, None]],
    ) -> Any:
        actual_fn = self.app.dependency_overrides.get(fn, fn)
        if isinstance(actual_fn, HTTPBearer):
            auth_val = headers.get("authorization") or headers.get("Authorization")
            if not auth_val or not auth_val.lower().startswith("bearer "):
                return None
            return HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth_val.split(" ", 1)[1])

        sig = inspect.signature(actual_fn)
        kwargs: dict[str, Any] = {}
        for name, param in sig.parameters.items():
            val = self._resolve_param(
                name, param, path_params, query_params, headers, body_dict, raw_body, cleanup_generators
            )
            if val is not inspect.Parameter.empty:
                kwargs[name] = val
        return self._invoke_target(actual_fn, kwargs, cleanup_generators)

    def _serialize(self, obj: Any) -> Any:
        if isinstance(obj, BaseModel):
            return json.loads(obj.model_dump_json())
        if isinstance(obj, dict):
            return {k: self._serialize(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self._serialize(i) for i in obj]
        if hasattr(obj, "__table__"):
            data = {}
            for col in obj.__table__.columns:
                val = getattr(obj, col.name)
                data[col.name] = str(val) if isinstance(val, uuid.UUID) else val
            return json.loads(json.dumps(data, default=str))
        return json.loads(json.dumps(obj, default=str))

    def request(
        self,
        method: str,
        path: str,
        json_body: dict[str, Any] | None = None,
        content: bytes | None = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> ClientResponse:
        req_headers = headers or {}
        req_params = dict(params or {})
        if "?" in path:
            _, qs = path.split("?", 1)
            for part in qs.split("&"):
                if "=" in part:
                    k, v = part.split("=", 1)
                    req_params[k] = v

        raw_bytes = content if content is not None else (json.dumps(json_body).encode("utf-8") if json_body else b"")
        parsed_body = json.loads(content.decode("utf-8")) if content is not None else json_body

        cleanup_gens: list[Generator[Any, None, None]] = []
        try:
            route, path_params = self._match_route(method, path)
            result = self._resolve_callable(
                route.endpoint,
                path_params=path_params,
                query_params=req_params,
                headers=req_headers,
                body_dict=parsed_body,
                raw_body=raw_bytes,
                cleanup_generators=cleanup_gens,
            )
            status_code = route.status_code or 200
            if hasattr(result, "body") and isinstance(result.body, bytes):
                raw_text = result.body.decode("utf-8")
                return ClientResponse(status_code=status_code, _data=raw_text, text=raw_text)
            serialized = self._serialize(result)
            return ClientResponse(status_code=status_code, _data=serialized, text=json.dumps(serialized))
        except ValidationError as exc:
            err_data = {"detail": json.loads(exc.json())}
            return ClientResponse(status_code=422, _data=err_data, text=json.dumps(err_data))
        except HTTPException as exc:
            err_data = {"detail": exc.detail}
            return ClientResponse(status_code=exc.status_code, _data=err_data, text=json.dumps(err_data))
        finally:
            for gen in reversed(cleanup_gens):
                try:
                    next(gen)
                except StopIteration:
                    pass


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    """Provee una base de datos limpia en memoria con las 16 tablas en 2FN, las operativas y datos sintéticos."""
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    set_operational_session_factory(TestingSessionLocal)
    circuit_breaker.reset()

    session = TestingSessionLocal()
    try:
        seed_synthetic_data(session)
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_session: Session) -> Generator[InProcessASGIClient, None, None]:
    """Provee un cliente de pruebas conectado a la sesión de pruebas sin requerir sockets de red."""

    def _override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    yield InProcessASGIClient(app)
    app.dependency_overrides.clear()
