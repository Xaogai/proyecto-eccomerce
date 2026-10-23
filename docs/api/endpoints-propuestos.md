# Contrato de API · propuesta del frontend

Estado: **propuesta, sin revisar con backend.** Creado el 17 oct 2026.

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
| EP-01 | `GET /categories` | — | — | Árbol: `Category { id, slug, name, children: Category[] }` (3 niveles máx.) | 02, 15, 22 | Doc 13.1 |
| EP-02 | `GET /products` | — | `category`, `page` (Doc 13.1). **Propuestos:** `page_size`, `q`, `sort` (`relevancia`, `precio_asc`, `precio_desc`, `nuevo`, `calificacion`), `store_id`, `pickup_today` (solo con `store_id`), `price_min` y `price_max` (centavos), filtros `attr.<clave>=v1,v2` (la marca es `attr.brand`) | `Page<ProductSummary>` + `facets: [{ key, title, options: [{ value, label, count, selected }] }]` + `did_you_mean?` (corrección cuando no hay resultados). `ProductSummary { sku, variant_sku, name, brand, image, price, price_from?, variant_count, stock: { status, label }, rating }` | 02, 07, 08, 09, 15, 16 | Doc 13.1 (parámetros extra propuestos) |
| EP-03 | `GET /products/{sku}` | — | `store_id` opcional | `ProductDetail { sku, name, brand, description, category_path: [{ slug, name }], images: [{ url, alt }], images_360?: string[], variants: [{ sku, label, price, stock: { store_id, qty, status } }], specs: [{ k, v }], rating: { avg, count } }` | 03, 10, 18, 25 | Doc 13.1 |
| EP-04 | `GET /search/suggest?q=` | — | `q` (2+ caracteres) | `{ queries: string[], products: [{ sku, name, image }], categories: [{ slug, name }] }` | 08, encabezado | Propuesto |
| EP-05 | `GET /products/{sku}/reviews` | — | `page`, `sort` | `Page<Review { id, author, rating, title, body, created_at, verified }>` + `summary { avg, count, by_star }` | 03, 10 | Propuesto |
| EP-06 | `POST /products/{sku}/reviews` | C | `{ rating: 1–5, title, body, recommend }` | `201 { id, status: "en_moderacion" }` | 37, 47 | Propuesto |
| EP-07 | `GET /products/compare?skus=a,b,c,d` | — | Hasta 4 SKU | `{ products: ProductSummary[], rows: [{ key, label, values: string[], differs: bool }] }` | 17, 24 | Propuesto (ver T-06) |

`ProductSummary { sku, name, brand, image: { url, alt }, price, price_from?, variant_count, stock: { status: "ok"|"low"|"out"|"ship_only", label }, rating }`

## 2. Sucursales y envío · servicios `inventory` y `shipping`

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-08 | `GET /stores` | — | `zip`, `sku` opcionales | `Store[] { id, name, address, zip, hours, phone, lat, lng, distance_km?, stock?: { qty, status } }` | 05, 12, 20, 27, encabezado | Propuesto |
| EP-09 | `GET /shipping/quote?zip=` | — | `zip` (5 dígitos) | `{ zip, available, cost, eta_min_days, eta_max_days }`. `422` si el CP no es válido | 03, 04, 05, 12 | Doc 13.1 |

## 3. Carrito · servicio `cart`

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-10 | `GET /cart` | C/inv | identificador de carrito (T-01) | `Cart { id, items: CartItem[], subtotal, shipping?, total, warnings: [{ item_id, code }] }` | 04, 11, encabezado | Doc 13.1 |
| EP-11 | `POST /cart/items` | C/inv | `{ sku, qty }` | `Cart`. `409 out_of_stock` | 02, 03, 07, 10 | Doc 13.1 |
| EP-12 | `PATCH /cart/items/{id}` | C/inv | `{ qty }` | `Cart` | 04, 11 | Propuesto |
| EP-13 | `DELETE /cart/items/{id}` | C/inv | — | `Cart` | 04, 11 | Propuesto |
| EP-14 | `POST /cart/merge` | C | `{ guest_cart_id }` | `Cart` (une el carrito de invitado con el de la cuenta) | 28, 39 | Propuesto |

`CartItem { id, sku, product_sku, name, variant_label, image, unit_price, price_valid_until, qty, max_qty, stock_status }`

## 4. Checkout, pago y pedidos · servicios `checkout` y `payments`

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-15 | `POST /checkout` | C/inv | `{ contact: { name, email, phone }, fulfillment: "ship"|"pickup", address?, store_id? }` | `201 { order_id, folio, payment_url, guest_token? }`. El frontend redirige a `payment_url` | 05, 12 | Doc 13.1 |
| EP-16 | `GET /orders/{id}` | C/inv (`?token=` para invitado) | — | `Order { id, folio, status, payment_status: "pendiente"|"pagado"|"rechazado", created_at, contact: { name, email, phone }, items, totals: { subtotal, shipping, total }, fulfillment: { type: "ship", address_label, tracking? } | { type: "pickup", store_id, store_name }, timeline: [{ status, at }], pickup_code? }` | 06, 13, 32, 42 | Propuesto |
| EP-17 | `POST /orders/{id}/payment/retry` | C/inv | — | `{ payment_url }` | 06, 13 | Propuesto |
| EP-18 | `GET /orders` | C | `status_group` (`curso`, `fin`), `page` | `Page<OrderSummary { id, folio, created_at, item_count, fulfillment_label, total, status }>` | 30, 31, 40, 41 | Propuesto |
| EP-19 | `POST /orders/{id}/returns` | C | `{ items: [{ item_id, qty }], reason, comment, method: "tienda"|"recoleccion" }` | `201 Return { id, folio, status, instructions }` | 36, 46 | Propuesto |

