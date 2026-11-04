# Contrato de API · propuesta del frontend

Estado: **implementado con el backend real** (4 nov 2026). Creado el 17 oct 2026. El frontend habla este contrato y `frontend/src/api/backend/` lo traduce a las rutas del backend (tabla **Rutas del backend** al final).

Este documento lista todo lo que el frontend necesita de `/api/v1` para cubrir las 58 pantallas de `docs/diseno/`. Los datos simulados (MSW, `frontend/src/mocks/`) implementan exactamente lo que dice aquí. Si un endpoint cambia, se actualiza **primero este documento**, luego el esquema zod (`frontend/src/api/schemas/`) y al final el mock y la pantalla.

## Cómo se da seguimiento

Cada endpoint tiene un ID (`EP-xx`) que no cambia aunque cambie la ruta. Su columna **Estado** tiene uno de estos valores:

| Estado | Significado |
|---|---|
| `Doc 13.1` | La ruta está en la sec. 13.1 del Documento de Calidad. La forma de los datos sigue siendo propuesta. |
| `Propuesto` | Lo propone el frontend; backend no lo ha revisado. |
| `Acordado` | Backend lo aceptó (ruta y forma). |
| `Cambiado` | Backend pidió un cambio; está en la bitácora y hay que ajustar el frontend. |
| `Implementado` | Ya existe en el backend real y el frontend está conectado (fase 7). |

Los temas abiertos que pueden mover varios endpoints a la vez están en la sección **Temas pendientes** (`T-xx`). Todo cambio se anota en la **Bitácora** al final.

## Convenciones comunes (propuestas)

- **Base:** `/api/v1`. JSON en UTF-8. Fechas en ISO 8601 UTC (`2026-10-16T14:30:00Z`). El frontend las muestra en es-MX.
- **Dinero:** entero en centavos MXN (`214900` = $2,149.00). Ver T-03.
- **Autenticación:** `Authorization: Bearer <access_token>`. En la columna **Auth**: `—` público, `C` cliente, `S` staff de sucursal, `A` administrador, `C/inv` cliente o invitado con token del pedido.
- **Paginación:** `?page=1&page_size=24` → `{ items: T[], page, page_size, total }`.
- **Errores:**
  - `422`: el formato estándar de FastAPI (`{ detail: [{ loc, msg, type }] }`), que el frontend pinta por campo.
  - Errores de negocio: `{ detail: { code, message } }`, con `code` estable en inglés (`account_locked`, `invalid_transition`, `out_of_stock`).
  - `401` sin token o token vencido, `403` sin permiso, `404`, `409` conflicto de estado.
- **Estados del pedido** (valores de la API): `creado`, `pendiente_pago`, `pagado`, `en_preparacion`, `listo_para_recoger`, `enviado`, `entregado`, `incidencia`, `cancelado`, `reembolsado`.
- **Roles:** `cliente`, `staff`, `admin`.

---

## 1. Catálogo y búsqueda · servicio `catalog`

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-01 | `GET /categories` | — | — | Árbol: `Category { id, slug, name, children: Category[] }` (3 niveles máx.) | 02, 15, 22 | Implementado |
| EP-02 | `GET /products` | — | `category`, `page` (Doc 13.1). **Propuestos:** `page_size`, `q`, `sort` (`relevancia`, `precio_asc`, `precio_desc`, `nuevo`, `calificacion`), `store_id`, `pickup_today` (solo con `store_id`), `price_min` y `price_max` (centavos), filtros `attr.<clave>=v1,v2` (la marca es `attr.brand`) | `Page<ProductSummary>` + `facets: [{ key, title, options: [{ value, label, count, selected }] }]` + `did_you_mean?` (corrección cuando no hay resultados). `ProductSummary { sku, variant_sku, name, brand, image, price, price_from?, variant_count, stock: { status, label }, rating }` | 02, 07, 08, 09, 15, 16 | Implementado |
| EP-03 | `GET /products/{sku}` | — | `store_id` opcional | `ProductDetail { sku, name, brand, description, category_path: [{ slug, name }], images: [{ url, alt }], images_360?: string[], variants: [{ sku, label, price, stock: { store_id, qty, status } }], specs: [{ k, v }], rating: { avg, count } }` | 03, 10, 18, 25 | Implementado |
| EP-04 | `GET /search/suggest?q=` | — | `q` (2+ caracteres) | `{ queries: string[], products: [{ sku, name, image }], categories: [{ slug, name }] }` | 08, encabezado | Implementado (se arma en el frontend) |
| EP-05 | `GET /products/{sku}/reviews` | — | `page`, `sort` | `Page<Review { id, author, rating, title, body, created_at, verified }>` + `summary { avg, count, by_star }` | 03, 10 | Implementado |
| EP-06 | `POST /products/{sku}/reviews` | C | `{ rating: 1–5, title, body, recommend }` | `201 { id, status: "en_moderacion" }` | 37, 47 | Implementado |
| EP-07 | `GET /products/compare?skus=a,b,c,d` | — | Hasta 4 SKU | `{ products: ProductSummary[], rows: [{ key, label, values: string[], differs: bool }] }` | 17, 24 | Implementado (se arma en el frontend) |

