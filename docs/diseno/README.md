# Diseño del frontend · Sistema Taller

Paquete de handoff del diseño para implementar el frontend en React (Vite + TypeScript) del Ecommerce tipo Home Depot.
Sale del Documento de Calidad (secciones 3, 4.5, 6.1, 13.1, 18, 19, 26, 27 y 28; HU-01 a HU-09).

## Diseño en Figma

Enlace al archivo de Figma: _pendiente (próxima implementación)_.

## Qué hay en esta carpeta

| Carpeta o archivo | Para qué sirve |
|---|---|
| `prototipos/*.dc.html` | Prototipos de cada pantalla: referencia visual (medidas, colores y textos) y lógica (estados, validaciones y datos de ejemplo en el `<script>` final de cada archivo). Se abren en el navegador. |
| `tokens.css` | Colores, tipografía, radios y medidas del sistema Taller como variables CSS. |
| `checklist.md` | Requisitos del documento y en qué pantalla se cumple cada uno. |

## Reglas para implementar

1. **Estilo:** usar solo las variables de `tokens.css`. No inventar colores. Verde, ámbar y rojo son únicamente para estados.
2. **Accesibilidad (WCAG 2.1 AA, sec. 28):** HTML semántico, `label` en cada campo, errores por campo con `aria-describedby` y `aria-invalid`, `lang="es"`, `alt` en imágenes, foco visible y áreas táctiles de 44 px o más. Filtros activos en una región `aria-live`.
3. **Responsive (sec. 27.4):** mobile-first; las pantallas `Movil-*` son la versión de 320 a 480 px y las `Escritorio-*` la de 1025 px o más.
4. **Pago (PCI SAQ A, sec. 18.2):** el sitio nunca muestra campos de tarjeta; el checkout redirige a la pasarela hospedada.
5. **Datos de ejemplo:** `[MARCA]` (la marca es Ferremarket), `[pasarela de pago]`, precios, nombres y folios son de prueba. En el código salen de la API (`/api/v1`, sec. 13.1).
6. **Componentes:** los nombres de la tabla son una sugerencia; reutilizar entre escritorio y móvil con CSS responsive, no duplicar pantallas.

## Endpoints que consume el frontend (sec. 13.1)

`GET /api/v1/categories` · `GET /api/v1/products?category={id}&page={n}` · `GET /api/v1/products/{sku}` · `POST /api/v1/auth/register` · `POST /api/v1/auth/login` · `POST /api/v1/auth/refresh` · `GET /api/v1/cart` · `POST /api/v1/cart/items` · `POST /api/v1/checkout` · `GET /api/v1/shipping/quote?zip={cp}`

## Mapa de pantallas

### Sistema Taller

| # | Pantalla | Ruta sugerida | Componentes | Prototipo |
|---|---|---|---|---|
| 01 | Checklist del Documento de Calidad | `—` | Checklist del documento (referencia, no es una ruta) | `prototipos/Main.dc.html` |
| 02 | Escritorio · Listado | `/categoria/:slug` | Header, CategoryNav, Breadcrumbs, FacetFilters, ActiveFilterChips, ProductCard, CompareBar, Pagination | `prototipos/Escritorio-1-Listado.dc.html` |
| 03 | Escritorio · Ficha de producto | `/producto/:sku` | Gallery, VariantSelector, FulfillmentPicker, QuantityStepper, SpecsTable, Reviews | `prototipos/Escritorio-2-Ficha.dc.html` |
| 04 | Escritorio · Carrito | `/carrito` | CartLine, QuantityStepper, OutOfStockNotice, OrderSummary | `prototipos/Escritorio-3-Carrito.dc.html` |
| 05 | Escritorio · Checkout | `/checkout` | ContactForm, FulfillmentPicker, StorePicker, AddressForm, PaymentNotice, OrderSummary | `prototipos/Escritorio-4-Checkout.dc.html` |
| 06 | Escritorio · Confirmación | `/pedido/:id/confirmacion` | PaymentStatus (pendiente, pagado o rechazado), OrderTimeline | `prototipos/Escritorio-5-Confirmacion.dc.html` |
| 07 | Móvil · Listado | `/categoria/:slug (móvil)` | HeaderMovil, FiltersButton, ProductCardHorizontal | `prototipos/Movil-1-Listado.dc.html` |
| 08 | Móvil · Buscar | `/buscar (móvil)` | SearchCombobox con sugerencias | `prototipos/Movil-2-Buscar.dc.html` |
| 09 | Móvil · Filtros | `panel de /categoria/:slug` | FiltersSheet (diálogo a pantalla completa) | `prototipos/Movil-3-Filtros.dc.html` |
| 10 | Móvil · Ficha de producto | `/producto/:sku (móvil)` | StickyAddToCart, Accordion | `prototipos/Movil-4-Ficha.dc.html` |
| 11 | Móvil · Carrito | `/carrito (móvil)` | CartLine, StickySummary | `prototipos/Movil-5-Carrito.dc.html` |
| 12 | Móvil · Checkout | `/checkout (móvil)` | Igual que escritorio en una columna, error de CP de ejemplo | `prototipos/Movil-6-Checkout.dc.html` |
| 13 | Móvil · Confirmación | `/pedido/:id/confirmacion (móvil)` | PaymentStatus, OrderTimeline vertical | `prototipos/Movil-7-Confirmacion.dc.html` |
| 14 | Móvil · Registro | `/cuenta/registro (móvil)` | RegisterForm, PrivacyConsent, FieldError | `prototipos/Movil-8-Registro.dc.html` |