El webhook de la pasarela llega directo a `payments`; el frontend no lo llama.

## 5. Autenticación · servicio `users`

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-20 | `POST /auth/register` | — | `{ name, email, password (8+), privacy_accepted: true, marketing_opt_in }` | Igual que EP-21. `409 email_taken` | 14, 29 | Doc 13.1 |
| EP-21 | `POST /auth/login` | — | `{ email, password }` | `{ access_token, expires_in, refresh_token, user: { id, name, email, role } }`. `401 invalid_credentials` · `423 account_locked { retry_after_s }` | 28, 39 | Doc 13.1 (ver T-02) |
| EP-22 | `POST /auth/refresh` | — | `{ refresh_token }` | `{ access_token, expires_in }` | todas | Doc 13.1 (ver T-02) |
| EP-23 | `POST /auth/logout` | C | `{ refresh_token }` | `204` | cuenta | Propuesto |
| EP-24 | `POST /auth/password/forgot` | — | `{ email }` | `202` siempre (no revela si el correo existe) | restablecer | Propuesto |
| EP-25 | `POST /auth/password/reset` | — | `{ token, password }` | `204`. `410 token_expired` | restablecer | Propuesto |
| EP-26 | `GET /me` | C | — | `User { id, name, email, role, branch_id?, branch_name? }` | todas (sesión) | Propuesto |

## 6. Cuenta del cliente · servicio `users`

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-27 | `GET · POST /me/addresses` · `PATCH · DELETE /me/addresses/{id}` | C | `Address { alias, name, street, ext, int?, colony, zip, city, state, phone, references?, is_default }` | `Address[]` / `Address` | 05, 12, 33, 43 | Propuesto |
| EP-28 | `GET · POST /me/wishlist` · `DELETE /me/wishlist/{sku}` | C | `{ sku }` | `ProductSummary[]` | 03, 34, 44 | Propuesto |
| EP-29 | `GET · PATCH /me/profile` | C | `{ name, phone, birthdate? }` | `Profile` | 35, 45 | Propuesto |
| EP-30 | `GET · PATCH /me/consents` | C | `{ marketing: bool, personalization: bool }` | `Consents` | 35, 45 | Propuesto |
| EP-31 | `POST /me/arco` | C | `{ type: "acceso"|"rectificacion"|"cancelacion"|"oposicion", detail }` | `201 { folio, due_date }` | 35, 45 | Propuesto |
| EP-32 | `DELETE /me` | C | `{ password }` | `202 { effective_date }`. `409 active_orders { orders: [{ id, folio, status }] }` si hay pedidos en curso | 35, 45 | Propuesto |
| EP-53 | `POST /me/password` | C | `{ current, password (8+) }` | `204`. `422` si la actual no coincide | 35, 45 | Propuesto |

## 7. Configuración pública

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-33 | `GET /feature-flags` | — | — | `{ v360, calc, cmp, rev, queue: bool }` | 03, 17, 19, 05 | Propuesto (ver T-05) |

## 8. Administración · varios servicios

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-34 | `GET /admin/dashboard` | A | `period` | `{ kpis: [{ key, label, value, delta }], alerts: [{ type, message, link }], sales_by_day: [{ date, total }] }` | 48 | Propuesto (ver T-07) |
| EP-35 | `GET /admin/products` | A | `status` (`publicado`, `borrador`, `agotado`), `q`, `category`, `page` | `Page<AdminProductRow>` | 49 | Propuesto |
| EP-36 | `GET · POST /admin/products` · `GET · PATCH /admin/products/{id}` | A | `{ name, brand, category_id, description, specs }` | `AdminProduct` | 50 | Propuesto |
| EP-37 | `POST /admin/products/{id}/publish` | A | — | `200`. `409 no_valid_variant` si no hay variante con precio y stock (I2) | 50 | Propuesto |
| EP-38 | `POST · PATCH · DELETE /admin/products/{id}/variants[/{sku}]` | A | `{ sku, label, price, attributes, stock_by_store }` | `Variant` | 50 | Propuesto |
| EP-39 | `POST /admin/products/{id}/images` | A | `multipart` con `file` y `alt` obligatorio (F4) | `{ url, alt }` | 50 | Propuesto (ver T-04) |
| EP-40 | `GET · POST /admin/categories` · `PATCH · DELETE /admin/categories/{id}` | A | `{ name, slug, parent_id }` | Árbol. `422 max_depth` si pasa de 3 niveles | 51 | Propuesto |
| EP-41 | `GET /admin/orders` | A | `status`, `q`, `date_from`, `date_to`, `page` | `Page<AdminOrderRow>` | 52 | Propuesto |
| EP-42 | `GET /admin/orders/{id}` | A | — | `Order` + `allowed_transitions: Status[]`, `webhook_log: [...]`, `audit_log: [{ at, from, to, actor }]` | 53 | Propuesto |
| EP-43 | `POST /admin/orders/{id}/status` | A | `{ to, note? }` | `Order`. `409 invalid_transition` (I3) | 53 | Propuesto |
| EP-44 | `GET /admin/users` · `PATCH /admin/users/{id}` | A | `role`, `q`, `page` / `{ role, branch_id }` | `Page<AdminUser { id, name, email, role, branch, last_login, locked }>` | 54 | Propuesto |
| EP-45 | `POST /admin/users/{id}/unlock` | A | — | `AdminUser` | 54 | Propuesto |
| EP-46 | `GET /admin/reports` · `GET /admin/reports/export.csv` | A | `period` (`hoy`, `7d`, `30d`, `12m`) | `{ kpis, top_products, by_category, inventory_low }` / archivo CSV | 55 | Propuesto |
| EP-47 | `GET · PATCH /admin/settings` | A | `{ flags, shipping_rates: [...], security: { max_attempts, lock_minutes, session_minutes } }` | `Settings` (la llave de la pasarela viene enmascarada, `pk_…1234`; nunca completa, I6) | 56 | Propuesto |