`ProductSummary { sku, name, brand, image: { url, alt }, price, price_from?, variant_count, stock: { status: "ok"|"low"|"out"|"ship_only", label }, rating }`

## 2. Sucursales y envío · servicios `inventory` y `shipping`

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-08 | `GET /stores` | — | `zip`, `sku` opcionales | `Store[] { id, name, address, zip, hours, phone, lat, lng, distance_km?, stock?: { qty, status } }` | 05, 12, 20, 27, encabezado | Implementado |
| EP-09 | `GET /shipping/quote?zip=` | — | `zip` (5 dígitos) | `{ zip, available, cost, eta_min_days, eta_max_days }`. `422` si el CP no es válido | 03, 04, 05, 12 | Implementado |

## 3. Carrito · servicio `cart`

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-10 | `GET /cart` | C/inv | identificador de carrito (T-01) | `Cart { id, items: CartItem[], subtotal, shipping?, total, warnings: [{ item_id, code }] }` | 04, 11, encabezado | Implementado |
| EP-11 | `POST /cart/items` | C/inv | `{ sku, qty }` | `Cart`. `409 out_of_stock` | 02, 03, 07, 10 | Implementado |
| EP-12 | `PATCH /cart/items/{id}` | C/inv | `{ qty }` | `Cart` | 04, 11 | Implementado |
| EP-13 | `DELETE /cart/items/{id}` | C/inv | — | `Cart` | 04, 11 | Implementado |
| EP-14 | `POST /cart/merge` | C | `{ guest_cart_id }` | `Cart` (une el carrito de invitado con el de la cuenta) | 28, 39 | Implementado |

`CartItem { id, sku, product_sku, name, variant_label, image, unit_price, price_valid_until, qty, max_qty, stock_status }`

## 4. Checkout, pago y pedidos · servicios `checkout` y `payments`

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-15 | `POST /checkout` | C/inv | `{ contact: { name, email, phone }, fulfillment: "ship"|"pickup", address?, store_id? }` | `201 { order_id, folio, payment_url, guest_token? }`. El frontend redirige a `payment_url` | 05, 12 | Implementado |
| EP-16 | `GET /orders/{id}` | C/inv (`?token=` para invitado) | — | `Order { id, folio, status, payment_status: "pendiente"|"pagado"|"rechazado", created_at, contact: { name, email, phone }, items, totals: { subtotal, shipping, total }, fulfillment: { type: "ship", address_label, tracking? } | { type: "pickup", store_id, store_name }, timeline: [{ status, at }], pickup_code? }` | 06, 13, 32, 42 | Implementado |
| EP-17 | `POST /orders/{id}/payment/retry` | C/inv | — | `{ payment_url }` | 06, 13 | Implementado |
| EP-18 | `GET /orders` | C | `status_group` (`curso`, `fin`), `page` | `Page<OrderSummary { id, folio, created_at, item_count, fulfillment_label, total, status }>` | 30, 31, 40, 41 | Implementado |
| EP-19 | `POST /orders/{id}/returns` | C | `{ items: [{ item_id, qty }], reason, comment, method: "tienda"|"recoleccion" }` | `201 Return { id, folio, status, instructions }` | 36, 46 | Implementado |

El webhook de la pasarela llega directo a `payments`; el frontend no lo llama.

