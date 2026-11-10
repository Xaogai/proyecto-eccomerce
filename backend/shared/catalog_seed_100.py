"""Catálogo comercial extendido con 100 artículos adicionales (15 pinturas de 8 colores + 85 artículos de 3-4 colores)."""

from decimal import Decimal
from typing import Any

PAINT_8_COLORS: list[str] = [
    "blanco",
    "marfil",
    "gris perla",
    "azul cielo",
    "verde menta",
    "amarillo sol",
    "rojo oxido",
    "terracota",
]

# (sku_prefix, nombre, descripcion, marca, subcategoria, hoja, precio_base)
PAINT_PRODUCTS_15: list[tuple[str, str, str, str, str, str, str]] = [
    (
        "VIN-PRO19",
        "Pintura Vinílica Acrílica Lavable Pro 1000 Cubeta 19L",
        "Acabado mate de alto poder cubriente para interiores y exteriores, rinde hasta 160 m².",
        "Comex",
        "Pinturas e Impermeabilizantes",
        "Pinturas Vinílicas y Acrílicas",
        "1890.00",
    ),
    (
        "VIN-SAT04",
        "Pintura Vinílica Satinada Antibacterial Galón 4L",
        "Fórmula 100% acrílica resistente a humedad, hongos y manchas domésticas.",
        "Comex",
        "Pinturas e Impermeabilizantes",
        "Pinturas Vinílicas y Acrílicas",
        "549.00",
    ),
    (
        "ESM-ALQ04",
        "Esmalte Alquidálico Anticorrosivo Brillante Galón 4L",
        "Máxima protección contra oxidación en herrería, estructuras metálicas y madera.",
        "Berel",
        "Pinturas e Impermeabilizantes",
        "Esmaltes y Aerosoles",
        "689.00",
    ),
    (
        "AER-MUL40",
        "Pintura en Aerosol Acrílica Secado Rápido 400ml",
        "Válvula de 360 grados con acabado uniforme para metal, plástico, madera y cerámica.",
        "Truper",
        "Pinturas e Impermeabilizantes",
        "Esmaltes y Aerosoles",
        "95.00",
    ),
    (
        "IMP-BER19",
        "Impermeabilizante Elastomérico Fibratado 7 Años 19L",
        "Resina acrílica fotosensible con fibras de refuerzo que evita el uso de malla.",
        "Berel",
        "Pinturas e Impermeabilizantes",
        "Impermeabilizantes Acrílicos",
        "1750.00",
    ),
    (
        "EPO-PIS04",
        "Pintura Epóxica Industrial de Alto Tráfico para Pisos 4L",
        "Recubrimiento de alta resistencia química y mecánica para talleres, cocheras y almacenes.",
        "Sherwin-Williams",
        "Pinturas e Impermeabilizantes",
        "Recubrimientos Industriales",
        "1420.00",
    ),
    (
        "TRA-VIAL19",
        "Pintura Acrílica para Tráfico Pesado y Guarniciones 19L",
        "Secado ultrarrápido y resistencia a la abrasión vehicular en estacionamientos y vialidades.",
        "Sherwin-Williams",
        "Pinturas e Impermeabilizantes",
        "Recubrimientos Industriales",
        "2350.00",
    ),
    (
        "ESM-ECO04",
        "Esmalte Acrílico Base Agua Sin Olor Bajo VOC Galón 4L",
        "Esmalte ecológico de secado en 45 minutos ideal para interiores, hospitales y escuelas.",
        "Sayer",
        "Pinturas e Impermeabilizantes",
        "Esmaltes y Aerosoles",
        "760.00",
    ),
    (
        "TEX-FAC19",
        "Pintura Texturizada Acrílica Granulada para Fachadas 19L",
        "Recubrimiento decorativo hidrofugante que disimula imperfecciones en muros exteriores.",
        "Comex",
        "Pinturas e Impermeabilizantes",
        "Pinturas Vinílicas y Acrílicas",
        "2120.00",
    ),
    (
        "CAN-DEP19",
        "Pintura Antiderrapante para Canchas y Concreto 19L",
        "Acabado mate antideslizante de alta resistencia a la intemperie y rayos UV.",
        "Berel",
        "Pinturas e Impermeabilizantes",
        "Recubrimientos Industriales",
        "1980.00",
    ),
    (
        "BAR-POL04",
        "Barniz Entintado de Poliuretano Marino Exterior Galón 4L",
        "Filtro UV de doble absorción que protege maderas finas, puertas y pérgolas.",
        "Sayer",
        "Pinturas e Impermeabilizantes",
        "Esmaltes y Aerosoles",
        "840.00",
    ),
    (
        "AER-ALT40",
        "Pintura en Aerosol Alta Temperatura 600°C 400ml",
        "Formulada con resinas de silicón para motores, parrillas, escapes y calderas.",
        "Pretul",
        "Pinturas e Impermeabilizantes",
        "Esmaltes y Aerosoles",
        "135.00",
    ),
    (
        "SEL-ENT19",
        "Sellador Vinílico Entintable de Alta Adherencia Cubeta 19L",
        "Sella superficies porosas nuevas y optimiza el rendimiento del acabado final en un 35%.",
        "Sherwin-Williams",
        "Pinturas e Impermeabilizantes",
        "Pinturas Vinílicas y Acrílicas",
        "1290.00",
    ),
    (
        "PIN-TER19",
        "Pintura Elastomérica Térmica Antihumedad para Muros 19L",
        "Sella microfisuras en fachadas y refleja la radiación solar directa.",
        "Comex",
        "Pinturas e Impermeabilizantes",
        "Pinturas Vinílicas y Acrílicas",
        "2290.00",
    ),
    (
        "ESM-MAR04",
        "Esmalte Martillado Metálico Forja Industrial Galón 4L",
        "Acabado decorativo texturizado para maquinaria, cajas fuertes y portones.",
        "Sayer",
        "Pinturas e Impermeabilizantes",
        "Recubrimientos Industriales",
        "890.00",
    ),
]

