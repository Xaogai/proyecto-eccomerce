"""Mi cuenta: direcciones, lista de deseos, perfil, consentimientos, ARCO, baja de cuenta y devoluciones (fase 3)."""

from collections.abc import Generator
from datetime import datetime, timedelta, timezone
import json

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from backend.gateway.main import app
from backend.services.checkout.app.order_repository import OrderRepository
from backend.shared.config import settings
from backend.shared.database import get_db
from backend.shared.models import Devolucion, Direccion, HistorialPedido, Pedido, Usuario
from backend.tests.conftest import InProcessASGIClient

PASSWORD = "Sintetico2026!"
ANA = "ana.torres.sintetica@ferremarket.local"


def _login(client: InProcessASGIClient, email: str = ANA) -> dict[str, str]:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _ana(db: Session) -> Usuario:
    return db.query(Usuario).filter(Usuario.email == ANA).one()


DIRECCION = {
    "alias": "Casa",
    "nombre_recibe": "Ana Torres",
    "calle": "Calle Morelos",
    "numero_exterior": "45",
    "colonia": "Centro",
    "codigo_postal": "50000",
    "ciudad": "Toluca",
    "entidad": "Estado de México",
    "telefono": "7221234567",
}


def test_direcciones_completas_y_una_sola_principal(client: InProcessASGIClient) -> None:
    headers = _login(client)
    nueva = client.post("/api/v1/users/me/addresses", headers=headers, json={**DIRECCION, "es_predeterminada": True})
    assert nueva.status_code == 201
    assert nueva.json()["colonia"] == "Centro" and nueva.json()["alias"] == "Casa"
    lista = client.get("/api/v1/users/me/addresses", headers=headers).json()
    assert [d["es_predeterminada"] for d in lista].count(True) == 1

    otra = next(d for d in lista if d["id"] != nueva.json()["id"])
    cambio = client.patch(
        f"/api/v1/users/me/addresses/{otra['id']}", headers=headers, json={"es_predeterminada": True, "alias": "Trabajo"}
    )
    assert cambio.json()["alias"] == "Trabajo"
    lista = client.get("/api/v1/users/me/addresses", headers=headers).json()
    assert next(d for d in lista if d["es_predeterminada"])["id"] == otra["id"]

    assert client.delete(f"/api/v1/users/me/addresses/{otra['id']}", headers=headers).status_code == 204
    restantes = client.get("/api/v1/users/me/addresses", headers=headers).json()
    assert len(restantes) == 1 and restantes[0]["es_predeterminada"], "la principal pasa a la que queda"


def test_direccion_ajena_no_se_edita(client: InProcessASGIClient, db_session: Session) -> None:
    de_ana = db_session.query(Direccion).filter(Direccion.cliente_id == _ana(db_session).id).first()
    assert de_ana is not None
    admin = _login(client, "admin.sintetico@ferremarket.local")
    assert client.patch(f"/api/v1/users/me/addresses/{de_ana.id}", headers=admin, json={"alias": "x"}).status_code == 404
    assert client.delete(f"/api/v1/users/me/addresses/{de_ana.id}", headers=admin).status_code == 404


def test_lista_de_deseos_guarda_el_precio(client: InProcessASGIClient) -> None:
    headers = _login(client)
    lista = client.post("/api/v1/users/me/deseos", headers=headers, json={"variante_sku": "TAL-20V-AMA"}).json()
    assert lista[0]["precio_guardado"] == "2799.00"
    assert lista[0]["producto"]["nombre"] == "Taladro Inalámbrico Percutor 20V"
    client.post("/api/v1/users/me/deseos", headers=headers, json={"variante_sku": "TAL-20V-AMA"})
    assert len(client.get("/api/v1/users/me/deseos", headers=headers).json()) == 1, "no se repite"
    vacia = client.delete("/api/v1/users/me/deseos/TAL-20V-ROJ", headers=headers).json()
    assert vacia == [], "se quita con cualquier SKU del producto"
    assert client.post("/api/v1/users/me/deseos", headers=headers, json={"variante_sku": "NO"}).status_code == 404


def test_perfil_y_consentimientos(client: InProcessASGIClient) -> None:
    headers = _login(client)
    perfil = client.put("/api/v1/users/me", headers=headers, json={"nombre": "Ana Torres", "telefono": "7229998877"})
    assert perfil.json()["telefono"] == "7229998877"
    consent = client.patch("/api/v1/users/me/consentimientos", headers=headers, json={"acepta_marketing": True})
    assert consent.json() == {"acepta_marketing": True, "acepta_personalizacion": False}
    assert client.get("/api/v1/users/me", headers=headers).json()["acepta_marketing"] is True