## 5. Autenticación · servicio `users`

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-20 | `POST /auth/register` | — | `{ name, email, password (8+), privacy_accepted: true, marketing_opt_in }` | Igual que EP-21. `409 email_taken` | 14, 29 | Implementado |
| EP-21 | `POST /auth/login` | — | `{ email, password }` | `{ access_token, expires_in, refresh_token, user: { id, name, email, role } }`. `401 invalid_credentials` · `423 account_locked { retry_after_s }` | 28, 39 | Implementado |
| EP-22 | `POST /auth/refresh` | — | `{ refresh_token }` | `{ access_token, expires_in }` | todas | Implementado |
| EP-23 | `POST /auth/logout` | C | `{ refresh_token }` | `204` | cuenta | Implementado |
| EP-24 | `POST /auth/password/forgot` | — | `{ email }` | `202` siempre (no revela si el correo existe) | restablecer | Implementado |
| EP-25 | `POST /auth/password/reset` | — | `{ token, password }` | `204`. `410 token_expired` | restablecer | Implementado |
| EP-26 | `GET /me` | C | — | `User { id, name, email, role, branch_id?, branch_name? }` | todas (sesión) | Implementado |

## 6. Cuenta del cliente · servicio `users`

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-27 | `GET · POST /me/addresses` · `PATCH · DELETE /me/addresses/{id}` | C | `Address { alias, name, street, ext, int?, colony, zip, city, state, phone, references?, is_default }` | `Address[]` / `Address` | 05, 12, 33, 43 | Implementado |
| EP-28 | `GET · POST /me/wishlist` · `DELETE /me/wishlist/{sku}` | C | `{ sku }` | `ProductSummary[]` | 03, 34, 44 | Implementado |
| EP-29 | `GET · PATCH /me/profile` | C | `{ name, phone, birthdate? }` | `Profile` | 35, 45 | Implementado |
| EP-30 | `GET · PATCH /me/consents` | C | `{ marketing: bool, personalization: bool }` | `Consents` | 35, 45 | Implementado |
| EP-31 | `POST /me/arco` | C | `{ type: "acceso"|"rectificacion"|"cancelacion"|"oposicion", detail }` | `201 { folio, due_date }` | 35, 45 | Implementado |
| EP-32 | `DELETE /me` | C | `{ password }` | `202 { effective_date }`. `409 active_orders { orders: [{ id, folio, status }] }` si hay pedidos en curso | 35, 45 | Implementado |
| EP-53 | `POST /me/password` | C | `{ current, password (8+) }` | `204`. `422` si la actual no coincide | 35, 45 | Implementado |

## 7. Configuración pública

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-33 | `GET /feature-flags` | — | — | `{ v360, calc, cmp, rev, queue: bool }` | 03, 17, 19, 05 | Implementado |

## 8. Administración · varios servicios

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-34 | `GET /admin/dashboard` | A | `period` | `{ kpis: [{ key, label, value, delta }], alerts: [{ type, message, link }], sales_by_day: [{ date, total }] }` | 48 | Implementado |
| EP-35 | `GET /admin/products` | A | `status` (`publicado`, `borrador`, `agotado`), `q`, `category`, `page` | `Page<AdminProductRow>` | 49 | Implementado |
| EP-36 | `GET · POST /admin/products` · `GET · PATCH /admin/products/{id}` | A | `{ name, brand, category_id, description, specs }` | `AdminProduct` | 50 | Implementado |
| EP-37 | `POST /admin/products/{id}/publish` | A | — | `200`. `409 no_valid_variant` si no hay variante con precio y stock (I2) | 50 | Implementado |
| EP-38 | `POST · PATCH · DELETE /admin/products/{id}/variants[/{sku}]` | A | `{ sku, label, price, attributes, stock_by_store }` | `Variant` | 50 | Implementado |
| EP-39 | `POST /admin/products/{id}/images` | A | `multipart` con `file` y `alt` obligatorio (F4) | `{ url, alt }` | 50 | Implementado |
| EP-40 | `GET · POST /admin/categories` · `PATCH · DELETE /admin/categories/{id}` | A | `{ name, slug, parent_id }` | Árbol. `422 max_depth` si pasa de 3 niveles | 51 | Implementado |
| EP-41 | `GET /admin/orders` | A | `status`, `q`, `date_from`, `date_to`, `page` | `Page<AdminOrderRow>` | 52 | Implementado |
| EP-42 | `GET /admin/orders/{id}` | A | — | `Order` + `allowed_transitions: Status[]`, `webhook_log: [...]`, `audit_log: [{ at, from, to, actor }]` | 53 | Implementado |
| EP-43 | `POST /admin/orders/{id}/status` | A | `{ to, note? }` | `Order`. `409 invalid_transition` (I3) | 53 | Implementado |
| EP-44 | `GET /admin/users` · `PATCH /admin/users/{id}` | A | `role`, `q`, `page` / `{ role, branch_id }` | `Page<AdminUser { id, name, email, role, branch, last_login, locked }>` | 54 | Implementado |
| EP-45 | `POST /admin/users/{id}/unlock` | A | — | `AdminUser` | 54 | Implementado |
| EP-46 | `GET /admin/reports` · `GET /admin/reports/export.csv` | A | `period` (`hoy`, `7d`, `30d`, `12m`) | `{ kpis, top_products, by_category, inventory_low }` / archivo CSV | 55 | Implementado |
| EP-47 | `GET · PATCH /admin/settings` | A | `{ flags, shipping_rates: [...], security: { max_attempts, lock_minutes, session_minutes } }` | `Settings` (la llave de la pasarela viene enmascarada, `pk_…1234`; nunca completa, I6) | 56 | Implementado |