# (sku_prefix, nombre, descripcion, marca, root, sub, leaf, precio_base, colores)
HARDWARE_PRODUCTS_85: list[tuple[str, str, str, str, str, str, str, str, list[str]]] = [
    # --- 20 Herramientas Eléctricas e Inalámbricas ---
    ("LIJ-ORB-250", "Lijadora Orbital de Palma 1/4 Hoja 250W", "Sistema recolector de polvo y base de aluminio.", "DeWalt", "Herramientas", "Herramientas Eléctricas", "Lijadoras y Cepillos", "1190.00", ["amarillo", "azul", "rojo"]),
    ("CAL-VEL-650", "Sierra Caladora Velocidad Variable 650W", "Acción pendular de 4 posiciones y cambio de segueta sin llave.", "Bosch", "Herramientas", "Herramientas Eléctricas", "Sierras y Cortadoras", "1650.00", ["azul", "verde", "amarillo"]),
    ("CIR-714-1800", "Sierra Circular Profesional 7-1/4 Pulg 1800W", "Guía láser integrada y guarda inferior de magnesio.", "Makita", "Herramientas", "Herramientas Eléctricas", "Sierras y Cortadoras", "2590.00", ["azul", "amarillo", "naranja"]),
    ("ROU-REB-1200", "Router Rebajador de Columna 1-3/4 HP", "Ajuste micrométrico de profundidad y arranque suave.", "Bosch", "Herramientas", "Herramientas Eléctricas", "Lijadoras y Cepillos", "2890.00", ["azul", "amarillo", "gris"]),
    ("CEP-ELE-750", "Cepillo Eléctrico para Madera 3-1/4 Pulg 750W", "Cuchillas reversibles de carburo de tungsteno.", "Makita", "Herramientas", "Herramientas Eléctricas", "Lijadoras y Cepillos", "2250.00", ["azul", "naranja", "amarillo"]),
    ("PIS-CAL-2000", "Pistola de Calor Digital Doble Temperatura 2000W", "Pantalla LCD y protección térmica contra sobrecarga.", "Truper", "Herramientas", "Herramientas Eléctricas", "Equipos de Taller", "790.00", ["naranja", "azul", "amarillo"]),
    ("ATO-IMP-20V", "Atornillador de Impacto Hexagonal 1/4 Pulg 20V", "Torque máximo de 180 Nm con triple luz LED frontal.", "DeWalt", "Herramientas", "Herramientas Eléctricas", "Taladros y Rotomartillos", "2390.00", ["amarillo", "azul", "negro"]),
    ("LLA-IMP-12", "Llave de Impacto Inalámbrica Cuadro 1/2 Pulg 20V", "Alto torque de 450 Nm para birlos y estructuras.", "Makita", "Herramientas", "Herramientas Eléctricas", "Taladros y Rotomartillos", "3490.00", ["azul", "amarillo", "rojo"]),
    ("COR-MET-14", "Cortadora de Metales Tronzadora 14 Pulg 2200W", "Prensa de sujeción rápida y deflector de chispas.", "DeWalt", "Herramientas", "Herramientas Eléctricas", "Sierras y Cortadoras", "3690.00", ["amarillo", "azul", "naranja"]),
    ("DEM-HEX-1500", "Martillo Demoledor Hexagonal 1500W 25 Joules", "Sistema antivibración activo para concreto armado.", "Bosch", "Herramientas", "Herramientas Eléctricas", "Taladros y Rotomartillos", "6890.00", ["azul", "amarillo", "rojo"]),
    ("MEZ-MOR-1400", "Mezcladora Eléctrica para Pintura y Mortero 1400W", "Caja de 2 velocidades mecánicas y propela M14.", "Truper", "Herramientas", "Herramientas Eléctricas", "Equipos de Taller", "2150.00", ["naranja", "azul", "gris"]),
    ("PUL-AUT-1200", "Pulidora Rotativa Profesional 7 Pulg 1200W", "Control electrónico de velocidad constante de 600 a 3000 RPM.", "DeWalt", "Herramientas", "Herramientas Eléctricas", "Lijadoras y Cepillos", "2790.00", ["amarillo", "rojo", "azul"]),
    ("SOP-INA-20V", "Sopladora y Aspiradora de Taller 20V", " Caudal de aire de 260 km/h con boquilla concentradora.", "Makita", "Herramientas", "Herramientas Eléctricas", "Equipos de Taller", "1490.00", ["azul", "amarillo", "naranja"]),
    ("MOT-ROT-180", "Mototool Rectificador Rotativo con Eje Flexible", "Incluye estuche con 120 accesorios de corte, lija y pulido.", "Truper", "Herramientas", "Herramientas Eléctricas", "Equipos de Taller", "980.00", ["naranja", "azul", "negro"]),
    ("ENG-ELE-20V", "Engrapadora y Clavadora Eléctrica Calibre 18", "Disparo secuencial y ajuste de fuerza de impacto.", "Stanley", "Herramientas", "Herramientas Eléctricas", "Equipos de Taller", "1580.00", ["amarillo", "naranja", "rojo"]),
    ("EST-SOL-60W", "Estación de Soldadura Digital Cautín 60W", "Rango térmico de 200 a 480 °C con soporte y esponja.", "Urrea", "Herramientas", "Herramientas Eléctricas", "Equipos de Taller", "1120.00", ["rojo", "azul", "negro"]),
    ("INV-SOL-200A", "Soldadora Inversora Bivoltaje 110/220V 200A", "Tecnología IGBT para electrodo revestido y proceso TIG.", "Lincoln Electric", "Herramientas", "Herramientas Eléctricas", "Equipos de Taller", "3890.00", ["rojo", "naranja", "amarillo"]),
    ("COM-AIR-50L", "Compresor de Aire Vertical 50 Litros 2.5 HP", "Doble manómetro y conexión rápida universal de latón.", "Truper", "Herramientas", "Herramientas Eléctricas", "Equipos de Taller", "3750.00", ["naranja", "rojo", "azul"]),
    ("HID-PRE-1800", "Hidrolavadora Eléctrica Alta Presión 1800 PSI", "Sistema de paro automático Total Stop y lanza ajustable.", "Karcher", "Herramientas", "Herramientas Eléctricas", "Equipos de Taller", "2650.00", ["amarillo", "naranja", "azul"]),
    ("ASP-IND-12G", "Aspiradora Industrial Seco y Mojado 12 Galones", "Tanque reforzado con función de soplado y filtro HEPA.", "Stanley", "Herramientas", "Herramientas Eléctricas", "Equipos de Taller", "2190.00", ["amarillo", "naranja", "gris"]),
    # --- 20 Herramientas Manuales y Organizadores ---
    ("CAJ-MET-20", "Caja de Herramientas Metálica 20 Pulg con Charola", "Broches metálicos cromados con portacandado.", "Urrea", "Herramientas", "Herramientas Manuales", "Organizadores y Cajas", "690.00", ["rojo", "azul", "negro"]),
    ("GAB-ROD-5C", "Gabinete Rodante de Taller con 5 Cajones", "Ruedas industriales con freno y correderas de baleros.", "Urrea", "Herramientas", "Herramientas Manuales", "Organizadores y Cajas", "5490.00", ["rojo", "negro", "azul"]),
    ("MOC-HER-35", "Mochila Porta Herramientas Uso Rudo 35 Bolsillos", "Base impermeable moldeada y tela poliéster 1680D.", "Klein Tools", "Herramientas", "Herramientas Manuales", "Organizadores y Cajas", "1450.00", ["naranja", "negro", "amarillo"]),
    ("DES-MAG-10", "Juego de 10 Desarmadores Punta Magnética", "Barra de acero cromo vanadio y mango ergonómico.", "Stanley", "Herramientas", "Herramientas Manuales", "Pinzas y Desarmadores", "390.00", ["amarillo", "rojo", "naranja"]),
    ("PIN-ELE-9", "Pinza de Electricista Alta Palanca Aislada 1000V", "Certificación VDE para trabajos en líneas energizadas.", "Klein Tools", "Herramientas", "Herramientas Manuales", "Pinzas y Desarmadores", "620.00", ["rojo", "amarillo", "naranja"]),
    ("PIN-PRE-10", "Pinza de Presión Mordaza Curva 10 Pulg", "Acero aleado con palanca de liberación recubierta.", "Urrea", "Herramientas", "Herramientas Manuales", "Pinzas y Desarmadores", "285.00", ["rojo", "azul", "gris"]),
    ("LLA-STI-14", "Llave Stilson para Tubo 14 Pulg Hierro Dúctil", "Mordazas forjadas templadas por inducción.", "Urrea", "Herramientas", "Herramientas Manuales", "Juegos de Autocle y Dados", "540.00", ["rojo", "naranja", "gris"]),
    ("LLA-PER-12", "Llave Ajustable Perico 12 Pulg Graduada", "Escala milimétrica y en pulgadas grabada con láser.", "Surtek", "Herramientas", "Herramientas Manuales", "Juegos de Autocle y Dados", "345.00", ["amarillo", "rojo", "negro"]),
    ("MAR-UNA-16", "Martillo Uña Curva 16 oz Mango Fibra de Vidrio", "Cabeza forjada pulida con grip antiderrapante.", "Truper", "Herramientas", "Herramientas Manuales", "Corte y Golpe", "215.00", ["naranja", "amarillo", "rojo"]),
    ("MRR-OCT-4L", "Marro Octagonal 4 Libras Mango Antivibración", "Acero al alto carbono con doble inyección de neopreno.", "Truper", "Herramientas", "Herramientas Manuales", "Corte y Golpe", "360.00", ["naranja", "amarillo", "azul"]),
    ("FLE-IMP-8M", "Flexómetro Contra Impacto 8 Metros Cinta Doble", "Cinta recubierta de nylon con gancho magnético doble.", "Stanley", "Herramientas", "Herramientas Manuales", "Corte y Golpe", "265.00", ["amarillo", "naranja", "rojo"]),
    ("NIV-TOR-24", "Nivel Magnético Profesional de Aluminio 24 Pulg", "Tres gotas acrílicas de alta visibilidad (0°, 45° y 90°).", "Stanley", "Herramientas", "Herramientas Manuales", "Corte y Golpe", "380.00", ["amarillo", "azul", "rojo"]),
    ("ARC-SEG-12", "Arco de Segueta Profesional Alta Tensión 12 Pulg", "Permite cortes a 45° y 90° con guarda protectora.", "Urrea", "Herramientas", "Herramientas Manuales", "Corte y Golpe", "295.00", ["rojo", "amarillo", "naranja"]),
    ("COR-TUB-18", "Cortatubo de Precisión para Cobre y Latón 1/8 a 1-1/8", "Cuchilla de acero SUJ2 y escariador abatible integrado.", "Urrea", "Herramientas", "Herramientas Manuales", "Corte y Golpe", "310.00", ["rojo", "azul", "naranja"]),
    ("PRE-SAR-12", "Prensa Sargento de Ajuste Rápido 12 Pulg", "Fuerza de apriete de 150 kg convertible en expansor.", "DeWalt", "Herramientas", "Herramientas Manuales", "Corte y Golpe", "420.00", ["amarillo", "naranja", "negro"]),
    ("JGO-LLA-14", "Juego de 14 Llaves Combinadas con Matraca", "Mecanismo de 72 dientes que requiere solo 5° de giro.", "Urrea", "Herramientas", "Herramientas Manuales", "Juegos de Autocle y Dados", "1690.00", ["rojo", "azul", "negro"]),
    ("TIJ-AVI-10", "Tijera de Aviación para Lámina Corte Recto 10 Pulg", "Hojas de acero cromo molibdeno aserradas.", "Stanley", "Herramientas", "Herramientas Manuales", "Corte y Golpe", "275.00", ["amarillo", "rojo", "verde"]),
    ("PIS-CAL-REF", "Pistola Calafateadora Reforzada de Cremallera", "Relación de empuje 12:1 para selladores de alta viscosidad.", "Truper", "Herramientas", "Herramientas Manuales", "Corte y Golpe", "165.00", ["naranja", "azul", "amarillo"]),
    ("CAR-NEU-6P", "Carretilla Honda 6 Pies Cúbicos Llanta Neumática", "Concha calibre 20 con pintura electrostática horneada.", "Truper", "Herramientas", "Herramientas Manuales", "Organizadores y Cajas", "1680.00", ["naranja", "azul", "verde"]),
    ("DIA-CAR-300", "Diablo de Carga Tubular Reforzado 300 kg", "Ruedas sólidas impinchables de 10 pulgadas.", "Fiero", "Herramientas", "Herramientas Manuales", "Organizadores y Cajas", "1390.00", ["rojo", "azul", "amarillo"]),
    # --- 15 Plomería, Baño y Almacenamiento de Agua ---
    ("TIN-TRI-1100", "Tinaco Tricapa Antibacterial Equipado 1100 Litros", "Incluye válvula de llenado, flotador, multiconector y filtro.", "Rotoplas", "Construcción y Acabados", "Plomería y Hidráulica", "Tinacos y Calentadores", "3450.00", ["beige", "negro", "azul"]),
    ("CIS-EQU-2800", "Cisterna Prefabricada con Bomba 2800 Litros", "Polietileno de alta densidad de una sola pieza sin costuras.", "Rotoplas", "Construcción y Acabados", "Plomería y Hidráulica", "Tinacos y Calentadores", "8290.00", ["azul", "negro", "beige"]),
    ("CAL-PAS-12L", "Calentador de Paso Instantáneo 12 L/min Gas LP", "Encendido electrónico sin piloto, ahorro de hasta 70% de gas.", "Foset", "Construcción y Acabados", "Plomería y Hidráulica", "Tinacos y Calentadores", "3190.00", ["blanco", "gris", "negro"]),
    ("CAL-SOL-15T", "Calentador Solar Acero Inoxidable 15 Tubos 180L", "Termotanque aislado con poliuretano de alta densidad.", "Foset", "Construcción y Acabados", "Plomería y Hidráulica", "Tinacos y Calentadores", "6490.00", ["azul", "blanco", "gris"]),
    ("BOM-PER-12", "Bomba de Agua Periférica 1/2 HP Altura Máx 40m", "Impulsor de latón y embobinado de cobre térmico.", "Truper", "Construcción y Acabados", "Plomería y Hidráulica", "Bombas y Presurizadores", "920.00", ["naranja", "azul", "amarillo"]),
    ("BOM-CEN-1HP", "Bomba Centrífuga de Caudal 1 HP 115 L/min", "Ideal para llenado rápido de cisternas y riego agrícola.", "Truper", "Construcción y Acabados", "Plomería y Hidráulica", "Bombas y Presurizadores", "1950.00", ["naranja", "azul", "rojo"]),
    ("BOM-SUM-34", "Bomba Sumergible para Agua Sucia 3/4 HP con Flotador", "Paso de sólidos de hasta 30 mm para cárcamos e inundaciones.", "Foset", "Construcción y Acabados", "Plomería y Hidráulica", "Bombas y Presurizadores", "1690.00", ["naranja", "azul", "negro"]),
    ("HID-HOR-24L", "Equipo Hidroneumático Horizontal 24 Litros 1/2 HP", "Mantiene presión constante en toda la red hidráulica.", "Truper", "Construcción y Acabados", "Plomería y Hidráulica", "Bombas y Presurizadores", "2890.00", ["naranja", "azul", "rojo"]),
    ("MEZ-FRE-MON", "Mezcladora Monomando para Fregadero Cuello Extraíble", "Cartucho cerámico de suave apertura y doble rociador.", "Foset", "Construcción y Acabados", "Plomería y Hidráulica", "Grifería y Accesorios", "1150.00", ["gris", "negro", "blanco"]),
    ("REG-CUA-8P", "Regadera Cuadrada Ultra Plana 8 Pulg con Brazo", "Boquillas de silicón antisarro para alta y media presión.", "Coflex", "Construcción y Acabados", "Plomería y Hidráulica", "Grifería y Accesorios", "680.00", ["gris", "negro", "blanco"]),
    ("ACC-BAN-6P", "Juego de 6 Accesorios Metálicos para Baño", "Incluye toallero, porta rollo, gancho, jabonera y vaso.", "Foset", "Construcción y Acabados", "Plomería y Hidráulica", "Grifería y Accesorios", "850.00", ["gris", "negro", "blanco"]),
    ("FIL-PUR-2E", "Sistema Purificador de Agua Bajo Tarja 2 Etapas", "Retiene sedimentos, cloro, sabores y olores con carbón activado.", "Rotoplas", "Construcción y Acabados", "Plomería y Hidráulica", "Grifería y Accesorios", "1390.00", ["blanco", "azul", "gris"]),
    ("MAN-REF-30M", "Manguera Reforzada 3 Capas Antitorceduras 30m", "Conexiones de latón maquinado de 1/2 pulgada.", "Truper", "Construcción y Acabados", "Plomería y Hidráulica", "Grifería y Accesorios", "490.00", ["verde", "naranja", "azul"]),
    ("PIS-RIE-7F", "Pistola Metálica de Riego 7 Funciones", "Cuerpo de zamac recubierto en TPR térmico.", "Pretul", "Construcción y Acabados", "Plomería y Hidráulica", "Grifería y Accesorios", "175.00", ["naranja", "verde", "amarillo"]),
    ("VAL-ESF-1P", "Paquete de 5 Válvulas Esfera de PVC Cédula 80 1 Pulg", "Presión de trabajo de 150 PSI con asientos de EPDM.", "Foset", "Construcción y Acabados", "Plomería y Hidráulica", "Grifería y Accesorios", "460.00", ["blanco", "gris", "azul"]),
    # --- 15 Material Eléctrico e Iluminación LED ---
    ("CAB-THW-12", "Caja de Cable de Cobre THW-LS Calibre 12 AWG 100m", "Aislamiento antiflama libre de halógenos 90 °C 600V.", "Iusa", "Eléctrico y Seguridad", "Instalaciones Eléctricas", "Cables y Conductores", "1690.00", ["rojo", "negro", "blanco", "verde"]),
    ("CAB-THW-10", "Caja de Cable de Cobre THW-LS Calibre 10 AWG 100m", "Conductor 100% cobre electrolítico para circuitos de fuerza.", "Iusa", "Eléctrico y Seguridad", "Instalaciones Eléctricas", "Cables y Conductores", "2580.00", ["rojo", "negro", "blanco", "verde"]),
    ("REF-LED-100", "Reflector LED Exterior Slim IP65 100W", "Flujo luminoso de 9,000 lúmenes con carcasa de aluminio.", "Volteck", "Eléctrico y Seguridad", "Instalaciones Eléctricas", "Iluminación LED", "590.00", ["negro", "blanco", "gris"]),
    ("SUB-SOL-150", "Luminaria Suburbana Solar LED 150W con Sensor", "Encendido crepuscular automático y control remoto.", "Volteck", "Eléctrico y Seguridad", "Instalaciones Eléctricas", "Iluminación LED", "1290.00", ["gris", "negro", "blanco"]),
    ("PAN-LED-24W", "Panel Plafón LED Sobreponer Redondo 24W", "Iluminación homogénea sin parpadeo, 30,000 h de vida.", "Volteck", "Eléctrico y Seguridad", "Instalaciones Eléctricas", "Iluminación LED", "240.00", ["blanco", "negro", "gris"]),
    ("EXT-RUD-15M", "Extensión Eléctrica Uso Rudo Calibre 12 AWG 15m", "Triple contacto polarizado con indicador luminoso.", "Volteck", "Eléctrico y Seguridad", "Instalaciones Eléctricas", "Cables y Conductores", "690.00", ["naranja", "amarillo", "negro"]),
    ("CAR-ALA-20M", "Carrete Alargador Metálico 20m con 4 Contactos", "Protector térmico reiniciable contra sobrecarga.", "Volteck", "Eléctrico y Seguridad", "Instalaciones Eléctricas", "Cables y Conductores", "1180.00", ["naranja", "amarillo", "azul"]),
    ("NOB-REG-1200", "No-Break y Regulador Interactivo 1200VA 8 Contactos", "Respaldo de batería de hasta 45 minutos para cómputo y POS.", "Volteck", "Eléctrico y Seguridad", "Instalaciones Eléctricas", "Centros de Carga y Protección", "1890.00", ["negro", "gris", "blanco"]),
    ("CEN-CAR-8P", "Centro de Carga 8 Polos Empotrar/Sobreponer", "Barras colectoras de cobre estañado de 100 Amperes.", "Iusa", "Eléctrico y Seguridad", "Instalaciones Eléctricas", "Centros de Carga y Protección", "640.00", ["gris", "blanco", "negro"]),
    ("INT-TER-30A", "Interruptor Termomagnético 2 Polos 30 Amperes", "Montaje enchufable con capacidad interruptiva de 10,000 A.", "Iusa", "Eléctrico y Seguridad", "Instalaciones Eléctricas", "Centros de Carga y Protección", "260.00", ["negro", "gris", "azul"]),
    ("PRO-FAS-LED", "Probador de Voltaje sin Contacto 90 a 1000V CA", "Alarma audible y visual con linterna LED integrada.", "Klein Tools", "Eléctrico y Seguridad", "Medición y Diagnóstico", "Multímetros y Pinzas", "490.00", ["amarillo", "naranja", "rojo"]),
    ("CIN-AIS-10P", "Paquete de 10 Cintas Aislantes de Vinil Profesionales", "Autoextinguible, alta elongación y adherencia.", "3M", "Eléctrico y Seguridad", "Instalaciones Eléctricas", "Cables y Conductores", "320.00", ["negro", "rojo", "azul", "amarillo"]),
    ("CAN-ADH-10P", "Lote de 10 Canaletas Plásticas con Adhesivo 2m", "Instalación limpia de cableado de red y eléctrico.", "Volteck", "Eléctrico y Seguridad", "Instalaciones Eléctricas", "Cables y Conductores", "290.00", ["blanco", "gris", "marfil"]),
    ("PLA-CON-DUP", "Placa Armada con 2 Contactos Dúplex y USB", "Policarbonato autoextinguible con chasis de acero.", "Volteck", "Eléctrico y Seguridad", "Instalaciones Eléctricas", "Centros de Carga y Protección", "280.00", ["blanco", "negro", "gris"]),
    ("TIM-INA-100", "Timbre Inalámbrico Impermeable Alcance 100m", "36 melodías seleccionables y 4 niveles de volumen.", "Volteck", "Eléctrico y Seguridad", "Instalaciones Eléctricas", "Centros de Carga y Protección", "245.00", ["blanco", "negro", "gris"]),
    # --- 15 Seguridad Industrial y Protección Personal (EPP) ---
    ("CAS-DIE-MAT", "Casco de Seguridad Dieléctrico Clase E con Matraca", "Suspensión de nylon de 4 puntos, soporta hasta 20,000 V.", "3M", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Protección Corporal y Cabeza", "260.00", ["blanco", "amarillo", "azul", "rojo"]),
    ("CHA-REF-BRI", "Chaleco Brigadista de Alta Visibilidad con Cintas 3M", "Tela gabardina 100% algodón con bolsas multifunción.", "Truper", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Protección Corporal y Cabeza", "310.00", ["naranja", "amarillo", "rojo", "azul"]),
    ("LEN-SEG-ANT", "Lentes de Seguridad Policarbonato Antiempañante", "Filtro 99.9% UV y patillas telescópicas ajustables.", "3M", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Protección Corporal y Cabeza", "125.00", ["negro", "azul", "amarillo", "gris"]),
    ("GUA-NIT-COR", "Guantes Anticorte Nivel 5 Recubiertos de Nitrilo", "Fibra HPPE de alta resistencia a abrasión y corte.", "Urrea", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Calzado y Guantes", "185.00", ["rojo", "negro", "azul", "naranja"]),
    ("BOT-IND-DIE", "Botas Industriales Dieléctricas Casquillo Poliamida", "Suela de poliuretano bidensidad antiderrapante.", "Truper", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Calzado y Guantes", "1190.00", ["negro", "cafe", "gris", "amarillo"]),
    ("CAR-SOL-ELE", "Careta Electrónica para Soldar Sombra Variable 9-13", "Celda fotoeléctrica solar de oscurecimiento en 1/25,000 s.", "Lincoln Electric", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Protección Corporal y Cabeza", "1250.00", ["negro", "rojo", "azul", "naranja"]),
    ("RES-DOB-FIL", "Respirador Reutilizable de Media Cara Doble Cartucho", "Elastómero termoplástico hipoalergénico para vapores y polvos.", "3M", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Protección Corporal y Cabeza", "680.00", ["gris", "azul", "negro"]),
    ("ARN-SEG-5AN", "Arnés de Seguridad Cuerpo Completo 5 Anillos D", "Cinta de poliéster de alta tenacidad, capacidad 140 kg.", "Truper", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Alturas y Señalización", "980.00", ["naranja", "amarillo", "rojo", "azul"]),
    ("LIN-VID-AMO", "Línea de Vida Doble con Amortiguador de Impacto", "Ganchos estructureros de acero forjado de doble seguro.", "Truper", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Alturas y Señalización", "890.00", ["naranja", "amarillo", "rojo"]),
    ("FAJ-LUM-TIR", "Faja Lumbar Elástica Reforzada con Tirantes", "Varillas flexibles dorsales y tercer cinturón de ajuste.", "Pretul", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Protección Corporal y Cabeza", "195.00", ["negro", "azul", "naranja"]),
    ("IMP-GAB-IND", "Impermeable Industrial Tipo Gabardina con Reflejante", "PVC vulcanizado de alta resistencia con capucha.", "Truper", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Protección Corporal y Cabeza", "290.00", ["amarillo", "naranja", "azul"]),
    ("CON-TRA-70C", "Cono de Señalamiento Vial 70 cm con Cinta Reflejante", "Base cuadrada pesada de PVC flexible indeformable.", "Fiero", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Alturas y Señalización", "210.00", ["naranja", "amarillo", "rojo"]),
    ("CIN-BAR-300", "Rollo de Cinta de Barricada Señalización 300m", "Polietileno impreso de alta visibilidad para obras.", "Truper", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Alturas y Señalización", "160.00", ["amarillo", "rojo", "naranja"]),
    ("EXT-PQS-45K", "Extintor Portátil Polvo Químico Seco ABC 4.5 kg", "Incluye manómetro, manguera de descarga y soporte mural.", "Truper", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Alturas y Señalización", "780.00", ["rojo", "amarillo", "azul"]),
    ("ORE-AUD-28D", "Orejeras Auditivas Dieléctricas Reducción 28 dB", "Almohadillas suaves de espuma y diadema acolchada.", "3M", "Eléctrico y Seguridad", "Seguridad Industrial EPP", "Protección Corporal y Cabeza", "390.00", ["rojo", "amarillo", "negro"]),
]


def build_100_catalog_specs() -> list[dict[str, Any]]:
    """Construye las especificaciones de los 100 productos adicionales con sus variantes de color."""
    specs: list[dict[str, Any]] = []

    for sku_prefix, nombre, desc, marca, sub, leaf, base_price_str in PAINT_PRODUCTS_15:
        base_price = Decimal(base_price_str)
        variantes = []
        for idx, color in enumerate(PAINT_8_COLORS):
            color_code = color[:3].upper().replace(" ", "")
            sku = f"{sku_prefix}-{color_code}{idx + 1}"
            price_offset = Decimal(idx * 15)
            variantes.append(
                {
                    "sku": sku,
                    "atributos": {"color": color, "acabado": "profesional", "presentacion": sku_prefix[-3:]},
                    "precio": (base_price + price_offset).quantize(Decimal("0.01")),
                    "stock": (20, 14),
                }
            )
        specs.append(
            {
                "root": "Construcción y Acabados",
                "sub": sub,
                "leaf": leaf,
                "nombre": nombre,
                "descripcion": desc,
                "marca": marca,
                "variantes": variantes,
            }
        )

    for sku_prefix, nombre, desc, marca, root, sub, leaf, base_price_str, colors in HARDWARE_PRODUCTS_85:
        base_price = Decimal(base_price_str)
        variantes = []
        for idx, color in enumerate(colors):
            color_code = color[:3].upper()
            sku = f"{sku_prefix}-{color_code}"
            price_offset = Decimal(idx * 25)
            variantes.append(
                {
                    "sku": sku,
                    "atributos": {"color": color, "serie": "Industrial Pro"},
                    "precio": (base_price + price_offset).quantize(Decimal("0.01")),
                    "stock": (18, 12),
                }
            )
        specs.append(
            {
                "root": root,
                "sub": sub,
                "leaf": leaf,
                "nombre": nombre,
                "descripcion": desc,
                "marca": marca,
                "variantes": variantes,
            }
        )

    return specs
