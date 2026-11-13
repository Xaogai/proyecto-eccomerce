"""Panel de administración: productos, categorías, pedidos, usuarios, reportes y configuración (fase 4)."""

from collections.abc import Generator

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from backend.gateway.main import app
from backend.shared.config import settings
from backend.shared.database import get_db
from backend.shared.models import Categoria, Producto, Sucursal, Usuario
from backend.shared.security import register_failed_login
from backend.tests.conftest import InProcessASGIClient

PASSWORD = "Sintetico2026!"
ADMIN = "admin.sintetico@ferremarket.local"


def _login(client: InProcessASGIClient, email: str = ADMIN) -> dict[str, str]:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _leaf(db: Session) -> Categoria:
    return db.query(Categoria).filter(Categoria.nombre == "Taladros y Rotomartillos").one()


def test_solo_el_admin_entra_al_panel(client: InProcessASGIClient) -> None:
    cliente = _login(client, "ana.torres.sintetica@ferremarket.local")
    for ruta in ("/api/v1/admin/dashboard", "/api/v1/admin/products", "/api/v1/admin/orders", "/api/v1/admin/users"):
        assert client.get(ruta, headers=cliente).status_code == 403, ruta
    assert client.post("/api/v1/admin/seed-synthetic").status_code == 401, "cargar datos ya no es público"


def test_resumen_del_dia(client: InProcessASGIClient) -> None:
    data = client.get("/api/v1/admin/dashboard", headers=_login(client)).json()
    assert set(data["indicadores"]) >= {"ventas_hoy", "por_preparar", "pagos_rechazados", "variantes_agotadas"}
    assert len(data["ventas_por_dia"]) == 7
    assert data["indicadores"]["por_preparar"] >= 1, "el pedido TSR-2026-5521 está confirmado"


def test_producto_nuevo_en_borrador_y_publicacion_con_variante_valida(
    client: InProcessASGIClient, db_session: Session
) -> None:
    headers = _login(client)
    body = {
        "nombre": "Pinzas de presión 10 pulgadas",
        "marca": "Urrea",
        "categoria_id": str(_leaf(db_session).id),
        "descripcion": "Mordaza curva.",
        "especificaciones": {"Largo": "10 pulg"},
        "variantes": [{"etiqueta": "Única", "precio": "0", "stock_total": 0}],
    }
    creado = client.post("/api/v1/admin/products", headers=headers, json=body).json()
    assert creado["estado"] == "borrador" and creado["variantes"][0]["sku"].startswith("PIN-")
    pid = creado["id"]
    sin_precio = client.post(f"/api/v1/admin/products/{pid}/publicar", headers=headers)
    assert sin_precio.status_code == 409 and sin_precio.json()["detail"]["code"] == "no_valid_variant"

    sku = creado["variantes"][0]["sku"]
    editado = client.patch(
        f"/api/v1/admin/products/{pid}",
        headers=headers,
        json={**body, "variantes": [{"sku": sku, "etiqueta": "Única", "precio": "289.00", "stock_total": 12}]},
    ).json()
    assert editado["variantes"][0]["stock_total"] == 12
    publicado = client.post(f"/api/v1/admin/products/{pid}/publicar", headers=headers).json()
    assert publicado["estado"] == "publicado"
    assert client.get(f"/api/v1/products/{sku}").status_code == 200, "ya se ve en la tienda"

    listado = client.get("/api/v1/admin/products", headers=headers, params={"q": "pinzas"}).json()
    assert listado["total"] == 1 and listado["conteos"]["todos"] == 1


def test_no_se_borra_una_variante_con_pedidos(client: InProcessASGIClient, db_session: Session) -> None:
    producto = db_session.query(Producto).filter(Producto.nombre.like("Taladro%")).one()
    headers = _login(client)
    res = client.patch(
        f"/api/v1/admin/products/{producto.id}",
        headers=headers,
        json={
            "nombre": producto.nombre,
            "categoria_id": str(producto.categoria_id),
            "variantes": [{"sku": "TAL-20V-AMA", "etiqueta": "Amarillo · 20V · 5.0Ah", "precio": "2799.00", "stock_total": 15}],
        },
    )
    assert res.status_code == 409 and res.json()["detail"]["code"] == "variant_in_use"


