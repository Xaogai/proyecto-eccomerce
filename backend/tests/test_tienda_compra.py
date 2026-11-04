"""Sesión, carrito, checkout, pasarela de pruebas y pedidos (fase 2 de la integración)."""

from decimal import Decimal
import uuid

from sqlalchemy.orm import Session

from backend.shared.models import Pedido, Sucursal, Usuario
from backend.shared.security import get_audit_logs
from backend.tests.conftest import InProcessASGIClient

PASSWORD = "Sintetico2026!"
ANA = "ana.torres.sintetica@ferremarket.local"


def _login(client: InProcessASGIClient, email: str = ANA, password: str = PASSWORD) -> dict[str, str]:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _toluca(db: Session) -> str:
    return str(db.query(Sucursal).filter(Sucursal.nombre == "Sucursal Toluca Centro").one().id)


def _cart_with(client: InProcessASGIClient, headers: dict[str, str], sku: str = "TAL-20V-ROJ", qty: int = 1) -> str:
    res = client.post("/api/v1/cart/items", headers=headers, json={"variante_sku": sku, "cantidad": qty})
    assert res.status_code == 201, res.text
    return str(res.json()["id"])


# Sesión


def test_registro_publico_siempre_crea_cliente(client: InProcessASGIClient, db_session: Session) -> None:
    res = client.post(
        "/api/v1/auth/register",
        json={
            "nombre": "Intruso",
            "email": "intruso@correo.com",
            "password": "Contrasena123",
            "tipo_usuario": "admin",
            "telefono": "7221234567",
        },
    )
    assert res.status_code == 201
    assert res.json()["tipo_usuario"] == "cliente"
    assert db_session.query(Usuario).filter(Usuario.email == "intruso@correo.com").one().telefono == "7221234567"
    repetido = client.post(
        "/api/v1/auth/register", json={"nombre": "Otra", "email": ANA, "password": "Contrasena123"}
    )
    assert repetido.status_code == 409
    assert repetido.json()["detail"]["code"] == "email_taken"


def test_login_avisa_intentos_restantes_y_bloquea(client: InProcessASGIClient) -> None:
    fallo = client.post("/api/v1/auth/login", json={"email": ANA, "password": "mala"})
    assert fallo.status_code == 401
    assert fallo.json()["detail"]["code"] == "invalid_credentials"
    assert fallo.json()["detail"]["intentos_restantes"] == 4
    for _ in range(4):
        client.post("/api/v1/auth/login", json={"email": ANA, "password": "mala"})
    bloqueada = client.post("/api/v1/auth/login", json={"email": ANA, "password": PASSWORD})
    assert bloqueada.status_code == 429
    assert bloqueada.json()["detail"]["code"] == "account_locked"


def test_recuperacion_manda_el_enlace_solo_por_correo(client: InProcessASGIClient) -> None:
    res = client.post("/api/v1/auth/password-reset/request", json={"email": ANA})
    assert res.json() == {"detail": "Si el correo está registrado, recibirá las instrucciones de recuperación."}
    correo = get_audit_logs("email_notification_sent")[-1]["details"]
    assert "/cuenta/restablecer/" in correo["body"]
    desconocido = client.post("/api/v1/auth/password-reset/request", json={"email": "nadie@correo.com"})
    assert desconocido.json() == res.json(), "no revela si el correo existe"


def test_logout_invalida_tambien_el_refresh_token(client: InProcessASGIClient) -> None:
    tokens = client.post("/api/v1/auth/login", json={"email": ANA, "password": PASSWORD}).json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert client.post("/api/v1/auth/logout", headers=headers, json={"refresh_token": tokens["refresh_token"]}).status_code == 200
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401


def test_cambiar_contrasena_pide_la_actual(client: InProcessASGIClient) -> None:
    headers = _login(client)
    mala = client.post(
        "/api/v1/users/me/password", headers=headers, json={"password_actual": "otra", "password_nueva": "Nueva12345"}
    )
    assert mala.status_code == 400
    assert mala.json()["detail"]["code"] == "wrong_password"
    ok = client.post(
        "/api/v1/users/me/password", headers=headers, json={"password_actual": PASSWORD, "password_nueva": "Nueva12345"}
    )
    assert ok.status_code == 200
    _login(client, password="Nueva12345")