def test_solicitud_arco_con_folio_y_plazo(client: InProcessASGIClient) -> None:
    res = client.post("/api/v1/users/me/solicitudes-arco", headers=_login(client), json={"tipo": "acceso"})
    assert res.status_code == 201
    assert res.json()["folio"].startswith("ARCO-")
    limite = datetime.fromisoformat(res.json()["fecha_limite"])
    assert timedelta(days=27) < limite - datetime.now(timezone.utc) < timedelta(days=29)


def test_baja_de_cuenta_pide_contrasena_y_sin_pedidos_en_curso(client: InProcessASGIClient, db_session: Session) -> None:
    headers = _login(client)
    mala = client.request("DELETE", "/api/v1/users/me", json_body={"password": "otra"}, headers=headers)
    assert mala.status_code == 400 and mala.json()["detail"]["code"] == "wrong_password"
    en_curso = client.request("DELETE", "/api/v1/users/me", json_body={"password": PASSWORD}, headers=headers)
    assert en_curso.status_code == 409
    assert en_curso.json()["detail"]["pedidos"][0]["folio"] == "TSR-2026-5521"

    for pedido in db_session.query(Pedido).filter(Pedido.cliente_id == _ana(db_session).id):
        pedido.estado = "entregado"
    db_session.commit()
    ok = client.request("DELETE", "/api/v1/users/me", json_body={"password": PASSWORD}, headers=headers)
    assert ok.status_code == 200
    assert db_session.query(Usuario).filter(Usuario.email == ANA).first() is None, "datos anonimizados"


# Devoluciones (multipart)


@pytest.fixture()
def http(db_session: Session, tmp_path: object) -> Generator[TestClient, None, None]:
    """Cliente HTTP real (multipart) sobre la misma sesión de pruebas."""
    app.dependency_overrides[get_db] = lambda: db_session
    original = settings.media_dir
    settings.media_dir = str(tmp_path)
    with TestClient(app) as test_client:
        yield test_client
    settings.media_dir = original
    app.dependency_overrides.clear()


def _delivered_order(db: Session, days_ago: int = 3) -> Pedido:
    pedido = db.query(Pedido).filter(Pedido.folio == "TSR-2026-5521").one()
    OrderRepository(db).add_history(pedido, "entregado")
    db.flush()
    db.query(HistorialPedido).filter(HistorialPedido.pedido_id == pedido.id).update(
        {"fecha": datetime.now(timezone.utc) - timedelta(days=days_ago)}
    )
    db.commit()
    return pedido


def _ana_http(http: TestClient) -> dict[str, str]:
    token = http.post("/api/v1/auth/login", json={"email": ANA, "password": PASSWORD}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _data(**extra: object) -> dict[str, str]:
    base = {"articulos": [{"variante_sku": "TAL-20V-ROJ", "cantidad": 1}], "motivo": "no_necesito", "metodo": "tienda"}
    return {"data": json.dumps({**base, **extra})}


def test_devolucion_con_foto_y_reembolso(http: TestClient, db_session: Session) -> None:
    pedido = _delivered_order(db_session)
    headers = _ana_http(http)
    sin_foto = http.post(f"/api/v1/orders/{pedido.id}/devoluciones", headers=headers, data=_data(motivo="danado"))
    assert sin_foto.status_code == 422
    assert sin_foto.json()["detail"][0]["loc"] == ["body", "foto"]

    res = http.post(
        f"/api/v1/orders/{pedido.id}/devoluciones",
        headers=headers,
        data=_data(motivo="danado"),
        files={"foto": ("foto.png", b"\x89PNG fake", "image/png")},
    )
    assert res.status_code == 201, res.text
    assert res.json()["monto_reembolso"] == "2499.00"
    assert res.json()["estado"] == "en_revision"
    devolucion = db_session.query(Devolucion).one()
    assert devolucion.foto and devolucion.foto.startswith("devoluciones/")

    de_mas = http.post(
        f"/api/v1/orders/{pedido.id}/devoluciones",
        headers=headers,
        data=_data(articulos=[{"variante_sku": "TAL-20V-ROJ", "cantidad": 2}]),
    )
    assert de_mas.status_code == 422, "ya devolvió 1 de 2: solo queda 1"


def test_devolucion_fuera_de_plazo_o_sin_entregar(http: TestClient, db_session: Session) -> None:
    pedido = db_session.query(Pedido).filter(Pedido.folio == "TSR-2026-5521").one()
    headers = _ana_http(http)
    no_entregado = http.post(f"/api/v1/orders/{pedido.id}/devoluciones", headers=headers, data=_data())
    assert no_entregado.status_code == 409 and no_entregado.json()["detail"]["code"] == "not_returnable"
    _delivered_order(db_session, days_ago=40)
    vencido = http.post(f"/api/v1/orders/{pedido.id}/devoluciones", headers=headers, data=_data())
    assert vencido.json()["detail"]["code"] == "return_window_closed"