def test_categorias_con_conteo_niveles_y_borrado_solo_vacias(client: InProcessASGIClient, db_session: Session) -> None:
    headers = _login(client)
    arbol = client.get("/api/v1/admin/categories", headers=headers).json()
    herramientas = next(c for c in arbol if c["nombre"] == "Herramientas")
    assert herramientas["total_productos"] >= 3

    hoja = _leaf(db_session)
    cuarto = client.post("/api/v1/admin/categories", headers=headers, json={"nombre": "Brocas", "padre_id": str(hoja.id)})
    assert cuarto.status_code == 422 and cuarto.json()["detail"]["code"] == "max_depth"
    repetida = client.post(
        "/api/v1/admin/categories", headers=headers, json={"nombre": "herramientas", "padre_id": None}
    )
    assert repetida.status_code == 422

    nueva = client.post("/api/v1/admin/categories", headers=headers, json={"nombre": "Jardín"}).json()
    renombrada = client.patch(f"/api/v1/admin/categories/{nueva['id']}", headers=headers, json={"nombre": "Jardinería"})
    assert renombrada.json()["nombre"] == "Jardinería"
    assert client.delete(f"/api/v1/admin/categories/{hoja.id}", headers=headers).status_code == 409
    assert client.delete(f"/api/v1/admin/categories/{nueva['id']}", headers=headers).status_code == 204


def test_pedidos_con_filtros_y_solo_transiciones_permitidas(client: InProcessASGIClient, db_session: Session) -> None:
    headers = _login(client)
    lista = client.get("/api/v1/admin/orders", headers=headers, params={"q": "5521"}).json()
    assert lista["total"] == 1 and lista["conteos"]["prep"] == 1
    pedido_id = lista["items"][0]["id"]

    detalle = client.get(f"/api/v1/admin/orders/{pedido_id}", headers=headers).json()
    assert detalle["transiciones_permitidas"] == ["en_preparacion", "cancelado"]
    invalido = client.post(f"/api/v1/admin/orders/{pedido_id}/estado", headers=headers, json={"estado": "entregado"})
    assert invalido.status_code == 409 and invalido.json()["detail"]["code"] == "invalid_transition"

    prep = client.post(
        f"/api/v1/admin/orders/{pedido_id}/estado", headers=headers, json={"estado": "en_preparacion", "nota": "Surtido"}
    ).json()
    assert "listo_para_recoger" not in prep["transiciones_permitidas"], "es envío a domicilio"
    assert prep["registro"][0] == {
        "fecha": prep["registro"][0]["fecha"], "de": None, "a": "en_preparacion", "actor": "Brandon Admin Sintetico",
        "nota": "Surtido",
    }
    enviado = client.post(f"/api/v1/admin/orders/{pedido_id}/estado", headers=headers, json={"estado": "enviado"}).json()
    assert enviado["estado_envio"] == "enviado"


def test_cancelar_libera_el_stock_apartado(client: InProcessASGIClient, db_session: Session) -> None:
    ana = _login(client, "ana.torres.sintetica@ferremarket.local")
    toluca = db_session.query(Sucursal).filter(Sucursal.nombre == "Sucursal Toluca Centro").one()
    cart = client.post("/api/v1/cart/items", headers=ana, json={"variante_sku": "TAL-20V-ROJ", "cantidad": 5}).json()
    order = client.post(
        "/api/v1/checkout",
        headers=ana,
        json={"carrito_id": cart["id"], "sucursal_id": str(toluca.id), "tipo_envio": "recoleccion_tienda"},
    ).json()
    stock = lambda: client.get("/api/v1/products/TAL-20V-ROJ", params={"sucursal_id": str(toluca.id)}).json()[  # noqa: E731
        "variantes"
    ][0]["stock_sucursal"]
    assert stock() == 20
    client.post(f"/api/v1/admin/orders/{order['id']}/estado", headers=_login(client), json={"estado": "cancelado"})
    assert stock() == 25


