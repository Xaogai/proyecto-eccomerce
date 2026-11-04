"""Catálogo de la tienda: listado con facetas, detalle por sucursal, reseñas y sucursales (fase 1 de la integración)."""

from sqlalchemy.orm import Session

from backend.shared.models import Producto, Sucursal
from backend.tests.conftest import InProcessASGIClient

PASSWORD = "Sintetico2026!"


def _login(client: InProcessASGIClient, email: str) -> dict[str, str]:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def _root_id(client: InProcessASGIClient, nombre: str) -> str:
    tree = client.get("/api/v1/categories").json()
    return next(c["id"] for c in tree if c["nombre"] == nombre)


def test_listado_incluye_subcategorias_y_total_real(client: InProcessASGIClient) -> None:
    herramientas = _root_id(client, "Herramientas")
    res = client.get("/api/v1/products", params={"category": herramientas, "page_size": 2})
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 3
    assert len(data["items"]) == 2
    assert data["page_size"] == 2
    segunda = client.get("/api/v1/products", params={"category": herramientas, "page_size": 2, "page": 2}).json()
    assert {p["id"] for p in segunda["items"]}.isdisjoint({p["id"] for p in data["items"]})


def test_facetas_cuentan_sin_su_propio_filtro(client: InProcessASGIClient) -> None:
    data = client.get("/api/v1/products", params={"marca": "Bosch"}).json()
    assert data["items"] and all(p["marca"] == "Bosch" for p in data["items"])
    marca = next(f for f in data["facetas"] if f["clave"] == "marca")
    assert marca["titulo"] == "Marca"
    bosch = next(o for o in marca["opciones"] if o["valor"] == "Bosch")
    assert bosch["seleccionada"] is True
    assert len(marca["opciones"]) > 1, "las demás marcas siguen visibles para combinarlas"


def test_filtro_por_atributo_y_orden_por_precio(client: InProcessASGIClient) -> None:
    data = client.get(
        "/api/v1/products", params={"atributo": "color:amarillo", "orden": "precio_desc"}
    ).json()
    assert data["items"]
    for producto in data["items"]:
        assert any(v["atributos"].get("color") == "amarillo" for v in producto["variantes"])
    precios = [min(float(v["precio"]) for v in p["variantes"]) for p in data["items"]]
    assert precios == sorted(precios, reverse=True)


def test_busqueda_sin_acentos_y_disponible_hoy(client: InProcessASGIClient, db_session: Session) -> None:
    data = client.get("/api/v1/products", params={"q": "inalambrico"}).json()
    assert any("Inalámbrico" in p["nombre"] for p in data["items"])

    metepec = db_session.query(Sucursal).filter(Sucursal.nombre == "Sucursal Metepec").one()
    hoy = client.get(
        "/api/v1/products", params={"sucursal_id": str(metepec.id), "disponible_hoy": "true", "page_size": 96}
    ).json()
    for producto in hoy["items"]:
        assert any((v["stock_sucursal"] or 0) > 0 for v in producto["variantes"])


def test_detalle_con_ruta_imagenes_especificaciones_y_stock_por_sucursal(
    client: InProcessASGIClient, db_session: Session
) -> None:
    toluca = db_session.query(Sucursal).filter(Sucursal.nombre == "Sucursal Toluca Centro").one()
    res = client.get("/api/v1/products/TAL-20V-ROJ", params={"sucursal_id": str(toluca.id)})
    assert res.status_code == 200
    data = res.json()
    assert [c["nombre"] for c in data["ruta_categoria"]] == [
        "Herramientas",
        "Herramientas Eléctricas",
        "Taladros y Rotomartillos",
    ]
    assert data["imagenes"][0]["url"].startswith("/api/v1/product-image/")
    assert data["especificaciones"]["Marca"] == "Milwaukee"
    roja = next(v for v in data["variantes"] if v["sku"] == "TAL-20V-ROJ")
    assert roja["stock_sucursal"] == 25
    assert data["total_resenas"] == 2
    assert data["calificacion_promedio"] == 4.5


def test_producto_en_borrador_no_se_ve_en_la_tienda(client: InProcessASGIClient, db_session: Session) -> None:
    producto = db_session.query(Producto).filter(Producto.nombre.like("Rotomartillo%")).one()
    producto.estado = "borrador"
    db_session.commit()
    assert client.get("/api/v1/products/ROT-BOS-850W").status_code == 404
    listado = client.get("/api/v1/products", params={"q": "rotomartillo"}).json()
    assert listado["total"] == 0


def test_resenas_paginadas_con_resumen(client: InProcessASGIClient) -> None:
    data = client.get("/api/v1/products/TAL-20V-ROJ/resenas", params={"page_size": 1}).json()
    assert data["total"] == 2
    assert len(data["items"]) == 1
    assert data["resumen"]["por_estrellas"] == [1, 1, 0, 0, 0]
    assert client.get("/api/v1/products/NO-EXISTE/resenas").status_code == 404


def test_crear_resena_marca_compra_verificada(client: InProcessASGIClient) -> None:
    payload = {"calificacion": 5, "titulo": "Excelente", "comentario": "Muy buena herramienta para la casa."}
    assert client.post("/api/v1/products/TAL-20V-ROJ/resenas", json=payload).status_code == 401

    ana = _login(client, "ana.torres.sintetica@ferremarket.local")
    res = client.post("/api/v1/products/TAL-20V-ROJ/resenas", json=payload, headers=ana)
    assert res.status_code == 201
    assert res.json()["compra_verificada"] is True, "Ana compró el taladro (pedido TSR-2026-5521)"
    assert res.json()["autor"] == "Ana T."

    admin = _login(client, "admin.sintetico@ferremarket.local")
    otra = client.post("/api/v1/products/ROT-BOS-850W/resenas", json=payload, headers=admin)
    assert otra.json()["compra_verificada"] is False

    invalida = client.post(
        "/api/v1/products/TAL-20V-ROJ/resenas", json={**payload, "calificacion": 6}, headers=ana
    )
    assert invalida.status_code == 422


def test_sucursales_con_direccion_propia_y_servicios(client: InProcessASGIClient) -> None:
    sucursales = client.get("/api/v1/branches").json()
    toluca = next(s for s in sucursales if s["nombre"] == "Sucursal Toluca Centro")
    assert toluca["codigo_postal"] == "50000"
    assert toluca["calle"].startswith("Av. Benito Juárez")
    assert toluca["telefono"] and toluca["horario"]
    assert toluca["latitud"] is not None and toluca["longitud"] is not None
    assert "Recoger en tienda" in toluca["servicios"]


def test_funciones_activas_con_predeterminados_y_guardadas(client: InProcessASGIClient, db_session: Session) -> None:
    from backend.shared.configuracion import set_section

    assert client.get("/api/v1/funciones").json() == {
        "v360": True,
        "calc": True,
        "cmp": True,
        "rev": True,
        "queue": False,
    }
    set_section(db_session, "funciones", {"cmp": False, "desconocida": True})
    data = client.get("/api/v1/funciones").json()
    assert data["cmp"] is False
    assert "desconocida" not in data
