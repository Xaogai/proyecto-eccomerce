"""Generador de datos sintéticos para ambientes de Desarrollo, Pruebas y Staging (Regla de Gobierno Sec. 20, AE-26)."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from sqlalchemy.orm import Session

from backend.shared.catalog_seed_100 import PAINT_8_COLORS, build_100_catalog_specs
from backend.shared.models import (
    Administrador,
    BitacoraAuditoria,
    Categoria,
    Cliente,
    Direccion,
    Envio,
    Inventario,
    ItemPedido,
    Pago,
    Pedido,
    Producto,
    Resena,
    StaffSucursal,
    Sucursal,
    Usuario,
    Variante,
)
from backend.shared.security import hash_password


def _svg_data_uri(title: str, subtitle: str, bg_hex: str, accent_hex: str) -> str:
    """Genera una URL corta hacia el endpoint de ilustración vectorial del producto (<300 chars)."""
    _ = (title, subtitle, bg_hex, accent_hex)
    return "/api/v1/product-image/DEFAULT.svg"


EXTENDED_CATALOG_SPECS: list[dict[str, Any]] = [
    {
        "root": "Herramientas",
        "sub": "Herramientas Eléctricas",
        "leaf": "Esmeriladoras y Cortadoras",
        "nombre": "Esmeriladora Angular Industrial 4-1/2 Pulg 11,000 RPM",
        "descripcion": "Esmeriladora angular con motor de alto torque, guarda de ajuste rápido y arranque suave.",
        "marca": "DeWalt",
        "variantes": [
            {
                "sku": "ESM-DEW-900W",
                "atributos": {"potencia": "900W", "color": "amarillo", "disco": "4-1/2 pulg"},
                "precio": Decimal("1699.00"),
                "img": _svg_data_uri("Esmeriladora 4-1/2\"", "DeWalt 900W • 11,000 RPM", "#92400e", "#f59e0b"),
                "stock": (18, 12),
            },
            {
                "sku": "ESM-DEW-20V-MAX",
                "atributos": {"voltaje": "20V", "color": "negro", "motor": "Brushless"},
                "precio": Decimal("2899.00"),
                "img": _svg_data_uri("Esmeriladora 20V MAX", "DeWalt Brushless • Inalámbrica", "#78350f", "#fbbf24"),
                "stock": (10, 8),
            },
            {
                "sku": "ESM-DEW-1200W-GR",
                "atributos": {"potencia": "1200W", "color": "gris", "disco": "5 pulg"},
                "precio": Decimal("2199.00"),
                "img": _svg_data_uri("Esmeriladora 5\"", "DeWalt 1200W • Gris Industrial", "#374151", "#f59e0b"),
                "stock": (12, 9),
            },
        ],
    },
    {
        "root": "Herramientas",
        "sub": "Herramientas Eléctricas",
        "leaf": "Taladros y Rotomartillos",
        "nombre": "Rotomartillo Electroneumático SDS-Plus Profesional",
        "descripcion": "Triple modo de operación (rotación, rotopercusión y cincelado) con embrague de seguridad.",
        "marca": "Bosch",
        "variantes": [
            {
                "sku": "ROT-BOS-850W",
                "atributos": {"potencia": "850W", "color": "azul", "energia_impacto": "3.2 J"},
                "precio": Decimal("3299.00"),
                "img": _svg_data_uri("Rotomartillo SDS-Plus", "Bosch Heavy Duty • 850W 3.2J", "#1e3a8a", "#38bdf8"),
                "stock": (14, 9),
            },
            {
                "sku": "ROT-BOS-1100W",
                "atributos": {"potencia": "1100W", "color": "negro", "energia_impacto": "4.0 J"},
                "precio": Decimal("4199.00"),
                "img": _svg_data_uri("Rotomartillo Industrial", "Bosch 1100W • Maletín L-BOXX", "#172554", "#60a5fa"),
                "stock": (8, 6),
            },
            {
                "sku": "ROT-BOS-1500W-ROJ",
                "atributos": {"potencia": "1500W", "color": "rojo", "energia_impacto": "5.2 J"},
                "precio": Decimal("5199.00"),
                "img": _svg_data_uri("Rotomartillo Max", "Bosch 1500W • Edición Roja", "#7f1d1d", "#ef4444"),
                "stock": (7, 5),
            },
        ],
    },
    {
        "root": "Herramientas",
        "sub": "Herramientas Manuales",
        "leaf": "Juegos de Autocle y Dados",
        "nombre": "Juego de Herramienta Mecánica Cromo Vanadio",
        "descripcion": "Estuche organizador de alta resistencia con matracas de 72 dientes, dados métricos y estándar.",
        "marca": "Urrea",
        "variantes": [
            {
                "sku": "AUT-URR-120P",
                "atributos": {"piezas": "120 piezas", "color": "gris", "cuadro": "1/4 y 3/8 pulg"},
                "precio": Decimal("2150.00"),
                "img": _svg_data_uri("Autocle 120 Piezas", "Urrea Cromo Vanadio • 1/4 y 3/8\"", "#374151", "#f97316"),
                "stock": (20, 15),
            },
            {
                "sku": "AUT-URR-200P",
                "atributos": {"piezas": "200 piezas", "color": "negro", "cuadro": "1/4, 3/8 y 1/2 pulg"},
                "precio": Decimal("3490.00"),
                "img": _svg_data_uri("Autocle 200 Piezas", "Urrea Master Mecánico • 3 Cuadros", "#1f2937", "#fb923c"),
                "stock": (11, 7),
            },
            {
                "sku": "AUT-URR-250P-ROJ",
                "atributos": {"piezas": "250 piezas", "color": "rojo", "cuadro": "1/4, 3/8 y 1/2 pulg"},
                "precio": Decimal("4290.00"),
                "img": _svg_data_uri("Autocle 250 Piezas", "Urrea Edición Roja Taller", "#7f1d1d", "#ef4444"),
                "stock": (9, 6),
            },
        ],
    },
    {
        "root": "Construcción y Acabados",
        "sub": "Pinturas e Impermeabilizantes",
        "leaf": "Impermeabilizantes Acrílicos",
        "nombre": "Impermeabilizante Elastómerico Fibratado Térmico",
        "descripcion": "Barrera impermeable con microfibras sintéticas, reduce la temperatura interior hasta 6 °C.",
        "marca": "Comex",
        "variantes": [
            {
                "sku": f"IMP-CMX-{c[:3].upper().replace(' ', '')}{i + 1}",
                "atributos": {"color": c, "capacidad": "19 Litros", "garantia": "10 años"},
                "precio": Decimal("1890.00") + Decimal(i * 30),
                "img": _svg_data_uri("Impermeabilizante 19L", f"Comex Top Fibratado • {c.title()}", "#0f766e", "#2dd4bf"),
                "stock": (24, 16),
            }
            for i, c in enumerate(PAINT_8_COLORS)
        ],
    },
    {
        "root": "Construcción y Acabados",
        "sub": "Plomería y Hidráulica",
        "leaf": "Bombas y Presurizadores",
        "nombre": "Bomba Presurizadora Automática Silenciosa",
        "descripcion": "Incrementa la presión hidráulica en calentadores solares, de paso y regaderas residenciales.",
        "marca": "Truper",
        "variantes": [
            {
                "sku": "BOM-TRU-1-6HP",
                "atributos": {"potencia": "1/6 HP", "color": "naranja", "servicios": "2 baños"},
                "precio": Decimal("1290.00"),
                "img": _svg_data_uri("Presurizador 1/6 HP", "Truper Silencioso • Hasta 2 Baños", "#9a3412", "#fb923c"),
                "stock": (16, 12),
            },
            {
                "sku": "BOM-TRU-1-3HP",
                "atributos": {"potencia": "1/3 HP", "color": "azul", "servicios": "4 baños"},
                "precio": Decimal("1850.00"),
                "img": _svg_data_uri("Presurizador 1/3 HP", "Truper Bronce • Hasta 4 Baños", "#7c2d12", "#f97316"),
                "stock": (12, 9),
            },
            {
                "sku": "BOM-TRU-1-2HP-ROJ",
                "atributos": {"potencia": "1/2 HP", "color": "rojo", "servicios": "6 baños"},
                "precio": Decimal("2390.00"),
                "img": _svg_data_uri("Presurizador 1/2 HP", "Truper Alta Presión • 6 Baños", "#7f1d1d", "#ef4444"),
                "stock": (10, 7),
            },
        ],
    },
    {
        "root": "Eléctrico y Seguridad",
        "sub": "Medición y Diagnóstico",
        "leaf": "Multímetros y Pinzas",
        "nombre": "Multímetro Digital True-RMS Industrial CAT IV",
        "descripcion": "Medición de verdadero valor eficaz de voltaje CA/CD, corriente, capacitancia y temperatura.",
        "marca": "Fluke",
        "variantes": [
            {
                "sku": "MUL-FLU-117",
                "atributos": {"modelo": "117 Electricista", "color": "amarillo", "seguridad": "CAT III 600V"},
                "precio": Decimal("4650.00"),
                "img": _svg_data_uri("Multímetro Fluke 117", "True-RMS • Detección VoltAlert", "#854d0e", "#facc15"),
                "stock": (9, 6),
            },
            {
                "sku": "MUL-FLU-87V",
                "atributos": {"modelo": "87V Industrial", "color": "naranja", "seguridad": "CAT IV 600V"},
                "precio": Decimal("8490.00"),
                "img": _svg_data_uri("Multímetro Fluke 87V", "Industrial True-RMS • Termopar", "#713f12", "#eab308"),
                "stock": (5, 4),
            },
            {
                "sku": "MUL-FLU-289-ROJ",
                "atributos": {"modelo": "289 DataLogger", "color": "rojo", "seguridad": "CAT IV 1000V"},
                "precio": Decimal("11490.00"),
                "img": _svg_data_uri("Multímetro Fluke 289", "True-RMS DataLogger Gráfico", "#7f1d1d", "#ef4444"),
                "stock": (4, 3),
            },
        ],
    },
]


def _get_or_create_category_chain(db: Session, root_name: str, sub_name: str, leaf_name: str) -> Categoria:
    """Obtiene o crea una cadena de categorías de 3 niveles (HU-01)."""
    root = db.query(Categoria).filter(Categoria.nombre == root_name, Categoria.categoria_padre_id.is_(None)).first()
    if not root:
        root = Categoria(nombre=root_name, categoria_padre_id=None)
        db.add(root)
        db.flush()
    sub = db.query(Categoria).filter(Categoria.nombre == sub_name, Categoria.categoria_padre_id == root.id).first()
    if not sub:
        sub = Categoria(nombre=sub_name, categoria_padre_id=root.id)
        db.add(sub)
        db.flush()
    leaf = db.query(Categoria).filter(Categoria.nombre == leaf_name, Categoria.categoria_padre_id == sub.id).first()
    if not leaf:
        leaf = Categoria(nombre=leaf_name, categoria_padre_id=sub.id)
        db.add(leaf)
        db.flush()
    return leaf


def _upsert_spec_variants(
    db: Session,
    prod: Producto,
    variantes_spec: list[dict[str, Any]],
    existing_skus: set[str],
    suc_toluca: Sucursal,
    suc_metepec: Sucursal,
) -> None:
    """Agrega las variantes e inventario faltantes de un producto sin duplicar SKUs."""
    for v_spec in variantes_spec:
        sku_code = v_spec["sku"]
        if sku_code in existing_skus:
            continue
        existing_skus.add(sku_code)
        db.add(
            Variante(
                sku=sku_code,
                producto_id=prod.id,
                atributos=v_spec["atributos"],
                precio=v_spec["precio"],
                imagen_url=f"http://localhost:8000/api/v1/product-image/{sku_code}.svg",
            )
        )
        db.flush()
        st_tol, st_met = v_spec["stock"]
        db.add_all(
            [
                Inventario(
                    sucursal_id=suc_toluca.id,
                    variante_sku=sku_code,
                    cantidad_disponible=st_tol,
                    cantidad_reservada=0,
                ),
                Inventario(
                    sucursal_id=suc_metepec.id,
                    variante_sku=sku_code,
                    cantidad_disponible=st_met,
                    cantidad_reservada=0,
                ),
            ]
        )


def _ensure_extended_catalog(db: Session, suc_toluca: Sucursal, suc_metepec: Sucursal) -> None:
    """Garantiza que el catálogo comercial extendido (107 artículos y ~415 variantes) esté presente."""
    for base_sku in ("TAL-20V-ROJ", "TAL-20V-AMA"):
        v_base = db.query(Variante).filter(Variante.sku == base_sku).first()
        if v_base:
            v_base.imagen_url = f"/api/v1/product-image/{base_sku}.svg"

    existing_skus = {row[0] for row in db.query(Variante.sku).all()}
    existing_prods = {p.nombre: p for p in db.query(Producto).all()}
    cat_cache: dict[tuple[str, str, str], Categoria] = {}

    all_specs = EXTENDED_CATALOG_SPECS + build_100_catalog_specs()
    for spec in all_specs:
        prod = existing_prods.get(spec["nombre"])
        if prod is None:
            cat_key = (spec["root"], spec["sub"], spec["leaf"])
            leaf = cat_cache.get(cat_key)
            if leaf is None:
                leaf = _get_or_create_category_chain(db, spec["root"], spec["sub"], spec["leaf"])
                cat_cache[cat_key] = leaf
            prod = Producto(
                categoria_id=leaf.id,
                nombre=spec["nombre"],
                descripcion=spec["descripcion"],
                marca=spec["marca"],
            )
            db.add(prod)
            db.flush()
            existing_prods[prod.nombre] = prod
        _upsert_spec_variants(db, prod, spec["variantes"], existing_skus, suc_toluca, suc_metepec)
    db.commit()


def _ensure_audit_samples(db: Session, client_user: Usuario, admin_user: Usuario, staff_user: Usuario) -> None:
    """
    Garantiza de forma idempotente las muestras exigidas por el Plan de Auditoría PA-ECOM-001 (Sec. 5.3):
    - 30 pedidos confirmados con `item_pedido` (precio congelado histórico), `pagos` (sin PAN/CVV) y `envios` (AE-25).
    - 25 registros de bitácora por cada operación sensible (`payment`, `price_change`, `stock_change`, `role_change`,
      más `login_failed`) en `bitacora_auditoria` (AE-39 y Parte B).
    """
    sample_skus = [
        ("TAL-20V-ROJ", Decimal("2499.00")),
        ("TAL-20V-AMA", Decimal("2799.00")),
        ("ESM-DEW-900W", Decimal("1699.00")),
        ("ROT-BOS-850W", Decimal("3299.00")),
        ("AUT-URR-120P", Decimal("2150.00")),
        ("IMP-CMX-BL-5A", Decimal("1580.00")),
    ]
    available_skus = [
        (sku, price)
        for sku, price in sample_skus
        if db.query(Variante).filter(Variante.sku == sku).first() is not None
    ] or [("TAL-20V-ROJ", Decimal("2499.00"))]

    for idx in range(2, 31):
        folio = f"TSR-2026-SINT-{idx:03d}"
        if db.query(Pedido).filter(Pedido.folio == folio).first() is not None:
            continue
        sku_code, frozen_price = available_skus[idx % len(available_skus)]
        qty = (idx % 3) + 1
        subtotal = (frozen_price * Decimal(qty)).quantize(Decimal("0.01"))
        pedido = Pedido(
            cliente_id=client_user.id,
            folio=folio,
            estado="confirmado",
            total=subtotal,
        )
        db.add(pedido)
        db.flush()
        db.add(
            ItemPedido(
                pedido_id=pedido.id,
                variante_sku=sku_code,
                cantidad=qty,
                precio_unitario_venta=frozen_price,
                subtotal=subtotal,
            )
        )
        db.add(
            Pago(
                pedido_id=pedido.id,
                monto=subtotal,
                metodo="tarjeta",
                estado="aprobado",
                referencia_pasarela=f"pi_stripe_sintetico_{idx:03d}",
            )
        )
        db.add(
            Envio(
                pedido_id=pedido.id,
                tipo="domicilio" if idx % 2 == 0 else "recoleccion_tienda",
                costo=Decimal("99.00") if idx % 2 == 0 else Decimal("0.00"),
                numero_guia=f"GUIA-SINT-{idx:03d}",
                estado="entregado" if idx % 3 == 0 else "enviado",
                sucursal_recoleccion_id=None,
            )
        )

    sensitive_ops = [
        ("payment", str(client_user.id), "payment:TSR-2026-SINT"),
        ("price_change", str(admin_user.id), "variant:TAL-20V-ROJ"),
        ("stock_change", str(staff_user.id), "inventory:toluca:TAL-20V-ROJ"),
        ("role_change", str(admin_user.id), f"user:{staff_user.id}"),
        ("login_failed", None, "user:ana.torres.sintetica@ferremarket.local"),
    ]
    base_ts = datetime.now(timezone.utc) - timedelta(days=5)
    for op_type, actor, res_prefix in sensitive_ops:
        existing_count = db.query(BitacoraAuditoria).filter(BitacoraAuditoria.tipo_evento == op_type).count()
        for seq in range(existing_count + 1, 26):
            db.add(
                BitacoraAuditoria(
                    fecha=base_ts + timedelta(minutes=seq * 15),
                    tipo_evento=op_type,
                    actor_id=actor,
                    recurso=f"{res_prefix}:{seq:02d}",
                    detalles={"sample_seq": seq, "operation": op_type, "synthetic_seed": True},
                )
            )
    db.commit()


STORE_DETAILS: dict[str, dict[str, Any]] = {
    "Sucursal Toluca Centro": {
        "calle": "Av. Benito Juárez 210, Col. Centro",
        "ciudad": "Toluca",
        "codigo_postal": "50000",
        "telefono": "722 214 5500",
        "horario": "Lun a sáb 7:00 a 22:00, dom 8:00 a 20:00",
        "latitud": Decimal("19.292545"),
        "longitud": Decimal("-99.653912"),
        "servicios": ["Recoger en tienda", "Corte de madera", "Igualación de pintura", "Renta de herramienta"],
    },
    "Sucursal Metepec": {
        "calle": "Av. Tecnológico 1600, Col. San Salvador Tizatlalli",
        "ciudad": "Metepec",
        "codigo_postal": "52172",
        "telefono": "722 271 8800",
        "horario": "Lun a dom 7:00 a 22:00",
        "latitud": Decimal("19.256412"),
        "longitud": Decimal("-99.606437"),
        "servicios": ["Recoger en tienda", "Corte de madera", "Llaves y duplicados"],
    },
}

SYNTHETIC_REVIEWS: list[dict[str, Any]] = [
    {"sku": "TAL-20V-ROJ", "autor": "Ana T.", "calificacion": 5, "titulo": "Potente y ligero",
     "comentario": "Lo uso para muebles y perforar concreto ligero; la batería dura toda la tarde.", "verificada": True},
    {"sku": "TAL-20V-ROJ", "autor": "Luis M.", "calificacion": 4, "titulo": "Buen taladro",
     "comentario": "Cumple bien, solo me hubiera gustado que trajera un segundo cargador.", "verificada": False},
    {"sku": "ROT-BOS-850W", "autor": "Carmen R.", "calificacion": 5, "titulo": "Perfecto para concreto",
     "comentario": "El modo de cincelado me ahorró rentar un rotomartillo más grande.", "verificada": False},
]


def _company_owner(db: Session) -> Usuario | None:
    """Cuenta de la empresa (admin): dueña de las direcciones de las sucursales."""
    return db.query(Usuario).filter(Usuario.email == "admin.sintetico@ferremarket.local").first()


def _ensure_store_details(db: Session) -> None:
    """Dirección propia, teléfono, horario, ubicación y servicios de cada sucursal (idempotente)."""
    owner = _company_owner(db)
    for nombre, info in STORE_DETAILS.items():
        branch = db.query(Sucursal).filter(Sucursal.nombre == nombre).first()
        if branch is None:
            continue
        if owner is not None and (branch.direccion is None or branch.direccion.cliente_id != owner.id):
            direccion = Direccion(
                cliente_id=owner.id,
                alias=nombre,
                calle=info["calle"],
                ciudad=info["ciudad"],
                codigo_postal=info["codigo_postal"],
                entidad="Estado de México",
                es_predeterminada=False,
            )
            db.add(direccion)
            db.flush()
            branch.direccion_id = direccion.id
        branch.telefono = info["telefono"]
        branch.horario = info["horario"]
        branch.latitud = info["latitud"]
        branch.longitud = info["longitud"]
        branch.servicios = info["servicios"]
    db.commit()


def _ensure_product_details(db: Session) -> None:
    """Especificaciones, imágenes con ruta relativa, pasillo y reseñas de muestra (idempotente)."""
    for product in db.query(Producto).all():
        if not product.especificaciones and product.variantes:
            common = dict(product.variantes[0].atributos or {})
            for var in product.variantes[1:]:
                common = {k: v for k, v in common.items() if (var.atributos or {}).get(k) == v}
            specs = {"Marca": product.marca} if product.marca else {}
            specs.update({k.replace("_", " ").capitalize(): str(v) for k, v in common.items()})
            product.especificaciones = specs
        for var in product.variantes:
            if var.imagen_url and var.imagen_url.startswith("http://localhost:8000"):
                var.imagen_url = var.imagen_url.removeprefix("http://localhost:8000")
    for index, inv in enumerate(db.query(Inventario).order_by(Inventario.variante_sku).all()):
        if inv.pasillo is None:
            inv.pasillo = f"{12 + index % 9}-{chr(65 + index % 4)}"
    db.commit()
    _ensure_reviews(db)
    _ensure_customer_details(db)


def _ensure_customer_details(db: Session) -> None:
    """Completa la dirección de muestra de Ana con colonia, número, estado y teléfono (idempotente)."""
    ana = db.query(Usuario).filter(Usuario.email == "ana.torres.sintetica@ferremarket.local").first()
    if ana is None:
        return
    for direccion in db.query(Direccion).filter(Direccion.cliente_id == ana.id, Direccion.colonia.is_(None)):
        direccion.alias = "Casa"
        direccion.nombre_recibe = "Ana Torres"
        direccion.calle = "Av. Independencia"
        direccion.numero_exterior = "100"
        direccion.colonia = "Centro"
        direccion.entidad = "Estado de México"
        direccion.telefono = "7221234567"
    db.commit()


def _ensure_reviews(db: Session) -> None:
    """Reseñas de muestra si todavía no hay ninguna."""
    if db.query(Resena).count() == 0:
        ana = db.query(Usuario).filter(Usuario.email == "ana.torres.sintetica@ferremarket.local").first()
        for spec in SYNTHETIC_REVIEWS:
            variante = db.query(Variante).filter(Variante.sku == spec["sku"]).first()
            if variante is None:
                continue
            db.add(
                Resena(
                    producto_id=variante.producto_id,
                    usuario_id=ana.id if ana and spec["verificada"] else None,
                    autor=spec["autor"],
                    calificacion=spec["calificacion"],
                    titulo=spec["titulo"],
                    comentario=spec["comentario"],
                    compra_verificada=spec["verificada"],
                )
            )
    db.commit()


def seed_synthetic_data(db: Session) -> dict[str, Any]:
    """
    Puebla la base de datos con datos 100% sintéticos (4 roles, sucursales, catálogo jerárquico 3 niveles,
    variantes, inventario, 30 pedidos de muestra y 25 registros de bitácora por operación sensible)
    cumpliendo la Regla de Gobierno de Ambientes (Sec. 20, AE-25, AE-26, AE-39).
    """
    existing_branch = db.query(Sucursal).filter(Sucursal.nombre == "Sucursal Toluca Centro").first()
    existing_metepec = db.query(Sucursal).filter(Sucursal.nombre == "Sucursal Metepec").first()
    if existing_branch and existing_metepec:
        _ensure_extended_catalog(db, existing_branch, existing_metepec)
        _ensure_store_details(db)
        _ensure_product_details(db)
        c_user = db.query(Usuario).filter(Usuario.email == "ana.torres.sintetica@ferremarket.local").first()
        a_user = db.query(Usuario).filter(Usuario.email == "admin.sintetico@ferremarket.local").first()
        s_user = db.query(Usuario).filter(Usuario.email == "staff.toluca.sintetico@ferremarket.local").first()
        if c_user and a_user and s_user:
            _ensure_audit_samples(db, c_user, a_user, s_user)
        return {"status": "already_seeded", "branch_id": str(existing_branch.id)}

    pwd_hash = hash_password("Sintetico2026!")
    admin_user = Usuario(
        nombre="Brandon Admin Sintetico",
        email="admin.sintetico@ferremarket.local",
        password_hash=pwd_hash,
        tipo_usuario="admin",
    )
    client_user = Usuario(
        nombre="Ana Torres Sintetica",
        email="ana.torres.sintetica@ferremarket.local",
        password_hash=pwd_hash,
        tipo_usuario="cliente",
    )
    staff_user = Usuario(
        nombre="Carlos Staff Sintetico",
        email="staff.toluca.sintetico@ferremarket.local",
        password_hash=pwd_hash,
        tipo_usuario="staff",
    )
    db.add_all([admin_user, client_user, staff_user])
    db.flush()

    db.add(Administrador(usuario_id=admin_user.id, rol="superadmin"))
    db.add_all([Cliente(usuario_id=admin_user.id), Cliente(usuario_id=client_user.id), Cliente(usuario_id=staff_user.id)])
    db.flush()

    direccion_ana = Direccion(
        cliente_id=client_user.id,
        calle="Av. Independencia 100 Sintetica",
        ciudad="Toluca",
        codigo_postal="50000",
        es_predeterminada=True,
    )
    db.add(direccion_ana)
    db.flush()

    suc_toluca = Sucursal(nombre="Sucursal Toluca Centro", direccion_id=None)
    suc_metepec = Sucursal(nombre="Sucursal Metepec", direccion_id=None)
    db.add_all([suc_toluca, suc_metepec])
    db.flush()

    db.add(StaffSucursal(usuario_id=staff_user.id, sucursal_id=suc_toluca.id))

    cat_leaf = _get_or_create_category_chain(
        db, "Herramientas", "Herramientas Eléctricas", "Taladros y Rotomartillos"
    )

    prod_taladro = Producto(
        categoria_id=cat_leaf.id,
        nombre="Taladro Inalámbrico Percutor 20V",
        descripcion="Taladro inalámbrico profesional de 1/2 pulgada con motor sin escobillas.",
        marca="Milwaukee",
    )
    db.add(prod_taladro)
    db.flush()

    var_roja = Variante(
        sku="TAL-20V-ROJ",
        producto_id=prod_taladro.id,
        atributos={"color": "rojo", "voltaje": "20V", "amperaje": "4.0Ah"},
        precio=Decimal("2499.00"),
        imagen_url=_svg_data_uri("Taladro Percutor 20V", "Milwaukee Fuel • 4.0Ah Rojo", "#991b1b", "#ef4444"),
    )
    var_amarilla = Variante(
        sku="TAL-20V-AMA",
        producto_id=prod_taladro.id,
        atributos={"color": "amarillo", "voltaje": "20V", "amperaje": "5.0Ah"},
        precio=Decimal("2799.00"),
        imagen_url=_svg_data_uri("Taladro Percutor 20V", "Milwaukee 5.0Ah • Edición Amarilla", "#854d0e", "#facc15"),
    )
    db.add_all([var_roja, var_amarilla])
    db.flush()

    db.add_all(
        [
            Inventario(
                sucursal_id=suc_toluca.id,
                variante_sku="TAL-20V-ROJ",
                cantidad_disponible=25,
                cantidad_reservada=0,
            ),
            Inventario(
                sucursal_id=suc_toluca.id,
                variante_sku="TAL-20V-AMA",
                cantidad_disponible=15,
                cantidad_reservada=0,
            ),
            Inventario(
                sucursal_id=suc_metepec.id,
                variante_sku="TAL-20V-ROJ",
                cantidad_disponible=10,
                cantidad_reservada=0,
            ),
        ]
    )

    pedido_demo = Pedido(
        cliente_id=client_user.id,
        folio="TSR-2026-5521",
        estado="confirmado",
        total=Decimal("4998.00"),
    )
    db.add(pedido_demo)
    db.flush()

    db.add(
        ItemPedido(
            pedido_id=pedido_demo.id,
            variante_sku="TAL-20V-ROJ",
            cantidad=2,
            precio_unitario_venta=Decimal("2499.00"),
            subtotal=Decimal("4998.00"),
        )
    )
    db.add(
        Pago(
            pedido_id=pedido_demo.id,
            monto=Decimal("4998.00"),
            metodo="tarjeta",
            estado="aprobado",
            referencia_pasarela="pi_stripe_sintetico_5521",
        )
    )
    db.add(
        Envio(
            pedido_id=pedido_demo.id,
            tipo="domicilio",
            costo=Decimal("99.00"),
            numero_guia="GUIA-SINT-5521",
            estado="enviado",
            sucursal_recoleccion_id=None,
        )
    )
    db.commit()
    _ensure_extended_catalog(db, suc_toluca, suc_metepec)
    _ensure_store_details(db)
    _ensure_product_details(db)
    _ensure_audit_samples(db, client_user, admin_user, staff_user)

    return {
        "status": "seeded",
        "branch_toluca_id": str(suc_toluca.id),
        "branch_metepec_id": str(suc_metepec.id),
        "category_leaf_id": str(cat_leaf.id),
        "sample_skus": ["TAL-20V-ROJ", "TAL-20V-AMA"],
        "sample_accounts": {
            "admin": "admin.sintetico@ferremarket.local",
            "cliente": "ana.torres.sintetica@ferremarket.local",
            "staff": "staff.toluca.sintetico@ferremarket.local",
        },
    }