def test_usuarios_cambio_de_rol_y_desbloqueo(client: InProcessASGIClient, db_session: Session) -> None:
    headers = _login(client)
    ana = db_session.query(Usuario).filter(Usuario.email == "ana.torres.sintetica@ferremarket.local").one()
    for _ in range(5):
        register_failed_login(ana.email)
    lista = client.get("/api/v1/admin/users", headers=headers).json()
    assert [u["tipo_usuario"] for u in lista["items"]][:2] == ["admin", "staff"], "ordenados por rol"
    assert next(u for u in lista["items"] if u["id"] == str(ana.id))["bloqueado"] is True
    yo = next(u for u in lista["items"] if u["es_yo"])
    assert client.patch(f"/api/v1/admin/users/{yo['id']}", headers=headers, json={"tipo_usuario": "cliente"}).status_code == 409

    metepec = db_session.query(Sucursal).filter(Sucursal.nombre == "Sucursal Metepec").one()
    a_staff = client.patch(
        f"/api/v1/admin/users/{ana.id}", headers=headers, json={"tipo_usuario": "staff", "sucursal_id": str(metepec.id)}
    )
    assert a_staff.status_code == 409 and a_staff.json()["detail"]["code"] == "client_role_locked"
    viejo = client.patch(f"/api/v1/users/{ana.id}/role", headers=headers, json={"tipo_usuario": "admin"})
    assert viejo.status_code == 409, "el endpoint anterior sigue la misma regla"

    carlos = db_session.query(Usuario).filter(Usuario.email == "staff.toluca.sintetico@ferremarket.local").one()
    a_cliente = client.patch(f"/api/v1/admin/users/{carlos.id}", headers=headers, json={"tipo_usuario": "cliente"})
    assert a_cliente.status_code == 409 and a_cliente.json()["detail"]["code"] == "staff_to_client"
    otra_sucursal = client.patch(
        f"/api/v1/admin/users/{carlos.id}", headers=headers, json={"tipo_usuario": "staff", "sucursal_id": str(metepec.id)}
    )
    assert otra_sucursal.status_code == 200
    assert client.patch(f"/api/v1/admin/users/{carlos.id}", headers=headers, json={"tipo_usuario": "admin"}).status_code == 200

    client.post(f"/api/v1/admin/users/{ana.id}/desbloquear", headers=headers)
    me = client.get("/api/v1/users/me", headers=_login(client, ana.email)).json()
    assert me["tipo_usuario"] == "cliente"


def test_desactivar_y_nueva_contrasena_temporal_del_personal(client: InProcessASGIClient, db_session: Session) -> None:
    headers = _login(client)
    carlos = db_session.query(Usuario).filter(Usuario.email == "staff.toluca.sintetico@ferremarket.local").one()
    ana = db_session.query(Usuario).filter(Usuario.email == "ana.torres.sintetica@ferremarket.local").one()
    sesion = _login(client, carlos.email)

    assert client.post(f"/api/v1/admin/users/{ana.id}/desactivar", headers=headers).json()["detail"]["code"] == "not_staff"
    assert client.post(f"/api/v1/admin/users/{carlos.id}/desactivar", headers=sesion).status_code == 403

    assert client.post(f"/api/v1/admin/users/{carlos.id}/desactivar", headers=headers).status_code == 200
    assert client.get("/api/v1/sucursal/inventario", headers=sesion).status_code == 401, "su sesión deja de servir"
    login = client.post("/api/v1/auth/login", json={"email": carlos.email, "password": PASSWORD})
    assert login.status_code == 403 and login.json()["detail"]["code"] == "account_disabled"
    lista = client.get("/api/v1/admin/users", headers=headers).json()["items"]
    assert next(u for u in lista if u["id"] == str(carlos.id))["activo"] is False

    assert client.post(f"/api/v1/admin/users/{carlos.id}/reactivar", headers=headers).status_code == 200
    nueva = client.post(f"/api/v1/admin/users/{carlos.id}/password-temporal", headers=headers).json()
    temporal = nueva["password_temporal"]
    assert client.post("/api/v1/auth/login", json={"email": carlos.email, "password": PASSWORD}).status_code == 401
    entra = client.post("/api/v1/auth/login", json={"email": carlos.email, "password": temporal})
    assert entra.status_code == 200
    perfil = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {entra.json()['access_token']}"}).json()
    assert perfil["debe_cambiar_password"] is True

    eventos = {e["event_type"] for e in client.get("/api/v1/admin/audit-logs", headers=headers).json()}
    assert {"account_disabled", "account_enabled", "temporary_password_reset"} <= eventos


