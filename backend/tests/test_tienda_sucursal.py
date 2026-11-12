"""Panel de sucursal: inventario, pedidos para recoger y entrega en mostrador (fase 5)."""

import uuid

from sqlalchemy.orm import Session

from backend.shared.models import Pedido, Sucursal
from backend.tests.conftest import InProcessASGIClient

PASSWORD = "Sintetico2026!"
STAFF = "staff.toluca.sintetico@ferremarket.local"


def _login(client: InProcessASGIClient, email: str = STAFF) -> dict[str, str]:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _branch(db: Session, nombre: str) -> Sucursal:
    return db.query(Sucursal).filter(Sucursal.nombre == nombre).one()


def _paid_pickup(client: InProcessASGIClient, db: Session, qty: int = 2) -> dict[str, str]:
    ana = _login(client, "ana.torres.sintetica@ferremarket.local")
    cart = client.post("/api/v1/cart/items", headers=ana, json={"variante_sku": "TAL-20V-ROJ", "cantidad": qty}).json()
    order = client.post(
        "/api/v1/checkout",
        headers=ana,
        json={"carrito_id": cart["id"], "sucursal_id": str(_branch(db, "Sucursal Toluca Centro").id),
              "tipo_envio": "recoleccion_tienda"},
    ).json()
    client.post(order["checkout_url"], params={"resultado": "aprobado"})
    return order


def test_solo_staff_y_admin_y_el_staff_ve_su_sucursal(client: InProcessASGIClient, db_session: Session) -> None:
    cliente = _login(client, "ana.torres.sintetica@ferremarket.local")
    assert client.get("/api/v1/sucursal/inventario", headers=cliente).status_code == 403
    metepec = _branch(db_session, "Sucursal Metepec")
    data = client.get("/api/v1/sucursal/inventario", headers=_login(client), params={"sucursal_id": str(metepec.id)}).json()
    assert data["sucursal"]["nombre"] == "Sucursal Toluca Centro", "el staff no puede ver otra sucursal"
    admin = client.get(
        "/api/v1/sucursal/inventario", headers=_login(client, "admin.sintetico@ferremarket.local"),
        params={"sucursal_id": str(metepec.id)},
    ).json()
    assert admin["sucursal"]["nombre"] == "Sucursal Metepec"


def test_inventario_con_busqueda_y_filtros(client: InProcessASGIClient) -> None:
    headers = _login(client)
    data = client.get("/api/v1/sucursal/inventario", headers=headers, params={"page_size": 100}).json()
    roja = client.get("/api/v1/sucursal/inventario", headers=headers, params={"q": "TAL-20V-ROJ"}).json()["items"][0]
    assert roja["piezas"] == 25 and roja["estado"] == "ok" and roja["pasillo"] != "Sin asignar"
    assert data["conteos"]["todos"] == data["total"]
    busqueda = client.get("/api/v1/sucursal/inventario", headers=headers, params={"q": "tal-20v"}).json()
    assert {r["sku"] for r in busqueda["items"]} == {"TAL-20V-ROJ", "TAL-20V-AMA"}
    agotados = client.get("/api/v1/sucursal/inventario", headers=headers, params={"estado": "out"}).json()
    assert all(r["estado"] == "out" for r in agotados["items"])


def test_ajuste_con_motivo_que_respeta_lo_apartado(client: InProcessASGIClient, db_session: Session) -> None:
    order = _paid_pickup(client, db_session, qty=5)
    assert order["id"]
    headers = _login(client)
    baja = client.post("/api/v1/sucursal/inventario/TAL-20V-ROJ/ajuste", headers=headers, json={"delta": -21, "motivo": "Merma"})
    assert baja.status_code == 409 and baja.json()["detail"]["code"] == "below_reserved"
    ok = client.post("/api/v1/sucursal/inventario/TAL-20V-ROJ/ajuste", headers=headers, json={"delta": -3, "motivo": "Merma"})
    assert ok.json()["piezas"] == 22, "25 - 3; las 5 apartadas siguen contando como piezas"
    cero = client.post("/api/v1/sucursal/inventario/TAL-20V-ROJ/ajuste", headers=headers, json={"delta": 0, "motivo": "x x"})
    assert cero.status_code == 422


def test_pedido_avanza_solo_hacia_adelante_y_se_entrega_con_codigo(client: InProcessASGIClient, db_session: Session) -> None:
    order = _paid_pickup(client, db_session)
    headers = _login(client)
    tablero = client.get("/api/v1/sucursal/recolecciones", headers=headers).json()
    fila = next(p for p in tablero["por_preparar"] if p["id"] == order["id"])
    assert fila["transiciones"] == ["en_preparacion"] and fila["cliente"] == "Ana T."
    assert fila["ubicacion"].startswith("Pasillo")

    url = f"/api/v1/sucursal/recolecciones/{order['id']}/estado"
    assert client.post(url, headers=headers, json={"estado": "listo_para_recoger"}).status_code == 409
    client.post(url, headers=headers, json={"estado": "en_preparacion"})
    listo = client.post(url, headers=headers, json={"estado": "listo_para_recoger"}).json()
    assert listo["ubicacion"].startswith("Estante R-0")

    pedido = db_session.get(Pedido, uuid.UUID(order["id"]))
    assert pedido is not None
    codigo = pedido.codigo_recoleccion
    assert client.post("/api/v1/sucursal/recolecciones/verificar", headers=headers, json={"codigo": "12"}).status_code == 422
    verificado = client.post("/api/v1/sucursal/recolecciones/verificar", headers=headers, json={"codigo": codigo}).json()
    assert verificado["folio"] == order["folio"] and verificado["productos"][0]["cantidad"] == 2

    entregar = f"/api/v1/sucursal/recolecciones/{order['id']}/entregar"
    sin_revisar = client.post(entregar, headers=headers, json={"codigo": codigo})
    assert sin_revisar.status_code == 422
    entregado = client.post(
        entregar, headers=headers, json={"codigo": codigo, "identificacion_revisada": True, "productos_revisados": True}
    ).json()
    assert entregado["estado"] == "entregado"
    tablero = client.get("/api/v1/sucursal/recolecciones", headers=headers).json()
    assert any(p["id"] == order["id"] for p in tablero["entregados_hoy"])


def test_otra_sucursal_no_puede_mover_el_pedido(client: InProcessASGIClient, db_session: Session) -> None:
    order = _paid_pickup(client, db_session)
    admin = _login(client, "admin.sintetico@ferremarket.local")
    metepec = _branch(db_session, "Sucursal Metepec")
    res = client.post(
        f"/api/v1/sucursal/recolecciones/{order['id']}/estado",
        headers=admin,
        params={"sucursal_id": str(metepec.id)},
        json={"estado": "en_preparacion"},
    )
    assert res.status_code == 404