### Catálogo y herramientas

| # | Pantalla | Ruta sugerida | Componentes | Prototipo |
|---|---|---|---|---|
| 15 | Escritorio · Inicio | `/` | Hero, DepartmentGrid, ProductCard | `prototipos/Escritorio-6-Inicio.dc.html` |
| 16 | Escritorio · Sin resultados, error y carga | `estados de /buscar y /categoria` | EmptyState, ErrorState, Skeleton, QueueState | `prototipos/Escritorio-7-Estados.dc.html` |
| 17 | Escritorio · Comparador | `/comparar` | CompareTable (th scope, "solo diferencias") | `prototipos/Escritorio-8-Comparador.dc.html` |
| 18 | Escritorio · Vista 360° | `modal en /producto/:sku` | Viewer360 (slider + flechas) | `prototipos/Escritorio-9-Vista360.dc.html` |
| 19 | Escritorio · Calculadora de materiales | `/calculadora` | Tabs, CalculatorForm con validación, ResultPanel | `prototipos/Escritorio-10-Calculadora.dc.html` |
| 20 | Escritorio · Localizador de tiendas | `/sucursales` | StoreList (fuente de verdad), MapPlaceholder | `prototipos/Escritorio-11-Tiendas.dc.html` |
| 21 | Móvil · Inicio | `/ (móvil)` | — | `prototipos/Movil-9-Inicio.dc.html` |
| 22 | Móvil · Departamentos | `menú móvil` | DepartmentDrilldown de 3 niveles | `prototipos/Movil-10-Departamentos.dc.html` |
| 23 | Móvil · Sin resultados | `estado móvil` | EmptyState, ErrorState | `prototipos/Movil-11-SinResultados.dc.html` |
| 24 | Móvil · Comparador | `/comparar (móvil)` | CompareTable con scroll horizontal | `prototipos/Movil-12-Comparador.dc.html` |
| 25 | Móvil · Vista 360° | `modal (móvil)` | Viewer360 | `prototipos/Movil-13-Vista360.dc.html` |
| 26 | Móvil · Calculadora | `/calculadora (móvil)` | — | `prototipos/Movil-14-Calculadora.dc.html` |
| 27 | Móvil · Localizador de tiendas | `/sucursales (móvil)` | Tabs Lista/Mapa | `prototipos/Movil-15-Tiendas.dc.html` |

### Cuenta del cliente