def test_perfil_del_staff_trae_su_sucursal(client: InProcessASGIClient) -> None:
    me = client.get("/api/v1/users/me", headers=_login(client, "staff.toluca.sintetico@ferremarket.local")).json()
    assert me["tipo_usuario"] == "staff"
    assert me["sucursal_nombre"] == "Sucursal Toluca Centro"


# Carrito


def test_carrito_ajeno_no_se_puede_leer_ni_modificar(client: InProcessASGIClient) -> None:
    ana_cart = _cart_with(client, _login(client))
    admin = _login(client, "admin.sintetico@ferremarket.local")
    ajeno = client.get("/api/v1/cart", headers={**admin, "X-Cart-Id": ana_cart}).json()
    assert ajeno["id"] != ana_cart
    invitado = client.get("/api/v1/cart", headers={"X-Cart-Id": ana_cart}).json()
    assert invitado["id"] != ana_cart and invitado["items"] == []


def test_carrito_informa_stock_y_no_deja_pedir_de_mas(client: InProcessASGIClient, db_session: Session) -> None:
    headers = _login(client)
    cart_id = _cart_with(client, headers)
    data = client.get("/api/v1/cart", headers=headers, params={"sucursal_id": _toluca(db_session)}).json()
    item = data["items"][0]
    assert item["producto_sku"] == "TAL-20V-ROJ"
    assert item["stock_disponible"] == 35 and item["stock_sucursal"] == 25
    demasiado = client.patch("/api/v1/cart/items/TAL-20V-ROJ", headers=headers, json={"carrito_id": cart_id, "cantidad": 36})
    assert demasiado.status_code == 409
    assert demasiado.json()["detail"] == {"code": "out_of_stock", "message": "Solo hay 35 disponibles.", "disponibles": 35}


def test_carrito_de_invitado_pasa_a_la_cuenta(client: InProcessASGIClient) -> None:
    guest = client.post("/api/v1/cart/items", json={"variante_sku": "ROT-BOS-850W", "cantidad": 2}).json()
    headers = _login(client)
    _cart_with(client, headers, "TAL-20V-ROJ")
    merged = client.post("/api/v1/cart/merge", headers=headers, json={"carrito_invitado_id": guest["id"]}).json()
    assert {i["variante_sku"]: i["cantidad"] for i in merged["items"]} == {"TAL-20V-ROJ": 1, "ROT-BOS-850W": 2}
    otra_vez = client.post("/api/v1/cart/merge", headers=headers, json={"carrito_invitado_id": guest["id"]}).json()
    assert {i["variante_sku"]: i["cantidad"] for i in otra_vez["items"]}["ROT-BOS-850W"] == 2, "no se suma dos veces"


# Checkout y pasarela de pruebas


def test_recoger_en_tienda_con_codigo_y_pasarela_de_pruebas(client: InProcessASGIClient, db_session: Session) -> None:
    headers = _login(client)
    cart_id = _cart_with(client, headers, qty=2)
    res = client.post(
        "/api/v1/checkout",
        headers=headers,
        json={"carrito_id": cart_id, "sucursal_id": _toluca(db_session), "tipo_envio": "recoleccion_tienda"},
    )
    assert res.status_code == 201, res.text
    order = res.json()
    assert order["checkout_url"] == f"/api/v1/pagos/sandbox/{order['referencia_pasarela']}"
    assert order["codigo_recoleccion"] and len(order["codigo_recoleccion"]) == 4
    assert order["costo_envio"] == "0.00" and order["sucursal_nombre"] == "Sucursal Toluca Centro"
    assert order["items"][0]["nombre_producto"] == "Taladro Inalámbrico Percutor 20V"

    pagina = client.get(order["checkout_url"])
    assert pagina.status_code == 200 and order["folio"] in pagina.text
    pagado = client.post(order["checkout_url"], params={"resultado": "aprobado"})
    assert pagado.status_code == 303

    detalle = client.get(f"/api/v1/orders/{order['id']}", headers=headers).json()
    assert detalle["estado"] == "confirmado" and detalle["estado_pago"] == "aprobado"
    assert [h["estado"] for h in detalle["historial"]] == ["pendiente_pago", "confirmado"]