def test_alta_de_staff_con_contrasena_temporal(client: InProcessASGIClient, db_session: Session) -> None:
    headers = _login(client)
    metepec = db_session.query(Sucursal).filter(Sucursal.nombre == "Sucursal Metepec").one()
    alta = {"nombre": "Sofía Treviño", "email": " Sofia.T@Ferremarket.local ", "tipo_usuario": "staff"}

    assert client.post("/api/v1/admin/users", headers=headers, json=alta).status_code == 422, "staff sin sucursal"
    assert client.post("/api/v1/admin/users", json={**alta, "sucursal_id": str(metepec.id)}).status_code == 401
    cliente = _login(client, "ana.torres.sintetica@ferremarket.local")
    assert client.post("/api/v1/admin/users", headers=cliente, json={**alta, "sucursal_id": str(metepec.id)}).status_code == 403

    res = client.post("/api/v1/admin/users", headers=headers, json={**alta, "sucursal_id": str(metepec.id)})
    assert res.status_code == 201, res.text
    temporal = res.json()["password_temporal"]
    assert len(temporal) == 14 and res.json()["email"] == "sofia.t@ferremarket.local"
    repetido = client.post("/api/v1/admin/users", headers=headers, json={**alta, "sucursal_id": str(metepec.id)})
    assert repetido.status_code == 409 and repetido.json()["detail"]["code"] == "email_taken"

    login = client.post("/api/v1/auth/login", json={"email": "sofia.t@ferremarket.local", "password": temporal})
    assert login.status_code == 200
    sofia = {"Authorization": f"Bearer {login.json()['access_token']}"}
    perfil = client.get("/api/v1/users/me", headers=sofia).json()
    assert perfil["tipo_usuario"] == "staff" and perfil["sucursal_nombre"] == "Sucursal Metepec"
    assert perfil["debe_cambiar_password"] is True
    bloqueado = client.get("/api/v1/sucursal/inventario", headers=sofia)
    assert bloqueado.status_code == 403 and bloqueado.json()["detail"]["code"] == "password_change_required"
    cambio = client.post(
        "/api/v1/users/me/password", headers=sofia, json={"password_actual": temporal, "password_nueva": "Sofia-Nueva-2026"}
    )
    assert cambio.status_code == 200
    assert client.get("/api/v1/users/me", headers=sofia).json()["debe_cambiar_password"] is False
    assert client.get("/api/v1/sucursal/inventario", headers=sofia).status_code == 200

    logs = client.get("/api/v1/admin/audit-logs", headers=headers, params={"event_type": "user_created"}).json()
    assert logs and temporal not in str(logs), "la contraseña temporal no queda en la bitácora"