| # | Pantalla | Ruta sugerida | Componentes | Prototipo |
|---|---|---|---|---|
| 28 | Escritorio · Iniciar sesión | `/cuenta/login` | LoginForm (normal, error o bloqueada) | `prototipos/Escritorio-12-Login.dc.html` |
| 29 | Escritorio · Registro | `/cuenta/registro` | RegisterForm, PrivacyConsent | `prototipos/Escritorio-13-Registro.dc.html` |
| 30 | Escritorio · Mi cuenta | `/cuenta` | AccountNav, ActiveOrderBanner | `prototipos/Escritorio-14-MiCuenta.dc.html` |
| 31 | Escritorio · Mis pedidos | `/cuenta/pedidos` | StatusFilterChips, OrderRow, StatusBadge | `prototipos/Escritorio-15-Pedidos.dc.html` |
| 32 | Escritorio · Seguimiento de pedido | `/cuenta/pedidos/:id` | OrderTimeline, PickupCode, OrderItems | `prototipos/Escritorio-16-Seguimiento.dc.html` |
| 33 | Escritorio · Direcciones | `/cuenta/direcciones` | AddressCard, InlineConfirm, AddressForm | `prototipos/Escritorio-17-Direcciones.dc.html` |
| 34 | Escritorio · Lista de deseos | `/cuenta/deseos` | ProductCard, EmptyState | `prototipos/Escritorio-18-ListaDeseos.dc.html` |
| 35 | Escritorio · Datos y privacidad (ARCO) | `/cuenta/datos` | ProfileForm, ConsentToggles, ArcoRequest, DeleteAccount | `prototipos/Escritorio-19-Datos.dc.html` |
| 36 | Escritorio · Solicitar devolución | `/cuenta/pedidos/:id/devolucion` | ReturnForm por pasos | `prototipos/Escritorio-20-Devolucion.dc.html` |
| 37 | Escritorio · Escribir reseña | `/producto/:sku/resena` | StarRating (radios), ReviewForm | `prototipos/Escritorio-21-Resena.dc.html` |
| 38 | Correo · Confirmación de pedido | `plantilla de correo (backend)` | — | `prototipos/Correo-Confirmacion.dc.html` |
| 39 | Móvil · Iniciar sesión | `/cuenta/login (móvil)` | — | `prototipos/Movil-16-Login.dc.html` |
| 40 | Móvil · Mi cuenta | `/cuenta (móvil)` | — | `prototipos/Movil-17-MiCuenta.dc.html` |
| 41 | Móvil · Mis pedidos | `/cuenta/pedidos (móvil)` | — | `prototipos/Movil-18-Pedidos.dc.html` |
| 42 | Móvil · Seguimiento | `/cuenta/pedidos/:id (móvil)` | — | `prototipos/Movil-19-Seguimiento.dc.html` |
| 43 | Móvil · Direcciones | `/cuenta/direcciones (móvil)` | — | `prototipos/Movil-20-Direcciones.dc.html` |
| 44 | Móvil · Lista de deseos | `/cuenta/deseos (móvil)` | — | `prototipos/Movil-21-ListaDeseos.dc.html` |
| 45 | Móvil · Datos y privacidad | `/cuenta/datos (móvil)` | — | `prototipos/Movil-22-Datos.dc.html` |
| 46 | Móvil · Devolución | `/cuenta/pedidos/:id/devolucion (móvil)` | — | `prototipos/Movil-23-Devolucion.dc.html` |
| 47 | Móvil · Escribir reseña | `/producto/:sku/resena (móvil)` | — | `prototipos/Movil-24-Resena.dc.html` |

### Administración y sucursal

| # | Pantalla | Ruta sugerida | Componentes | Prototipo |
|---|---|---|---|---|
| 48 | Admin · Resumen | `/admin` | AdminLayout, KpiCard, AlertList, BarChart | `prototipos/Admin-1-Resumen.dc.html` |
| 49 | Admin · Productos | `/admin/productos` | DataTable, StatusFilterChips | `prototipos/Admin-2-Productos.dc.html` |
| 50 | Admin · Editar producto y variantes | `/admin/productos/:id` | ProductForm, VariantTable, regla: no publicar sin variante con precio y stock | `prototipos/Admin-3-Producto.dc.html` |
| 51 | Admin · Categorías | `/admin/categorias` | CategoryTree (role=tree, 3 niveles), CategoryForm | `prototipos/Admin-4-Categorias.dc.html` |
| 52 | Admin · Pedidos | `/admin/pedidos` | DataTable, StatusFilterChips | `prototipos/Admin-5-Pedidos.dc.html` |
| 53 | Admin · Detalle de pedido | `/admin/pedidos/:id` | StatusChanger (solo transiciones válidas), WebhookLog, AuditLog | `prototipos/Admin-6-Pedido.dc.html` |
| 54 | Admin · Usuarios y roles | `/admin/usuarios` | DataTable con RoleSelect y Unlock | `prototipos/Admin-7-Usuarios.dc.html` |
| 55 | Admin · Reportes | `/admin/reportes` | PeriodTabs, KpiCard, HorizontalBars, exportar CSV | `prototipos/Admin-8-Reportes.dc.html` |
| 56 | Admin · Configuración | `/admin/configuracion` | FeatureFlagSwitch, ShippingRates, SecuritySettings | `prototipos/Admin-9-Configuracion.dc.html` |
| 57 | Sucursal · Inventario | `/sucursal/inventario` | StockAdjustTable con motivo | `prototipos/Sucursal-1-Inventario.dc.html` |
| 58 | Sucursal · Pedidos para recolección | `/sucursal/recoleccion` | KanbanColumns | `prototipos/Sucursal-2-Recoleccion.dc.html` |
| 59 | Sucursal · Entregar pedido (móvil) | `/sucursal/entrega (móvil)` | PickupVerify por pasos | `prototipos/Sucursal-3-Entrega.dc.html` |