def test_envio_a_domicilio_cobra_el_envio_por_codigo_postal(client: InProcessASGIClient, db_session: Session) -> None:
    from backend.shared.configuracion import set_section

    set_section(db_session, "envios", {"envio_gratis_desde": "99999.00"})
    headers = _login(client)
    cart_id = _cart_with(client, headers, "ROT-BOS-850W")
    direccion = {
        "calle": "Calle Hidalgo",
        "numero_exterior": "12",
        "colonia": "Centro",
        "codigo_postal": "44100",
        "ciudad": "Guadalajara",
        "entidad": "Jalisco",
    }
    order = client.post(
        "/api/v1/checkout",
        headers=headers,
        json={"carrito_id": cart_id, "tipo_envio": "domicilio", "direccion": direccion},
    ).json()
    assert order["direccion_entrega"] == "Calle Hidalgo 12, Col. Centro, 44100 Guadalajara, Jalisco"
    assert order["costo_envio"] == "149.00"
    assert Decimal(order["total_con_envio"]) == Decimal(order["total"]) + Decimal("149.00")
    pedido = db_session.get(Pedido, uuid.UUID(order["id"]))
    assert pedido is not None and pedido.pagos[0].monto == Decimal(order["total_con_envio"]), "se cobra el envío"


def test_envio_gratis_desde_el_monto_configurado(client: InProcessASGIClient, db_session: Session) -> None:
    from backend.shared.configuracion import set_section

    set_section(db_session, "envios", {"envio_gratis_desde": "1000.00"})
    headers = _login(client)
    cart_id = _cart_with(client, headers)
    order = client.post(
        "/api/v1/checkout", headers=headers, json={"carrito_id": cart_id, "tipo_envio": "domicilio"}
    ).json()
    assert order["costo_envio"] == "0.00"


def test_no_se_puede_pagar_el_carrito_de_otro(client: InProcessASGIClient, db_session: Session) -> None:
    ana_cart = _cart_with(client, _login(client))
    admin = _login(client, "admin.sintetico@ferremarket.local")
    res = client.post(
        "/api/v1/checkout",
        headers=admin,
        json={"carrito_id": ana_cart, "sucursal_id": _toluca(db_session), "tipo_envio": "recoleccion_tienda"},
    )
    assert res.status_code == 400


def test_reintentar_pago_rechazado(client: InProcessASGIClient, db_session: Session) -> None:
    headers = _login(client)
    cart_id = _cart_with(client, headers)
    order = client.post(
        "/api/v1/checkout",
        headers=headers,
        json={
            "carrito_id": cart_id,
            "sucursal_id": _toluca(db_session),
            "tipo_envio": "recoleccion_tienda",
            "payment_token": "tok_decline",
        },
    ).json()
    assert order["estado"] == "pago_rechazado"
    retry = client.post(f"/api/v1/orders/{order['id']}/pago/reintentar", headers=headers)
    assert retry.status_code == 200, retry.text
    assert retry.json()["checkout_url"].startswith("/api/v1/pagos/sandbox/")
    otra = client.post(f"/api/v1/orders/{order['id']}/pago/reintentar", headers=headers)
    assert otra.status_code == 409 and otra.json()["detail"]["code"] == "not_retryable"
    ajeno = client.post(
        f"/api/v1/orders/{order['id']}/pago/reintentar", headers=_login(client, "admin.sintetico@ferremarket.local")
    )
    assert ajeno.status_code == 404


def test_pagos_solo_del_dueno_y_por_el_monto_del_pedido(client: InProcessASGIClient, db_session: Session) -> None:
    ana = db_session.query(Usuario).filter(Usuario.email == ANA).one()
    pedido = db_session.query(Pedido).filter(Pedido.cliente_id == ana.id).first()
    assert pedido is not None
    staff = _login(client, "staff.toluca.sintetico@ferremarket.local")
    payload = {"pedido_id": str(pedido.id), "monto": "1.00", "metodo": "tarjeta", "provider": "stripe",
               "payment_token": "tok_visa_sandbox"}
    assert client.post("/api/v1/payments", headers=staff, json=payload).status_code == 404
    caro = client.post("/api/v1/payments", headers=_login(client), json={**payload, "monto": "999999.00"})
    assert caro.status_code == 400


def test_pasarela_de_pruebas_apagada_en_produccion(client: InProcessASGIClient) -> None:
    from backend.shared.config import settings

    setattr(settings, "pasarela_sandbox", False)
    try:
        assert client.get("/api/v1/pagos/sandbox/cualquiera").status_code == 404
    finally:
        setattr(settings, "pasarela_sandbox", True)