## 9. Sucursal · servicios `inventory` y `checkout`

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-48 | `GET /branch/inventory` | S | `q`, `status`, `page` (la sucursal sale del usuario) | `Page<{ sku, name, variant_label, qty, min_qty, status }>` | 57 | Implementado |
| EP-49 | `POST /branch/inventory/{sku}/adjust` | S | `{ delta, reason }` (motivo obligatorio) | Fila actualizada | 57 | Implementado |
| EP-50 | `GET /branch/pickups` | S | — | `{ pagado: Pickup[], en_preparacion: Pickup[], listo_para_recoger: Pickup[] }` | 58 | Implementado |
| EP-51 | `POST /branch/pickups/{id}/status` | S | `{ to: "en_preparacion"|"listo_para_recoger" }` | `Pickup`. `409 invalid_transition` | 58 | Implementado |
| EP-52 | `POST /branch/pickups/{id}/verify` · `POST /branch/pickups/{id}/handover` | S | `{ pickup_code }` / `{ pickup_code, id_checked: true }` | Resumen del pedido / `Order` entregado | 59 | Implementado |

---

## Temas pendientes

| ID | Tema | Afecta | Propuesta del frontend | Estado |
|---|---|---|---|---|
| T-01 | Cómo se identifica el carrito de un invitado | EP-10 a EP-15 | Cookie `cart_id` puesta por el servicio `cart`. Si no se puede, encabezado `X-Cart-Id` guardado en `localStorage`. | Abierto |
| T-02 | Refresh token en cookie `HttpOnly` | EP-21, EP-22, EP-23 | Por ahora viaja en el cuerpo y el frontend lo guarda en `sessionStorage` (`api/tokenStorage.ts`). En la fase 7 pasa a una cookie `HttpOnly; Secure; SameSite=Strict` y deja de venir en el JSON. | Aplazado a fase 7 |
| T-03 | Formato del dinero | todos los precios | Entero en centavos, para no tener errores de redondeo con flotantes. | Abierto |
| T-04 | Subida de imágenes | EP-39 | Subida directa a la API. Alternativa: URL prefirmada de MinIO (ya está en `docker-compose.yml`). | Abierto |
| T-05 | Qué servicio da las feature flags y la configuración | EP-33, EP-47 | Hoy no hay servicio de configuración; propongo `users` o un gateway. | Abierto |
| T-06 | ¿Hace falta un endpoint de comparación? | EP-07 | Ayuda a armar las filas de "solo diferencias". Si no se aprueba, el frontend hace varias llamadas a EP-03 y compara por su cuenta. | Abierto |
| T-07 | ¿El Resumen del admin es un endpoint propio o sale de reportes? | EP-34, EP-46 | Endpoint propio, porque el Resumen trae alertas que reportes no tiene. | Abierto |
| T-08 | No hay gateway: a qué servicio va cada prefijo | todos | Proxy de Vite en desarrollo: `/catalog`, `/products`, `/categories` y `/search` → `catalog`; `/cart` → `cart`; etc. En producción, gateway o proxy inverso. | Abierto |

## Rutas del backend

Qué ruta del backend atiende cada EP. Los nombres de campo del backend van en español y el dinero en pesos con dos decimales; la traducción convierte ambos.

