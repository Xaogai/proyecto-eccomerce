"""Suite integral de pruebas unitarias, funcionales, de integración, concurrencia y seguridad (RQ y HU)."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
from pathlib import Path

from backend.tests.conftest import InProcessASGIClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

from backend.shared.database import Base
from backend.shared.migrations import downgrade_database, upgrade_database

from backend.services.inventory.app.inventory_repository import (
    InsufficientStockError,
    InventoryRepository,
)
from backend.services.payments.app.gateway_factory import (
    PaymentGatewayFactory,
    circuit_breaker,
    compute_webhook_signature,
)
from backend.shared.models import (
    BitacoraAuditoria,
    IntentoLoginFallido,
    Inventario,
    ItemCarrito,
    ItemPedido,
    Pago,
    Pedido,
    ReservaInventario,
    Sucursal,
    TokenRevocado,
    Usuario,
)


def _login_token(client: InProcessASGIClient, email: str, password: str = "Sintetico2026!") -> str:
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return str(resp.json()["access_token"])


def test_schema_16_tables_and_2fn_compliance(db_session: Session) -> None:
    """Verifica AE-14, Anexo 2 y Anexo 3: existencia exacta de las 16 tablas en 2FN."""
    inspector = inspect(db_session.get_bind())
    tables = set(inspector.get_table_names())
    expected_16_tables = {
        "usuarios",
        "clientes",
        "administradores",
        "staff_sucursal",
        "direcciones",
        "sucursales",
        "categorias",
        "productos",
        "variantes",
        "inventario",
        "carritos",
        "item_carrito",
        "pedidos",
        "item_pedido",
        "pagos",
        "envios",
    }
    assert expected_16_tables.issubset(tables)

    # Anexo 2.2.2: item_carrito no debe tener precio_unitario (corrección 2FN)
    item_carrito_cols = {c.name for c in ItemCarrito.__table__.columns}
    assert item_carrito_cols == {"carrito_id", "variante_sku", "cantidad"}
    assert "precio_unitario" not in item_carrito_cols

    # RQ-SEG-002: pagos no almacena números de tarjeta ni CVV
    pagos_cols = {c.name for c in Pago.__table__.columns}
    assert not any(col in pagos_cols for col in ("card_number", "cvv", "pan"))


def test_rq_seg_001_password_hashed_and_auth_lifecycle(client: InProcessASGIClient, db_session: Session) -> None:
    """Verifica RQ-SEG-001 (hash de contraseña), HU-03 (registro), rotación de refresh token y logout (AE-22)."""
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={
            "nombre": "Nuevo Cliente Prueba",
            "email": "nuevo.cliente@ferremarket.local",
            "password": "PasswordSegura123!",
            "tipo_usuario": "cliente",
            "acepta_aviso_privacidad": True,
        },
    )
    assert reg_resp.status_code == 201
    user_db = db_session.query(Usuario).filter(Usuario.email == "nuevo.cliente@ferremarket.local").first()
    assert user_db is not None
    assert user_db.password_hash != "PasswordSegura123!"
    assert user_db.password_hash.startswith("$2") or user_db.password_hash.startswith("$argon2")

    # Login y obtención de access + refresh token
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "nuevo.cliente@ferremarket.local", "password": "PasswordSegura123!"},
    )
    assert login_resp.status_code == 200
    tokens = login_resp.json()
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

    # Rotación de refresh token (Sec. 18.1)
    refresh_resp = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_resp.status_code == 200
    new_tokens = refresh_resp.json()
    # El refresh token anterior debe quedar invalidado tras la rotación
    reuse_resp = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert reuse_resp.status_code == 401

    # Logout revoca el access token activo
    logout_resp = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert logout_resp.status_code == 200
    me_after_logout = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert me_after_logout.status_code == 401

    # El nuevo access token obtenido en el refresh sigue siendo válido
    me_valid = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {new_tokens['access_token']}"},
    )
    assert me_valid.status_code == 200


def test_brute_force_account_lockout(client: InProcessASGIClient) -> None:
    """Verifica el bloqueo temporal tras 5 intentos fallidos de inicio de sesión (Sec. 18.1, AE-22)."""
    target_email = "ana.torres.sintetica@ferremarket.local"
    for _ in range(5):
        r = client.post("/api/v1/auth/login", json={"email": target_email, "password": "WrongPassword999"})
        assert r.status_code == 401

    locked_resp = client.post("/api/v1/auth/login", json={"email": target_email, "password": "Sintetico2026!"})
    assert locked_resp.status_code == 429


def test_lfpdppp_privacy_notice_and_arco_rights(client: InProcessASGIClient) -> None:
    """Verifica cumplimiento de LFPDPPP: Aviso de privacidad y flujo completo de derechos ARCO (AE-45)."""
    notice = client.get("/api/v1/privacy-notice")
    assert notice.status_code == 200
    assert "LFPDPPP" in notice.json()["normativa"]

    client.post(
        "/api/v1/auth/register",
        json={
            "nombre": "Usuario ARCO",
            "email": "arco@ferremarket.local",
            "password": "PasswordARCO123!",
        },
    )
    token = _login_token(client, "arco@ferremarket.local", "PasswordARCO123!")
    headers = {"Authorization": f"Bearer {token}"}

    # Agregar dirección y ejercer Derecho de Acceso
    addr_resp = client.post(
        "/api/v1/users/me/addresses",
        headers=headers,
        json={"calle": "Calle Hidalgo 45", "ciudad": "Metepec", "codigo_postal": "52140", "es_predeterminada": True},
    )
    assert addr_resp.status_code == 201

    arco_get = client.get("/api/v1/users/me/arco", headers=headers)
    assert arco_get.status_code == 200
    assert arco_get.json()["titular"]["nombre"] == "Usuario ARCO"
    assert len(arco_get.json()["direcciones"]) == 1

    # Derecho de Rectificación
    rect_resp = client.put("/api/v1/users/me", headers=headers, json={"nombre": "Usuario ARCO Rectificado"})
    assert rect_resp.status_code == 200
    assert rect_resp.json()["nombre"] == "Usuario ARCO Rectificado"

    # Derecho de Cancelación / Oposición
    canc_resp = client.delete("/api/v1/users/me", headers=headers)
    assert canc_resp.status_code == 200


def test_catalog_hierarchy_variants_and_filters(client: InProcessASGIClient) -> None:
    """Verifica HU-01 (categorías 3 niveles), HU-02 (variantes por SKU), HU-08 (alta admin) y HU-09 (filtros)."""
    cats_resp = client.get("/api/v1/categories")
    assert cats_resp.status_code == 200
    roots = cats_resp.json()
    assert len(roots) >= 1
    assert len(roots[0]["subcategorias"]) >= 1
    assert len(roots[0]["subcategorias"][0]["subcategorias"]) >= 1

    # Detalle de producto por SKU (Sec. 13.1, HU-02)
    prod_resp = client.get("/api/v1/products/TAL-20V-ROJ")
    assert prod_resp.status_code == 200
    prod_data = prod_resp.json()
    assert prod_data["nombre"] == "Taladro Inalámbrico Percutor 20V"
    assert len(prod_data["variantes"]) == 2

    # Listado con filtros combinados (HU-09)
    filter_resp = client.get(
        "/api/v1/products",
        params={"marca": "Milwaukee", "atributo_clave": "color", "atributo_valor": "rojo", "page": 1},
    )
    assert filter_resp.status_code == 200
    assert filter_resp.json()["total"] == 1

    # Alta de producto por administrador (HU-08, Sec. 19 Completitud)
    admin_token = _login_token(client, "admin.sintetico@ferremarket.local")
    leaf_cat_id = roots[0]["subcategorias"][0]["subcategorias"][0]["id"]
    create_prod_resp = client.post(
        "/api/v1/products",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "categoria_id": leaf_cat_id,
            "nombre": "Rotomartillo SDS Plus 800W",
            "descripcion": "Rotomartillo industrial para concreto",
            "marca": "Bosch",
            "variantes": [
                {
                    "sku": "ROT-BOS-800W",
                    "atributos": {"potencia": "800W", "color": "azul"},
                    "precio": "3150.00",
                    "stock_inicial": 12,
                }
            ],
        },
    )
    assert create_prod_resp.status_code == 201
    assert create_prod_resp.json()["variantes"][0]["stock_disponible"] == 12


def test_rq_disp_001_inventory_concurrency_and_expiration(db_session: Session) -> None:
    """Verifica RQ-DISP-001 (prevención de sobreventa bajo concurrencia) y HU-05 (expiración a los 15 min)."""
    branch = db_session.query(Sucursal).filter(Sucursal.nombre == "Sucursal Metepec").first()
    assert branch is not None
    branch_id = branch.id
    # En Metepec hay 10 unidades disponibles de TAL-20V-ROJ.
    # Lanzamos 15 reservas concurrentes de 1 unidad cada una: exactamente 10 deben aprobarse y 5 fallar.
    inv_repo = InventoryRepository(db_session)

    def _try_reserve(_idx: int) -> bool:
        try:
            inv_repo.reserve_stock(sku="TAL-20V-ROJ", branch_id=branch_id, quantity=1)
            return True
        except InsufficientStockError:
            return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        outcomes = list(pool.map(_try_reserve, range(15)))

    assert outcomes.count(True) == 10
    assert outcomes.count(False) == 5

    inv_row = (
        db_session.query(Inventario)
        .filter(Inventario.sucursal_id == branch.id, Inventario.variante_sku == "TAL-20V-ROJ")
        .first()
    )
    assert inv_row is not None
    assert inv_row.cantidad_disponible == 0
    assert inv_row.cantidad_reservada == 10

    # Simulamos el paso de 16 minutos para verificar la expiración automática (HU-05)
    past_time = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.query(ReservaInventario).filter(ReservaInventario.estado == "active").update(
        {ReservaInventario.expira_en: past_time}
    )
    db_session.commit()

    expired_count = inv_repo.expire_stale_reservations()
    assert expired_count == 10
    db_session.refresh(inv_row)
    assert inv_row.cantidad_disponible == 10
    assert inv_row.cantidad_reservada == 0


def test_rq_func_001_full_purchase_flow_and_webhook_idempotency(
    client: InProcessASGIClient,
    db_session: Session,
) -> None:
    """
    Verifica RQ-FUNC-001 (flujo completo búsqueda -> carrito -> cotización envío -> checkout -> webhook),
    AE-29 (webhook duplicado idempotente) y AE-31 (protección IDOR en pedidos).
    """
    # 1. Carrito como invitado (HU-04)
    add_cart = client.post(
        "/api/v1/cart/items",
        json={"variante_sku": "TAL-20V-ROJ", "cantidad": 2},
    )
    assert add_cart.status_code == 201
    cart_data = add_cart.json()
    cart_id = cart_data["id"]
    assert Decimal(cart_data["total"]) == Decimal("4998.00")

    # 2. Cotización de envío por código postal (Sec. 13.1, HU-07)
    quote_resp = client.get("/api/v1/shipping/quote", params={"zip": "50000", "sku": "TAL-20V-ROJ"})
    assert quote_resp.status_code == 200
    quote_data = quote_resp.json()
    assert Decimal(quote_data["costo_domicilio"]) == Decimal("99.00")
    branch_id = quote_data["sucursales_disponibles"][0]["sucursal_id"]

    # 3. Rechazo de datos crudos de tarjeta en checkout (RQ-SEG-002 / PCI-DSS)
    ana_token = _login_token(client, "ana.torres.sintetica@ferremarket.local")
    headers = {"Authorization": f"Bearer {ana_token}"}
    pci_violation = client.post(
        "/api/v1/checkout",
        headers=headers,
        json={
            "carrito_id": cart_id,
            "sucursal_id": branch_id,
            "card_number": "4111111111111111",
            "cvv": "123",
        },
    )
    assert pci_violation.status_code == 422

    # 4. Checkout válido con tokenización (Sec. 13.1, HU-06)
    checkout_resp = client.post(
        "/api/v1/checkout",
        headers=headers,
        json={
            "carrito_id": cart_id,
            "sucursal_id": branch_id,
            "tipo_envio": "recoleccion_tienda",
            "payment_provider": "stripe",
            "payment_token": "tok_visa_sandbox",
        },
    )
    assert checkout_resp.status_code == 201
    order_data = checkout_resp.json()
    order_id = order_data["id"]
    ref_pasarela = order_data["referencia_pasarela"]
    assert order_data["estado"] == "pendiente_pago"
    assert Decimal(order_data["total"]) == Decimal("4998.00")

    # 5. Confirmación vía Webhook firmado e idempotencia ante duplicados (Sec. 13.1, AE-29)
    webhook_payload = {
        "event_id": "evt_stripe_unique_001",
        "referencia_pasarela": ref_pasarela,
        "status": "aprobado",
    }
    raw_bytes = json.dumps(webhook_payload).encode("utf-8")
    sig = compute_webhook_signature(raw_bytes)

    wh_resp_1 = client.post(
        "/api/v1/webhooks/payment",
        content=raw_bytes,
        headers={"Content-Type": "application/json", "X-Webhook-Signature": sig},
    )
    assert wh_resp_1.status_code == 200
    assert wh_resp_1.json()["order_status"] == "confirmado"
    assert wh_resp_1.json()["idempotent_replay"] is False

    # Segundo envío del mismo webhook (duplicado): no debe duplicar ni fallar (AE-29)
    wh_resp_2 = client.post(
        "/api/v1/webhooks/payment",
        content=raw_bytes,
        headers={"Content-Type": "application/json", "X-Webhook-Signature": sig},
    )
    assert wh_resp_2.status_code == 200
    assert wh_resp_2.json()["idempotent_replay"] is True

    # 6. Prueba de seguridad IDOR: otro usuario intenta consultar el pedido de Ana (AE-31)
    client.post(
        "/api/v1/auth/register",
        json={
            "nombre": "Intruso Prueba",
            "email": "intruso@ferremarket.local",
            "password": "PasswordIntruso123!",
        },
    )
    intruso_token = _login_token(client, "intruso@ferremarket.local", "PasswordIntruso123!")
    idor_resp = client.get(
        f"/api/v1/orders/{order_id}",
        headers={"Authorization": f"Bearer {intruso_token}"},
    )
    assert idor_resp.status_code == 403


def test_payment_gateway_factory_and_resilience(client: InProcessASGIClient) -> None:
    """Verifica PaymentGatewayFactory (Stripe y Mercado Pago), rechazo de pago y liberación de stock (Anexo 1.8)."""
    gw_stripe = PaymentGatewayFactory.create("stripe")
    gw_mp = PaymentGatewayFactory.create("mercado_pago")
    assert gw_stripe.provider_name == "stripe"
    assert gw_mp.provider_name == "mercado_pago"

    ana_token = _login_token(client, "ana.torres.sintetica@ferremarket.local")
    headers = {"Authorization": f"Bearer {ana_token}"}

    # Crear carrito y simular pago rechazado con Mercado Pago
    cart_resp = client.post("/api/v1/cart/items", json={"variante_sku": "TAL-20V-AMA", "cantidad": 1})
    cart_id = cart_resp.json()["id"]
    branches = client.get("/api/v1/branches").json()
    toluca_id = branches[0]["id"]

    declined_checkout = client.post(
        "/api/v1/checkout",
        headers=headers,
        json={
            "carrito_id": cart_id,
            "sucursal_id": toluca_id,
            "payment_provider": "mercado_pago",
            "payment_token": "tok_decline",
        },
    )
    assert declined_checkout.status_code == 201
    assert declined_checkout.json()["estado"] == "pago_rechazado"

    # El stock en Toluca de TAL-20V-AMA (15 iniciales) debe haberse liberado inmediatamente tras el rechazo
    inv_check = client.get("/api/v1/inventory/TAL-20V-AMA").json()
    assert inv_check[0]["cantidad_disponible"] == 15
    assert inv_check[0]["cantidad_reservada"] == 0
    circuit_breaker.reset()


def test_rq_dat_001_reconciliation_30_orders_sample(client: InProcessASGIClient, db_session: Session) -> None:
    """
    Verifica RQ-DAT-001 y el muestreo de auditoría (Sec. 5.3 / AE-25):
    30 pedidos con recálculo independiente de `total == sum(subtotales)` y precio congelado en `item_pedido`.
    """
    ana = db_session.query(Usuario).filter(Usuario.email == "ana.torres.sintetica@ferremarket.local").first()
    assert ana is not None

    for idx in range(30):
        qty = (idx % 4) + 1
        unit_price = Decimal("2499.00")
        subtotal = (unit_price * Decimal(qty)).quantize(Decimal("0.01"))
        pedido = Pedido(
            cliente_id=ana.id,
            folio=f"TSR-2026-AUDIT-{idx:03d}",
            estado="confirmado",
            total=subtotal,
        )
        db_session.add(pedido)
        db_session.flush()
        db_session.add(
            ItemPedido(
                pedido_id=pedido.id,
                variante_sku="TAL-20V-ROJ",
                cantidad=qty,
                precio_unitario_venta=unit_price,
                subtotal=subtotal,
            )
        )
    db_session.commit()

    # Aunque cambiemos después el precio vigente en catálogo, los pedidos históricos conservan su precio congelado
    admin_token = _login_token(client, "admin.sintetico@ferremarket.local")
    price_upd = client.patch(
        "/api/v1/variants/TAL-20V-ROJ/price",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"precio": "2999.00"},
    )
    assert price_upd.status_code == 200

    dq_resp = client.get(
        "/api/v1/admin/data-quality-report",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert dq_resp.status_code == 200
    report = dq_resp.json()
    assert report["rq_dat_001_orders_checked"] >= 30
    assert report["rq_dat_001_compliant"] is True
    assert report["anexo_2_2fn_compliant"] is True
    assert report["rq_seg_002_pci_dss_compliant"] is True


def test_additional_endpoints_and_coverage(client: InProcessASGIClient) -> None:
    """
    Cubre endpoints complementarios: health checks, gestión de sucursales, stock,
    eliminación en carrito, pagos directos, circuit breaker, envíos, cambio de rol y bitácora.
    """
    from backend.main import app as root_app
    from backend.services.cart.app.main import health_check as cart_health
    from backend.services.catalog.app.main import health_check as catalog_health
    from backend.services.checkout.app.main import health_check as checkout_health
    from backend.services.inventory.app.main import health_check as inventory_health
    from backend.services.payments.app.main import health_check as payments_health
    from backend.services.shipping.app.main import health_check as shipping_health
    from backend.services.users.app.main import health_check as users_health

    assert root_app is not None
    assert cart_health()["status"] == "ok"
    assert catalog_health()["status"] == "ok"
    assert checkout_health()["status"] == "ok"
    assert inventory_health()["status"] == "ok"
    assert payments_health()["status"] == "ok"
    assert shipping_health()["status"] == "ok"
    assert users_health()["status"] == "ok"
    assert client.get("/health").status_code == 200

    admin_token = _login_token(client, "admin.sintetico@ferremarket.local")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    staff_token = _login_token(client, "staff.toluca.sintetico@ferremarket.local")
    staff_headers = {"Authorization": f"Bearer {staff_token}"}
    ana_token = _login_token(client, "ana.torres.sintetica@ferremarket.local")
    ana_headers = {"Authorization": f"Bearer {ana_token}"}

    # RBAC: Cliente intenta acceder a endpoint de admin -> 403
    forbidden_resp = client.get("/api/v1/admin/audit-logs", headers=ana_headers)
    assert forbidden_resp.status_code == 403

    # Alta de categoría y sucursal por admin
    cat_resp = client.post("/api/v1/categories", headers=admin_headers, json={"nombre": "Plomería"})
    assert cat_resp.status_code == 201
    branch_resp = client.post("/api/v1/branches", headers=admin_headers, json={"nombre": "Sucursal Lerma"})
    assert branch_resp.status_code == 201
    lerma_id = branch_resp.json()["id"]

    # Ajuste de stock por staff de sucursal
    stock_resp = client.put(
        "/api/v1/inventory/stock",
        headers=staff_headers,
        json={"sucursal_id": lerma_id, "variante_sku": "TAL-20V-ROJ", "cantidad_disponible": 30},
    )
    assert stock_resp.status_code == 200
    assert stock_resp.json()["cantidad_disponible"] == 30

    # Reserva y liberación manual via API
    res_api = client.post(
        "/api/v1/inventory/reserve",
        json={"sku": "TAL-20V-ROJ", "branch_id": lerma_id, "quantity": 5, "idempotency_key": "idem-key-1"},
    )
    assert res_api.status_code == 201
    res_id = res_api.json()["reservation_id"]
    # Reintento con misma idempotency_key retorna la misma reserva
    res_api_dup = client.post(
        "/api/v1/inventory/reserve",
        json={"sku": "TAL-20V-ROJ", "branch_id": lerma_id, "quantity": 5, "idempotency_key": "idem-key-1"},
    )
    assert res_api_dup.json()["reservation_id"] == res_id

    rel_api = client.post("/api/v1/inventory/release", json={"reservation_id": res_id})
    assert rel_api.status_code == 200
    assert rel_api.json()["status"] == "released"

    exp_api = client.post("/api/v1/inventory/expire-reservations")
    assert exp_api.status_code == 200

    # Operaciones de carrito: consultar y eliminar ítem
    c_add = client.post("/api/v1/cart/items", headers=ana_headers, json={"variante_sku": "TAL-20V-ROJ", "cantidad": 1})
    cid = c_add.json()["id"]
    c_get = client.get("/api/v1/cart", params={"cart_id": cid}, headers=ana_headers)
    assert c_get.status_code == 200
    c_del = client.delete("/api/v1/cart/items/TAL-20V-ROJ", params={"cart_id": cid}, headers=ana_headers)
    assert c_del.status_code == 200
    assert len(c_del.json()["items"]) == 0

    # Consultar pedidos y envíos, y actualizar estado de envío (Anexo 1.3)
    orders_list = client.get("/api/v1/orders", headers=admin_headers).json()
    first_order_id = orders_list[0]["id"]
    ship_get = client.get(f"/api/v1/shipments/{first_order_id}")
    assert ship_get.status_code == 200
    shipment_id = ship_get.json()["id"]

    ship_upd = client.patch(
        f"/api/v1/shipments/{shipment_id}/status",
        headers=staff_headers,
        json={"estado": "entregado", "numero_guia": "FDX-999888"},
    )
    assert ship_upd.status_code == 200
    assert ship_upd.json()["estado"] == "entregado"

    # Procesar pago directo y probar timeout/circuit breaker en /api/v1/payments
    pay_ok = client.post(
        "/api/v1/payments",
        headers=ana_headers,
        json={
            "pedido_id": first_order_id,
            "monto": "100.00",
            "metodo": "tarjeta",
            "provider": "stripe",
            "payment_token": "tok_ok",
        },
    )
    assert pay_ok.status_code == 201

    for _ in range(3):
        t_resp = client.post(
            "/api/v1/payments",
            headers=ana_headers,
            json={
                "pedido_id": first_order_id,
                "monto": "100.00",
                "metodo": "tarjeta",
                "provider": "stripe",
                "payment_token": "tok_timeout",
            },
        )
        assert t_resp.status_code == 504

    # Al 4to intento, el circuit breaker debe estar abierto (503)
    cb_resp = client.post(
        "/api/v1/payments",
        headers=ana_headers,
        json={
            "pedido_id": first_order_id,
            "monto": "100.00",
            "metodo": "tarjeta",
            "provider": "stripe",
            "payment_token": "tok_ok",
        },
    )
    assert cb_resp.status_code == 503
    circuit_breaker.reset()

    # Cambio de rol y bitácora de auditoría
    ana_profile = client.get("/api/v1/users/me", headers=ana_headers).json()
    role_resp = client.patch(
        f"/api/v1/users/{ana_profile['id']}/role",
        headers=admin_headers,
        json={"tipo_usuario": "staff"},
    )
    assert role_resp.status_code == 200

    logs_resp = client.get("/api/v1/admin/audit-logs", headers=admin_headers)
    assert logs_resp.status_code == 200
    assert len(logs_resp.json()) >= 5


def test_sec_17_alembic_migrations_upgrade_downgrade_reversible(tmp_path: Path) -> None:
    """Verifica Sec. 17: las migraciones 0001 + 0002 crean las 21 tablas y son reversibles (downgrade a base)."""
    mig_engine = create_engine(f"sqlite:///{tmp_path / 'migraciones.db'}")
    business_tables = {
        "usuarios", "clientes", "administradores", "staff_sucursal", "direcciones", "sucursales",
        "categorias", "productos", "variantes", "inventario", "carritos", "item_carrito",
        "pedidos", "item_pedido", "pagos", "envios",
    }
    operational_tables = {
        "bitacora_auditoria", "tokens_revocados", "intentos_login_fallidos",
        "reservas_inventario", "eventos_webhook",
    }
    try:
        upgrade_database(mig_engine)
        tables = set(inspect(mig_engine).get_table_names())
        assert business_tables | operational_tables <= tables
        assert "alembic_version" in tables

        downgrade_database(mig_engine, "0001_initial_schema_2fn")
        tables = set(inspect(mig_engine).get_table_names())
        assert business_tables <= tables
        assert not (operational_tables & tables)

        downgrade_database(mig_engine, "base")
        assert not ((business_tables | operational_tables) & set(inspect(mig_engine).get_table_names()))

        upgrade_database(mig_engine)
        assert business_tables | operational_tables <= set(inspect(mig_engine).get_table_names())
    finally:
        mig_engine.dispose()


def test_upgrade_database_stamps_legacy_create_all_schema(tmp_path: Path) -> None:
    """Una base creada antes con `create_all` (sin `alembic_version`) se estampa en lugar de recrearse."""
    legacy_engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    try:
        Base.metadata.create_all(bind=legacy_engine)
        upgrade_database(legacy_engine)
        with legacy_engine.connect() as conn:
            version = conn.exec_driver_sql("SELECT version_num FROM alembic_version").scalar_one()
        assert version == "0003_tienda_en_linea"
    finally:
        legacy_engine.dispose()


def test_operational_state_persists_in_database(client: InProcessASGIClient, db_session: Session) -> None:
    """Revocación de tokens, bloqueos de login y bitácora quedan en tablas, no en memoria del proceso."""
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "ana.torres.sintetica@ferremarket.local", "password": "Sintetico2026!"},
    )
    assert login.status_code == 200
    access = login.json()["access_token"]
    logout = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {access}"})
    assert logout.status_code == 200
    assert db_session.query(TokenRevocado).count() >= 1
    me_after = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {access}"})
    assert me_after.status_code == 401

    client.post("/api/v1/auth/login", json={"email": "ana.torres.sintetica@ferremarket.local", "password": "mal"})
    assert db_session.query(IntentoLoginFallido).count() >= 1
    assert db_session.query(BitacoraAuditoria).filter(BitacoraAuditoria.tipo_evento == "login_failed").count() >= 1


def test_phase_2_notifications_password_reset_and_signed_webhooks(client: InProcessASGIClient) -> None:
    """Verifica HU-03 y HU-10: recuperación de contraseña de un solo uso, notificaciones de pedido y envío."""
    # 1. Recuperación de contraseña (HU-03)
    req_resp = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "ana.torres.sintetica@ferremarket.local"},
    )
    assert req_resp.status_code == 200
    reset_token = req_resp.json()["sandbox_reset_token"]
    assert reset_token

    confirm_resp = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"reset_token": reset_token, "new_password": "NuevaPassword2026!"},
    )
    assert confirm_resp.status_code == 200

    # El token es de un solo uso; reutilizarlo debe rechazarse (401)
    replay_resp = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"reset_token": reset_token, "new_password": "OtraPassword2026!"},
    )
    assert replay_resp.status_code == 401

    # Login con la nueva contraseña y restauración de la contraseña sintética original
    login_new = client.post(
        "/api/v1/auth/login",
        json={"email": "ana.torres.sintetica@ferremarket.local", "password": "NuevaPassword2026!"},
    )
    assert login_new.status_code == 200
    ana_token = login_new.json()["access_token"]
    ana_headers = {"Authorization": f"Bearer {ana_token}"}

    # 2. Compra completa con firma HMAC-SHA256 desde `/api/v1/payments/webhook-sign` y notificación HU-10
    branches = client.get("/api/v1/branches").json()
    cart_resp = client.post(
        "/api/v1/cart/items",
        headers=ana_headers,
        json={"carrito_id": None, "variante_sku": "TAL-20V-ROJ", "cantidad": 1},
    )
    assert cart_resp.status_code == 201
    checkout_resp = client.post(
        "/api/v1/checkout",
        headers=ana_headers,
        json={
            "carrito_id": cart_resp.json()["id"],
            "sucursal_id": branches[0]["id"],
            "tipo_envio": "domicilio",
            "codigo_postal": "50000",
            "payment_provider": "stripe",
            "payment_method": "tarjeta",
            "payment_token": "tok_visa_sandbox",
        },
    )
    assert checkout_resp.status_code == 201
    order = checkout_resp.json()

    wh_payload = {
        "event_id": f"evt_notif_{order['folio']}",
        "referencia_pasarela": order["referencia_pasarela"],
        "status": "aprobado",
    }
    sign_resp = client.post("/api/v1/payments/webhook-sign", headers=ana_headers, json=wh_payload)
    assert sign_resp.status_code == 200
    wh_resp = client.post(
        "/api/v1/webhooks/payment",
        headers={"X-Webhook-Signature": sign_resp.json()["signature"]},
        json=wh_payload,
    )
    assert wh_resp.status_code == 200

    # 3. Actualización de envío por Admin y verificación de bandeja de notificaciones HU-10
    admin_login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin.sintetico@ferremarket.local", "password": "Sintetico2026!"},
    )
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}
    shipments_resp = client.get("/api/v1/shipments", headers=admin_headers)
    assert shipments_resp.status_code == 200
    shipment = next(s for s in shipments_resp.json() if s["pedido_id"] == order["id"])

    patch_ship = client.patch(
        f"/api/v1/shipments/{shipment['id']}/status",
        headers=admin_headers,
        json={"estado": "enviado", "numero_guia": "GUIA-DHL-777"},
    )
    assert patch_ship.status_code == 200

    notifs_resp = client.get("/api/v1/users/me/notifications", headers=ana_headers)
    assert notifs_resp.status_code == 200
    templates = {n["template_type"] for n in notifs_resp.json()}
    assert {"password_reset", "order_confirmation", "shipment_status"} <= templates

    # 4. Actualización de cantidad en carrito (+/-) y cancelación de pedido (HU-04, HU-06)
    cart_resp2 = client.post(
        "/api/v1/cart/items",
        headers=ana_headers,
        json={"carrito_id": None, "variante_sku": "TAL-20V-ROJ", "cantidad": 1},
    )
    assert cart_resp2.status_code == 201
    cart2_id = cart_resp2.json()["id"]

    patch_qty = client.patch(
        f"/api/v1/cart/items/TAL-20V-ROJ?cart_id={cart2_id}",
        headers=ana_headers,
        json={"carrito_id": cart2_id, "cantidad": 3},
    )
    assert patch_qty.status_code == 200
    assert patch_qty.json()["items"][0]["cantidad"] == 3

    checkout2 = client.post(
        "/api/v1/checkout",
        headers=ana_headers,
        json={
            "carrito_id": cart2_id,
            "sucursal_id": branches[0]["id"],
            "tipo_envio": "recoleccion_tienda",
            "codigo_postal": "50000",
            "payment_provider": "stripe",
            "payment_method": "tarjeta",
            "payment_token": "tok_visa_sandbox",
        },
    )
    assert checkout2.status_code == 201
    order2_id = checkout2.json()["id"]

    cancel_resp = client.post(f"/api/v1/orders/{order2_id}/cancel", headers=ana_headers)
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["estado"] == "cancelado"