## 9. Sucursal · servicios `inventory` y `checkout`

| ID | Endpoint | Auth | Envía | Responde | Pantallas | Estado |
|---|---|---|---|---|---|---|
| EP-48 | `GET /branch/inventory` | S | `q`, `status`, `page` (la sucursal sale del usuario) | `Page<{ sku, name, variant_label, qty, min_qty, status }>` | 57 | Propuesto |
| EP-49 | `POST /branch/inventory/{sku}/adjust` | S | `{ delta, reason }` (motivo obligatorio) | Fila actualizada | 57 | Propuesto |
| EP-50 | `GET /branch/pickups` | S | — | `{ pagado: Pickup[], en_preparacion: Pickup[], listo_para_recoger: Pickup[] }` | 58 | Propuesto |
| EP-51 | `POST /branch/pickups/{id}/status` | S | `{ to: "en_preparacion"|"listo_para_recoger" }` | `Pickup`. `409 invalid_transition` | 58 | Propuesto |
| EP-52 | `POST /branch/pickups/{id}/verify` · `POST /branch/pickups/{id}/handover` | S | `{ pickup_code }` / `{ pickup_code, id_checked: true }` | Resumen del pedido / `Order` entregado | 59 | Propuesto |

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

## Bitácora de cambios

| Fecha | ID | Cambio | Motivo | Ajuste en el frontend |
|---|---|---|---|---|
| 2026-10-17 | todos | Versión inicial de la propuesta | Cubrir las 58 pantallas con mocks | — |
| 2026-10-22 | EP-06, EP-16, EP-18, EP-19, EP-21, EP-28, EP-32, EP-53 | EP-16: `product_sku` por producto, `payment_label` ("tarjeta terminación 4821"), `return_deadline` y `returns[]`. EP-18: `page_size`. EP-19 en `multipart/form-data` (JSON en `data` y foto en `photo`, obligatoria si el motivo es dañado o incompleto). EP-21: `attempts_left` en el 401. EP-28: `saved_price` por producto. EP-32: `409 active_orders`. EP-53 nuevo: cambiar contraseña. EP-06 valida mínimo 20 caracteres | Salieron al construir la cuenta del cliente (fase 3) | Ya reflejado en esquemas y mocks |
| 2026-10-22 | EP-08, EP-10, EP-12, EP-13, EP-15 | EP-08: parámetro `skus=sku:cant,…` y campo `all_available` (sucursales con todo el pedido). EP-10/12/13: parámetro `store_id` y campo `store_stock { qty, status }` por producto. EP-15: `address_id` como alternativa a `address`, `409 out_of_stock { item_ids }`, `409 cart_empty` y `429 queue { position, progress, retry_after_s }` (fila de espera, 24.3) | Salieron al construir carrito y checkout (fase 2) | Ya reflejado en esquemas y mocks |
| 2026-10-22 | EP-02 | Parámetros `pickup_today`, `price_min`, `price_max` y `attr.brand`; campos `variant_sku` en `ProductSummary` (variante que agrega la tarjeta) y `did_you_mean` | Salieron al construir el listado, los filtros y la búsqueda (fase 1) | Ya reflejado en esquemas y mocks |
| 2026-10-17 | EP-03, EP-08, EP-10, EP-16, EP-26 | Campos agregados: `category_path` (migas de pan), `zip` de la sucursal, `product_sku` en el carrito (enlace a la ficha), `contact` y forma de `fulfillment` en el pedido (`tracking` pasa dentro de `fulfillment`), `branch_name` en el usuario (encabezado de sucursal) | Salieron al escribir los esquemas zod de la fase 0 | Ya reflejado en `frontend/src/api/schemas/` y en los mocks |