def test_alta_de_admin_no_necesita_sucursal(client: InProcessASGIClient) -> None:
    res = client.post(
        "/api/v1/admin/users",
        headers=_login(client),
        json={"nombre": "Luis Ramírez", "email": "luis.r@ferremarket.local", "tipo_usuario": "admin"},
    )
    assert res.status_code == 201 and res.json()["sucursal_id"] is None
    rechazo = client.post(
        "/api/v1/admin/users",
        headers=_login(client),
        json={"nombre": "Cliente", "email": "c@ferremarket.local", "tipo_usuario": "cliente"},
    )
    assert rechazo.status_code == 422, "los clientes se registran solos"


def test_reporte_y_csv(client: InProcessASGIClient) -> None:
    headers = _login(client)
    data = client.get("/api/v1/admin/reports", headers=headers, params={"periodo": "30d"}).json()
    assert data["pedidos"] >= 1 and data["por_departamento"][0]["nombre"] == "Herramientas"
    assert {s["sucursal"] for s in data["sucursales"]} == {"Sucursal Metepec", "Sucursal Toluca Centro"}
    csv = client.get("/api/v1/admin/reports/export.csv", headers=headers, params={"periodo": "30d"})
    assert csv.text.startswith("﻿Folio,Fecha") and "TSR-2026-5521" in csv.text


def test_configuracion_guarda_y_aplica_la_seguridad(client: InProcessASGIClient) -> None:
    headers = _login(client)
    original = settings.payment_api_key
    settings.payment_api_key = "sk_test_abcdef1234"
    try:
        data = client.get("/api/v1/admin/settings", headers=headers).json()
    finally:
        settings.payment_api_key = original
    assert data["pago"]["llave_pista"] == "…1234", "la llave completa nunca sale del servidor"
    assert len(data["envios"]["tarifas"]) == 3
    cambio = client.patch(
        "/api/v1/admin/settings",
        headers=headers,
        json={"funciones": {"cmp": False}, "envios": {"envio_gratis_desde": "999.00"}, "seguridad": {"intentos_maximos": 2}},
    ).json()
    assert cambio["funciones"]["cmp"] is False and cambio["seguridad"]["intentos_maximos"] == 2
    assert client.get("/api/v1/funciones").json()["cmp"] is False
    fallo = client.post("/api/v1/auth/login", json={"email": "staff.toluca.sintetico@ferremarket.local", "password": "x"})
    assert fallo.json()["detail"]["intentos_restantes"] == 1
    cero = client.patch("/api/v1/admin/settings", headers=headers, json={"seguridad": {"minutos_sesion": 0}})
    assert cero.status_code == 422


@pytest.fixture()
def http(db_session: Session, tmp_path: object) -> Generator[TestClient, None, None]:
    app.dependency_overrides[get_db] = lambda: db_session
    original = settings.media_dir
    settings.media_dir = str(tmp_path)
    with TestClient(app) as test_client:
        yield test_client
    settings.media_dir = original
    app.dependency_overrides.clear()


def test_imagen_con_texto_alternativo_y_servida_en_media(http: TestClient, db_session: Session) -> None:
    token = http.post("/api/v1/auth/login", json={"email": ADMIN, "password": PASSWORD}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    producto = db_session.query(Producto).filter(Producto.nombre.like("Taladro%")).one()
    sin_alt = http.post(
        f"/api/v1/admin/products/{producto.id}/imagenes", headers=headers, files={"archivo": ("a.png", b"png", "image/png")}
    )
    assert sin_alt.status_code == 422
    res = http.post(
        f"/api/v1/admin/products/{producto.id}/imagenes",
        headers=headers,
        data={"texto_alternativo": "Taladro rojo de lado"},
        files={"archivo": ("a.png", b"png", "image/png")},
    )
    assert res.status_code == 201
    assert http.get(res.json()["url"]).content == b"png"
    assert http.get("/api/v1/media/productos/..%2F..%2Fsecreto").status_code == 404
    ficha = http.get("/api/v1/products/TAL-20V-ROJ").json()
    assert ficha["imagenes"][0]["texto_alternativo"] == "Taladro rojo de lado"