| EP | Backend |
|---|---|
| EP-01 | `GET /categories` |
| EP-02 | `GET /products` (`category` es el id, `orden`, `sucursal_id`, `disponible_hoy`, `marca`, `atributo=clave:v1,v2`, `min_price`/`max_price` en pesos) |
| EP-03 | `GET /products/{sku}?sucursal_id=` |
| EP-04 | Sin ruta propia: `GET /products?q=` y el árbol de categorías |
| EP-05, EP-06 | `GET` y `POST /products/{sku}/resenas` |
| EP-07 | Sin ruta propia: `GET /products/{sku}` de cada producto |
| EP-08 | `GET /branches` y `GET /inventory/{sku}` |
| EP-09 | `GET /shipping/quote?zip=` |
| EP-10 a EP-13 | `GET /cart`, `POST /cart/items`, `PATCH` y `DELETE /cart/items/{sku}` (el id del renglón es el SKU) |
| EP-14 | `POST /cart/merge` |
| EP-15 | `POST /checkout` (pide sesión: no hay compra como invitado) |
| EP-16, EP-18 | `GET /orders/{id}` y `GET /orders` |
| EP-17 | `POST /orders/{id}/pago/reintentar` |
| EP-19 | `POST /orders/{id}/devoluciones` (multipart: `data` y `foto`) |
| EP-20 a EP-23 | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` |
| EP-24, EP-25 | `POST /auth/password-reset/request` y `/auth/password-reset/confirm` |
| EP-26, EP-29 | `GET` y `PUT /users/me` |
| EP-27 | `GET`, `POST /users/me/addresses`, `PATCH` y `DELETE /users/me/addresses/{id}` |
| EP-28 | `GET`, `POST /users/me/deseos` y `DELETE /users/me/deseos/{sku}` |
| EP-30 | `PATCH /users/me/consentimientos` |
| EP-31 | `POST /users/me/solicitudes-arco` |
| EP-32 | `DELETE /users/me` (con contraseña) |
| EP-53 | `POST /users/me/password` |
| EP-33 | `GET /funciones` |
| EP-34 | `GET /admin/dashboard` |
| EP-35 a EP-39 | `/admin/products`, `/admin/products/{id}`, `/publicar`, `/despublicar`, `/imagenes` |
| EP-40 | `/admin/categories` y `/admin/categories/{id}` |
| EP-41 a EP-43 | `GET /admin/orders`, `GET /admin/orders/{id}`, `POST /admin/orders/{id}/estado` (el estado `pagado` es `confirmado`) |
| EP-44, EP-45 | `GET /admin/users`, `PATCH /admin/users/{id}`, `POST /admin/users/{id}/desbloquear` |
| EP-46 | `GET /admin/reports?periodo=` y `/admin/reports/export.csv` |
| EP-47 | `GET` y `PATCH /admin/settings` |
| EP-48, EP-49 | `GET /sucursal/inventario` y `POST /sucursal/inventario/{sku}/ajuste` |
| EP-50 a EP-52 | `GET /sucursal/recolecciones`, `POST /sucursal/recolecciones/{id}/estado`, `/verificar` y `/{id}/entregar` |

## Bitácora de cambios

| Fecha | ID | Cambio | Motivo | Ajuste en el frontend |
|---|---|---|---|---|
| 2026-11-04 | todos | Conectado al backend real con una capa de traducción (`frontend/src/api/backend/`); el backend agrega las rutas que faltaban (tabla Rutas del backend) | Integración del frontend con el backend | Con el backend real el checkout pide iniciar sesión; los datos simulados y las pruebas siguen usando este contrato |
| 2026-10-17 | todos | Versión inicial de la propuesta | Cubrir las 58 pantallas con mocks | — |
| 2026-10-23 | todos los que devuelven `Image` | Campo opcional `srcset` (por ejemplo `…-320.webp 320w, …-640.webp 640w`) para que el navegador baje el tamaño que necesita. Si no viene, se usa `url` | Rendimiento de imágenes en móvil (E6, fase 7) | Ya reflejado en `imageSchema` y en `ProductImage` |
| 2026-10-23 | EP-48 a EP-52 | EP-48: filas con `aisle` y `reserved` (apartado por pedidos de recolección sin entregar), `counts` por estado (`low`, `out`) y `store { id, name }`; el admin elige la sucursal con `store_id`. EP-49: `reason` de una lista (`recepcion`, `conteo`, `danado`, `devolucion`) y `409 below_reserved` si el stock queda por debajo de lo apartado. EP-50: responde `{ store, to_prepare, ready, delivered_today }` con `location` (pasillos o estante), `late` (pagado hace más de 1 hora) y `allowed_transitions` por pedido. EP-52: `verify` pasa a `POST /branch/pickups/verify` con `{ pickup_code, order_id? }`, porque en mostrador solo se tiene el código; `handover` pide además `items_checked: true`. El código de entrega es de 4 dígitos | Salieron al construir el panel de sucursal (fase 6) | Ya reflejado en esquemas y mocks |
| 2026-10-22 | EP-34 a EP-47 | EP-34: KPI con `unit`, `note`, `tone` y `link`; alertas con `severity` (`alta`, `media`, `baja`), `title`, `detail` y `link`. EP-35: filas con `category_label`, `variant_count`, `price_from`, `stock_total` y `counts` por estado. EP-36: `PATCH` acepta la lista completa de `variants[{ sku?, label, price, stock_total }]` (el stock inicial va a la primera sucursal) en lugar de EP-38 por variante. EP-37: nuevo `POST /admin/products/{id}/unpublish` (pasar a borrador). EP-40: árbol con `product_count`; `DELETE` responde `409 not_empty` si tiene productos o subcategorías. EP-41: filtros `status_group` (`pago`, `prep`, `listos`, `inc`, `fin`), `store_id` y `days`, y `counts` por grupo. EP-42: `audit_log` con `note` opcional. EP-44: `branch_name`, `is_self` y `409 self_change` al cambiar el propio rol; staff requiere `branch_id`. EP-46: periodos `7d`, `30d` y `90d` (trimestre, como el prototipo); respuesta `{ period, from, to, kpis, by_category, branches }`. EP-47: `payment { provider, mode, key_hint }`, `shipping { rates, free_from }` y `security.reservation_minutes` | Salieron al construir el panel de administración (fase 5) | Ya reflejado en esquemas y mocks |
| 2026-10-22 | EP-07, EP-08 | EP-07: `store_id` opcional (agrega la fila "Recoger hoy"); filas con `key`, `label`, `values` y `differs`. EP-08: parámetro `q` (CP de 5 dígitos o texto: ciudad, colonia o nombre), campo `services: string[]` y `available_count` junto a `all_available` ("Tiene 2 de 3 productos") | Salieron al construir comparador y sucursales (fase 4) | Ya reflejado en esquemas y mocks |
| 2026-10-22 | EP-06, EP-16, EP-18, EP-19, EP-21, EP-28, EP-32, EP-53 | EP-16: `product_sku` por producto, `payment_label` ("tarjeta terminación 4821"), `return_deadline` y `returns[]`. EP-18: `page_size`. EP-19 en `multipart/form-data` (JSON en `data` y foto en `photo`, obligatoria si el motivo es dañado o incompleto). EP-21: `attempts_left` en el 401. EP-28: `saved_price` por producto. EP-32: `409 active_orders`. EP-53 nuevo: cambiar contraseña. EP-06 valida mínimo 20 caracteres | Salieron al construir la cuenta del cliente (fase 3) | Ya reflejado en esquemas y mocks |
| 2026-10-22 | EP-08, EP-10, EP-12, EP-13, EP-15 | EP-08: parámetro `skus=sku:cant,…` y campo `all_available` (sucursales con todo el pedido). EP-10/12/13: parámetro `store_id` y campo `store_stock { qty, status }` por producto. EP-15: `address_id` como alternativa a `address`, `409 out_of_stock { item_ids }`, `409 cart_empty` y `429 queue { position, progress, retry_after_s }` (fila de espera, 24.3) | Salieron al construir carrito y checkout (fase 2) | Ya reflejado en esquemas y mocks |
| 2026-10-22 | EP-02 | Parámetros `pickup_today`, `price_min`, `price_max` y `attr.brand`; campos `variant_sku` en `ProductSummary` (variante que agrega la tarjeta) y `did_you_mean` | Salieron al construir el listado, los filtros y la búsqueda (fase 1) | Ya reflejado en esquemas y mocks |
| 2026-10-17 | EP-03, EP-08, EP-10, EP-16, EP-26 | Campos agregados: `category_path` (migas de pan), `zip` de la sucursal, `product_sku` en el carrito (enlace a la ficha), `contact` y forma de `fulfillment` en el pedido (`tracking` pasa dentro de `fulfillment`), `branch_name` en el usuario (encabezado de sucursal) | Salieron al escribir los esquemas zod de la fase 0 | Ya reflejado en `frontend/src/api/schemas/` y en los mocks |
