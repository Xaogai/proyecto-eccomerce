# Plan de implementación del frontend

Estado: **borrador, pendiente de aprobación.**
Alcance: las 58 pantallas de `docs/diseno/README.md` (todas menos la 01, que es la checklist, y la 38, que es plantilla de correo del backend).

---

## 0. Punto de partida

**Lo que ya hay en `frontend/`**

- Vite 8 + React 19 + TypeScript 6, con la plantilla por defecto de Vite (contador, logos, `App.css`, `index.css`, `assets/hero.png`). Todo eso se borra.
- Dependencias ya instaladas: `react-router-dom` 7, `@tanstack/react-query` 5, `axios`.
- Pruebas ya instaladas: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@playwright/test`. Falta configurarlas: no hay `vitest.config`, `setupTests` ni `playwright.config`.
- Lint: `oxlint` con reglas de hooks. Formato: `prettier`, todavía sin archivo de configuración.
- `index.html` tiene `lang="en"` y título `frontend`. Hay que cambiarlo a `lang="es"` (F5).

**Lo que hay en el backend**

`backend/services/` tiene 7 microservicios (cart, catalog, checkout, inventory, payments, shipping, users), todavía vacíos. No hay gateway. El frontend siempre llama a `/api/v1/...` en el mismo origen. En desarrollo, el proxy de Vite manda cada prefijo al servicio que le toca; en producción lo resuelve el gateway o el proxy inverso.

**Dependencias nuevas (instaladas el 17 oct 2026)**

| Paquete | Para qué |
|---|---|
| `@fontsource/barlow`, `@fontsource/barlow-condensed` | Fuentes del sistema Taller (las indica `tokens.css`) |
| `msw` | Datos simulados (sección 5) |
| `react-hook-form` + `zod` + `@hookform/resolvers` | Formularios con validación por campo y los mismos esquemas para tipos y mocks |
| `@axe-core/playwright` | Revisión automática de accesibilidad en las pruebas e2e |
| `@faker-js/faker` (solo dev) | Generar catálogos grandes en los mocks (paginación, tablas del admin) |

No propongo Tailwind ni librerías de componentes: los tokens ya son variables CSS y el diseño es propio. Los estilos van en **CSS Modules** (`Componente.module.css`), que Vite soporta sin configurar nada.

---

## 1. Estructura de carpetas

```
frontend/
├─ index.html                     lang="es", título, favicon
├─ vite.config.ts                 proxy /api → servicios, alias @/
├─ vitest.config.ts · playwright.config.ts
├─ public/
│  └─ mockServiceWorker.js        lo genera `npx msw init public/`
├─ e2e/                           pruebas Playwright (flujos completos + axe)
└─ src/
   ├─ main.tsx                    arranca MSW si VITE_MOCKS=true y monta <App/>
   ├─ app/
   │  ├─ App.tsx                  QueryClientProvider + AuthProvider + RouterProvider
   │  ├─ router.tsx               todas las rutas (lazy por sección)
   │  ├─ queryClient.ts
   │  └─ providers/               AuthProvider, StoreProvider (sucursal y CP), FeatureFlagsProvider
   ├─ styles/
   │  ├─ tokens.css               copia de docs/diseno/tokens.css (única fuente de color y tipografía)
   │  ├─ reset.css · base.css     body, tipografía base, .sr-only, utilidades de layout
   │  └─ breakpoints.ts           los 5 puntos de quiebre de la sec. 27.4 para JS (useMediaQuery)
   ├─ api/
   │  ├─ client.ts                instancia de axios + interceptores JWT
   │  ├─ endpoints.ts             rutas /api/v1 en un solo lugar
   │  ├─ errors.ts                ApiError tipado (status, code, fieldErrors)
   │  └─ schemas/                 esquemas zod de cada recurso (Product, Variant, Cart, Order…)
   ├─ features/                   un módulo por dominio
   │  ├─ catalog/                 api.ts (hooks de React Query), components/, pages/
   │  ├─ search/
   │  ├─ cart/
   │  ├─ checkout/
   │  ├─ orders/
   │  ├─ auth/
   │  ├─ account/                 direcciones, deseos, datos ARCO, devoluciones
   │  ├─ reviews/
   │  ├─ tools/                   comparador, vista 360°, calculadora, sucursales
   │  ├─ admin/
   │  └─ branch/                  sucursal: inventario, recolección, entrega
   ├─ components/                 componentes reutilizables sin lógica de dominio (sección 3)
   │  ├─ ui/                      Button, TextField, Badge, Dialog…
   │  ├─ layout/                  Header, Footer, CategoryNav, AccountNav, AdminNav…
   │  └─ feedback/                EmptyState, ErrorState, Skeleton, QueueState, Toast
   ├─ hooks/                      useMediaQuery, useDebounce, useFocusTrap, useLiveAnnouncer
   ├─ lib/                        format.ts (moneda MXN, fechas es-MX), storage.ts, orderStatus.ts
   ├─ mocks/                      capa MSW (sección 5)
   └─ test/                       setupTests.ts, render con providers, utilidades
```

Reglas:

- Una página solo importa de su `feature/`, de `components/`, `hooks/` y `lib/`. Un feature no importa de otro, salvo `cart` y `auth`, que exponen sus hooks públicos (`useCart`, `useAuth`).
- Componentes en PascalCase `.tsx`, hooks `useX.ts`, estilos `X.module.css` junto al componente, pruebas `X.test.tsx` junto al componente.
- Hay una sola pantalla por ruta. Escritorio y móvil salen del mismo componente con CSS mobile-first (regla 6 del README). Solo se cambia de componente con `useMediaQuery` cuando el patrón de interacción es otro: panel lateral contra `FiltersSheet`, `CompareBar` contra barra fija, `OrderTimeline` horizontal contra vertical.

---

## 2. Rutas y layouts

Se usa el *data router* de React Router 7 (`createBrowserRouter`). Cada sección carga con `lazy()` para que el sitio público no descargue el código del admin.

### Layouts

| Layout | Contiene | Usado por |
|---|---|---|
| `ShopLayout` | Enlace "Saltar al contenido", `Header` (logo, `SearchCombobox`, sucursal y CP, cuenta, carrito con contador), `CategoryNav` desde 769 px, `<main id="contenido">`, `Footer` con aviso de privacidad, envíos, plazos y devoluciones (G1, G3) | Inicio, catálogo, ficha, carrito, herramientas |
| `CheckoutLayout` | Header reducido (logo y "Compra segura"), sin navegación de categorías, Footer | `/checkout`, confirmación |
| `AuthLayout` | Header mínimo y una columna centrada | Login, registro, restablecer contraseña |
| `AccountLayout` | Hereda de `ShopLayout` y agrega `AccountNav` (lateral en escritorio, lista en móvil) | `/cuenta/*` |
| `AdminLayout` | Barra superior oscura y `AdminNav` lateral de 7 entradas | `/admin/*` |
| `BranchLayout` | Barra superior con el nombre de la sucursal, navegación de 3 entradas | `/sucursal/*` |

### Guardas

- `RequireAuth`: si no hay sesión, manda a `/cuenta/login?next=<ruta>`.
- `RequireRole roles={['admin']}` o `['staff','admin']`: si el rol no alcanza, muestra la página 403.
- `GuestOnly`: login y registro mandan a `/cuenta` si ya hay sesión.
- `/checkout` **no** pide sesión (B3: compra como invitado).

### Mapa de rutas

| Ruta | Página | Layout | Acceso | Pantallas |
|---|---|---|---|---|
| `/` | `HomePage` | Shop | público | 15, 21 |
| `/departamentos` | `DepartmentsPage` (drill-down de 3 niveles; en escritorio redirige a `/`) | Shop | público | 22 |
| `/categoria/:slug` | `CategoryPage` (filtros, orden y página en la URL: `?marca=volta&orden=precio&page=2`) | Shop | público | 02, 07, 09, 16, 23 |
| `/buscar?q=` | `SearchPage` | Shop | público | 08, 16, 23 |
| `/producto/:sku` | `ProductPage` (+ modal `Viewer360` con `?vista=360`) | Shop | público | 03, 10, 18, 25 |
| `/producto/:sku/resena` | `WriteReviewPage` | Shop | cliente | 37, 47 |
| `/comparar?skus=a,b,c` | `ComparePage` | Shop | público, flag `cmp` | 17, 24 |
| `/calculadora/:tipo?` | `CalculatorPage` (pintura, piso, taquetes) | Shop | público, flag `calc` | 19, 26 |
| `/sucursales` | `StoresPage` | Shop | público | 20, 27 |
| `/carrito` | `CartPage` | Shop | público | 04, 11 |
| `/checkout` | `CheckoutPage` | Checkout | público | 05, 12 |
| `/pedido/:id/confirmacion` | `ConfirmationPage` | Checkout | dueño del pedido o token de invitado | 06, 13 |
| `/cuenta/login` | `LoginPage` | Auth | solo invitados | 28, 39 |
| `/cuenta/registro` | `RegisterPage` | Auth | solo invitados | 14, 29 |
| `/cuenta/restablecer` · `/cuenta/restablecer/:token` | `ResetPasswordPage` (B6, sin diseño todavía) | Auth | público | — |
| `/cuenta` | `AccountHomePage` | Account | cliente | 30, 40 |
| `/cuenta/pedidos` | `OrdersPage` | Account | cliente | 31, 41 |
| `/cuenta/pedidos/:id` | `OrderTrackingPage` | Account | cliente | 32, 42 |
| `/cuenta/pedidos/:id/devolucion` | `ReturnRequestPage` | Account | cliente | 36, 46 |
| `/cuenta/direcciones` | `AddressesPage` | Account | cliente | 33, 43 |
| `/cuenta/deseos` | `WishlistPage` | Account | cliente | 34, 44 |
| `/cuenta/datos` | `PrivacyDataPage` | Account | cliente | 35, 45 |
| `/admin` | `AdminDashboardPage` | Admin | admin | 48 |
| `/admin/productos` · `/admin/productos/:id` (o `nuevo`) | `AdminProductsPage` · `AdminProductEditPage` | Admin | admin | 49, 50 |
| `/admin/categorias` | `AdminCategoriesPage` | Admin | admin | 51 |
| `/admin/pedidos` · `/admin/pedidos/:id` | `AdminOrdersPage` · `AdminOrderDetailPage` | Admin | admin | 52, 53 |
| `/admin/usuarios` | `AdminUsersPage` | Admin | admin | 54 |
| `/admin/reportes` | `AdminReportsPage` | Admin | admin | 55 |
| `/admin/configuracion` | `AdminSettingsPage` | Admin | admin | 56 |
| `/sucursal/inventario` | `BranchInventoryPage` | Branch | staff, admin | 57 |
| `/sucursal/recoleccion` | `BranchPickupPage` | Branch | staff, admin | 58 |
| `/sucursal/entrega/:id?` | `BranchHandoverPage` | Branch | staff, admin | 59 |
| `*` | `NotFoundPage` | Shop | público | — |

Cada ruta tiene un `errorElement` que muestra `ErrorState` con "Reintentar". Al cambiar de ruta, el foco pasa al `<h1>` y `document.title` se actualiza con un hook `usePageTitle`.

---

## 3. Componentes reutilizables

Todos usan solo variables de `tokens.css`, tienen área táctil de `--tactil-min` o más, foco visible y una prueba unitaria con Testing Library.

### 3.1 Base (`components/ui/`)

| Componente | Notas |
|---|---|
| `Button` | Variantes `primary` (naranja), `secondary` (carbón), `ghost` (separador) y `danger`. Tamaños `md` (46 px) y `lg` (52 px). Con `loading` muestra `aria-busy` y deja el ancho fijo. `asChild` para usarlo como `Link`. |
| `IconButton` | Pide `aria-label`. 44×44 px. |
| `TextField` · `Select` · `Textarea` | Siempre con `label` visible, `hint` y `error`. El error se enlaza con `aria-describedby` y `aria-invalid`. Funcionan con react-hook-form vía `forwardRef`. |
| `FieldError` | Texto rojo con icono y `id` para `aria-describedby`. |
| `Checkbox` · `RadioGroup` · `Switch` | Controles nativos con estilo propio. `Switch` es `role="switch"` (feature flags). |
| `QuantityStepper` | − / input numérico / +, con mínimo, máximo (stock) y anuncio del valor. |
| `Badge` | Tonos `ok`, `aviso`, `error`, `info` y `neutro`. |
| `StatusBadge` | Recibe el estado del pedido y saca etiqueta y tono de `lib/orderStatus.ts` (sección 3.4). |
| `StockLabel` | Disponible, pocas piezas, agotado o solo envío, con color e icono (no depende solo del color). |
| `Price` | Formato MXN en `--font-display`. Tamaños tarjeta y ficha. Precio anterior opcional. |
| `Chip` · `ChipGroup` | Filtros activos removibles y filtros por estado (`StatusFilterChips`). |
| `Tabs` | Patrón ARIA de pestañas con flechas del teclado (Calculadora, Reportes, Sucursales móvil). |
| `Accordion` | `button` + `aria-expanded` (ficha móvil, filtros). |
| `Dialog` · `Sheet` | `<dialog>` nativo con foco atrapado y regreso del foco. `Sheet` ocupa la pantalla completa en móvil (FiltersSheet). |
| `InlineConfirm` | "¿Eliminar? Sí / No" en línea, sin modal (Direcciones). |
| `Toast` + `useToast` | Mensajes en región `aria-live="polite"`. |
| `Pagination` | `nav` con `aria-label`, página actual con `aria-current="page"`. |
| `Breadcrumbs` | `nav` + `ol`, último elemento con `aria-current`. |
| `DataTable` | Tabla semántica con `th scope`, orden por columna (`aria-sort`), selección opcional, estados vacío y cargando. En móvil hace scroll horizontal dentro de un contenedor con foco. |
| `Stepper` | Formularios por pasos (Devolución, Entrega en sucursal). |
| `StarRating` | Lectura: estrellas con texto oculto. Escritura: grupo de radios (pantalla 37). |
| `VisuallyHidden` · `SkipLink` · `LiveRegion` | Utilidades de accesibilidad. |

### 3.2 Estados (`components/feedback/`)

`Skeleton` (tarjeta, línea, tabla), `EmptyState` (icono, título, texto y acción), `ErrorState` (error de conexión con reintentar), `QueueState` (fila de espera del checkout, flag `queue`), `Spinner` (solo en botones).

### 3.3 Componentes de dominio (en su `feature/`)

| Feature | Componentes |
|---|---|
| layout | `Header`, `HeaderMovil` (el mismo `Header` con CSS), `CategoryNav`, `Footer`, `StoreSelector` (sucursal y CP), `CartLink` |
| catalog | `ProductCard` (vertical y `horizontal` en móvil), `ProductGrid`, `FacetFilters`, `FiltersSheet`, `FiltersButton`, `ActiveFilterChips` (con aviso en `aria-live`, A6), `SortSelect`, `CompareBar`, `Hero`, `DepartmentGrid`, `DepartmentDrilldown` |
| search | `SearchCombobox` (patrón ARIA combobox con sugerencias, búsqueda con debounce de 250 ms) |
| product | `Gallery`, `VariantSelector` (cambia precio, SKU y stock, A3), `FulfillmentPicker`, `SpecsTable`, `Reviews`, `StickyAddToCart`, `Viewer360` |
| cart | `CartLine`, `OutOfStockNotice`, `OrderSummary`, `StickySummary` |
| checkout | `ContactForm`, `AddressForm`, `StorePicker` (sucursales con stock, D2), `ShippingQuote` (costo por CP, D1), `PaymentNotice` (texto de la pasarela hospedada; **sin campos de tarjeta**) |
| orders | `PaymentStatus` (pendiente, pagado o rechazado), `OrderTimeline` (horizontal y vertical), `OrderRow`, `OrderItems`, `PickupCode`, `ActiveOrderBanner` |
| auth | `LoginForm` (normal, error o bloqueada), `RegisterForm`, `PrivacyConsent`, `PasswordField` (mostrar u ocultar) |
| account | `AccountNav`, `AddressCard`, `ProfileForm`, `ConsentToggles`, `ArcoRequest`, `DeleteAccount`, `ReturnForm` |
| reviews | `ReviewForm` |
| tools | `CompareTable` ("solo diferencias"), `CalculatorForm`, `ResultPanel`, `StoreList`, `MapPlaceholder` |
| admin | `AdminNav`, `KpiCard`, `AlertList`, `BarChart` y `HorizontalBars` (SVG propio con tabla equivalente oculta), `ProductForm`, `VariantTable`, `ImageUploader` (pide `alt`, F4), `CategoryTree` (`role="tree"`), `CategoryForm`, `StatusChanger`, `WebhookLog`, `AuditLog`, `RoleSelect`, `PeriodTabs`, `CsvExportButton`, `FeatureFlagSwitch`, `ShippingRates`, `SecuritySettings` |
| branch | `StockAdjustTable` (con motivo obligatorio), `KanbanColumns`, `PickupVerify` |

### 3.4 Estados de pedido (fuente única)

`lib/orderStatus.ts` concentra la etiqueta, el tono del badge, el grupo ("en curso" o "terminado") y las **transiciones válidas** (I3) que usan `StatusBadge`, `OrderTimeline`, `StatusChanger` y los mocks:

`creado → pendiente_pago → pagado → en_preparacion → (listo_para_recoger | enviado) → entregado`, más `incidencia`, `reembolsado` y `cancelado`, con las transiciones del prototipo `Admin-6-Pedido`.

---

## 4. Estado, API y autenticación

### 4.1 Qué estado vive dónde

| Tipo de estado | Herramienta | Ejemplos |
|---|---|---|
| Datos del servidor | **React Query** | catálogo, ficha, carrito, pedidos, admin |
| Estado de la URL | **React Router** (`useSearchParams`) | filtros, orden, página, búsqueda, comparador, pestaña |
| Sesión | **`AuthProvider`** (Context) | usuario, rol, access token en memoria |
| Preferencias del visitante | Context + `localStorage` | sucursal elegida, CP, SKUs en comparación |
| Estado local de UI | `useState` / `useReducer` | paso del formulario, modal abierto |

No hace falta Redux ni Zustand: lo que queda fuera de React Query es poco y cabe en dos contextos.

### 4.2 Capa de API

- `api/client.ts`: una instancia de axios con `baseURL: import.meta.env.VITE_API_URL ?? '/api/v1'` y `withCredentials: true`.
- Cada feature tiene un `api.ts` con funciones (`getProducts`, `addCartItem`) y hooks (`useProducts`, `useAddCartItem`). Las páginas nunca llaman a axios directamente.
- Las respuestas se validan con zod en desarrollo (`schema.parse`). Los tipos TypeScript salen de los esquemas (`z.infer`). Si el backend publica OpenAPI, después se puede generar con `openapi-typescript` y comparar contra estos esquemas.
- Claves de query por convención: `['products', { category, page, filters }]`, `['product', sku]`, `['cart']`, `['orders', filtro]`.
- `ApiError` normaliza los errores de FastAPI (`422` con `detail[]`) en `fieldErrors` para pintarlos con `setError` de react-hook-form.
- Valores de `QueryClient`: `staleTime` de 60 s en catálogo y 0 en carrito y pedidos, `retry` 1, sin reintentos en 4xx.
- Mutaciones del carrito con actualización optimista y vuelta atrás si falla (C2).

### 4.3 Autenticación con JWT

**Decisión:** mientras se trabaja con MSW, el refresh token se guarda en `sessionStorage`. La cookie `HttpOnly` se implementa en la fase 7, cuando se conecte el backend real. Para que ese cambio no toque el resto del código, todo pasa por un adaptador `api/tokenStorage.ts` con tres funciones: `getRefreshToken()`, `setRefreshToken()` y `clear()`. Al pasar a la cookie, esas funciones quedan vacías porque el navegador manda la cookie solo, y nada más cambia.

1. `POST /auth/login` responde `{ access_token, refresh_token, user }`. **Ahora:** el `refresh_token` va a `tokenStorage` (`sessionStorage`). **Fase 7:** el backend lo manda en una cookie `HttpOnly; Secure; SameSite=Strict` y deja de venir en el cuerpo.
2. El **access token se guarda solo en memoria** (en el `AuthProvider` y en una variable del módulo `client.ts`), nunca en `localStorage`.
3. Interceptor de petición: agrega `Authorization: Bearer <token>`.
4. Interceptor de respuesta: ante un `401`, llama a `POST /auth/refresh` **una sola vez**. Las peticiones que fallen mientras tanto esperan en cola esa misma promesa y se repiten con el token nuevo. Si el refresh falla, se cierra la sesión y se manda a login con `?next=`.
5. Al cargar la app, `AuthProvider` intenta un refresh silencioso. Mientras tanto, las rutas protegidas muestran un `Skeleton`, no redirigen.
6. El rol (`cliente`, `staff`, `admin`) se lee del objeto `user` que da la API, no decodificando el JWT en el cliente. Las guardas son solo de UX: la autorización real la hace el backend.
7. Bloqueo por intentos fallidos (B4): si la API responde `423` (o `403` con `code: "account_locked"`), `LoginForm` muestra el estado "bloqueada" con el tiempo restante.
8. Cerrar sesión: `POST /auth/logout` (borra la cookie), `queryClient.clear()` y se vuelve al inicio.
9. Carrito de invitado: el backend identifica el carrito con una cookie o un `cart_id`. Al iniciar sesión se llama a `POST /cart/merge`. En la confirmación, el invitado ve su pedido con un token firmado en la URL.

`sessionStorage` es aceptable para desarrollo con datos simulados, pero no para producción, porque un XSS podría leer el token. Por eso el paso a la cookie es una tarea obligatoria de la fase 7, no algo opcional.

### 4.4 Pago (PCI SAQ A)

`POST /checkout` responde `{ order_id, payment_url }` y el frontend hace `window.location.assign(payment_url)`. La pasarela regresa a `/pedido/:id/confirmacion`, que consulta `GET /orders/:id` cada 3 s (`refetchInterval`) mientras el estado sea `pendiente_pago`, hasta un máximo de 2 min. Después de eso muestra "seguimos confirmando, te avisaremos por correo" (D4). El rechazado ofrece "Reintentar pago" (D5). Ningún componente tiene inputs de tarjeta, y una prueba e2e lo verifica.

---

## 5. Datos simulados con MSW

**Objetivo:** avanzar pantalla por pantalla sin backend, con el mismo código que irá a producción. El cambio a la API real es una variable de entorno.

```
src/mocks/
├─ browser.ts           setupWorker(...handlers)  → navegador (npm run dev:mock)
├─ server.ts            setupServer(...handlers)  → Vitest
├─ handlers/
│  ├─ index.ts          junta todos
│  ├─ catalog.ts        categories, products (filtros, orden, paginación), product/:sku, search/suggest
│  ├─ cart.ts           GET/POST/PATCH/DELETE cart, merge
│  ├─ checkout.ts       checkout, shipping/quote, stores?sku=
│  ├─ auth.ts           register, login, refresh, logout, reset
│  ├─ orders.ts         orders, orders/:id (avanza solo de pendiente a pagado), returns
│  ├─ account.ts        addresses, wishlist, profile, consents, arco
│  ├─ reviews.ts
│  ├─ admin.ts          products, variants, categories, orders/:id/status, users, reports, settings
│  └─ branch.ts         inventory, pickups, handover
├─ db/                  "base de datos" en memoria
│  ├─ seed.ts           datos de los prototipos (Volta, Brava, Ferro, Toluca Centro, folios 104xx…) + faker para volumen
│  └─ store.ts          colecciones mutables + reset() entre pruebas
└─ scenarios.ts         escenarios forzados por query o localStorage
```

- **Datos semilla:** se copian de los `<script>` de `docs/diseno/prototipos/*.dc.html` para que las pantallas se vean igual que el diseño (mismos productos, variantes, sucursales, pedidos y usuarios), y se completan con faker hasta unos 120 productos para que la paginación y las tablas tengan volumen.
- **Base en memoria con estado:** agregar al carrito, cambiar el estado de un pedido o desbloquear un usuario cambia los datos y la UI lo refleja, igual que en los prototipos.
- **JWT simulado:** el mock emite tokens falsos con expiración corta (60 s) para probar el refresh. Usuarios de prueba: `cliente@ejemplo.com`, `staff@ejemplo.com`, `admin@ejemplo.com` (contraseña `Taller123`) y `bloqueada@ejemplo.com`, que siempre responde 423.
- **Escenarios** (sustituyen los "Tweaks" de los prototipos): `?mock=empty`, `?mock=error`, `?mock=slow` (2 s de retardo, para ver los skeletons), `?mock=queue`, `?mock=pago-rechazado`. Un panel flotante `MockPanel`, solo en dev, permite cambiarlos sin tocar la URL.
- **Contrato:** los handlers responden con los mismos esquemas zod de `api/schemas/`. Esa carpeta sirve como propuesta de contrato para el backend, y conviene exportarla a `docs/api/` cuando la acordemos.
- **Encendido:** `VITE_MOCKS=true` en `.env.development.local` o con el script `npm run dev:mock`. En `main.tsx` el worker se importa de forma dinámica, así nunca entra al build de producción.
- **Pruebas:** Vitest usa `server.ts` con `onUnhandledRequest: 'error'` y `db.reset()` en cada prueba. Playwright corre contra `dev:mock` para los e2e de la fase.

### Endpoints que hay que acordar con backend

El README solo lista 10. El contrato completo está en **[`docs/api/endpoints-propuestos.md`](../api/endpoints-propuestos.md)**: 52 endpoints (`EP-01` a `EP-52`) con lo que reciben y responden, las pantallas que los usan y su estado de seguimiento, además de los temas pendientes (`T-01` a `T-08`) y una bitácora de cambios. Los mocks implementan ese documento tal cual. Si backend cambia algo, se actualiza primero el documento, luego el esquema zod y al final el mock.

---

## 6. Fases

Se trabaja en la rama `feature/frontend`, con commits semánticos por pantalla o componente (`feat: listado por categoría`), y se integra a `main` por pull request con revisión de otro integrante (Documento de Calidad 10.1 y 15.1). Una fase se da por terminada cuando: todas sus pantallas coinciden con el PNG en 390 px y 1280 px, `npm run lint`, `tsc` y `vitest` pasan, y el e2e de la fase con axe sale sin violaciones serias ni críticas.

### Fase 0 · Cimientos

Sin pantallas de negocio. Deja todo listo para que las demás fases solo agreguen páginas.

- Limpiar la plantilla de Vite. `index.html` con `lang="es"`, título y favicon.
- Copiar `tokens.css` a `src/styles/`, instalar e importar las fuentes, `reset.css` y `base.css`.
- `vite.config.ts`: alias `@/` y proxy `/api`. Configurar Vitest, Playwright, Prettier y los scripts `dev:mock`, `test` y `e2e`.
- Router con todos los layouts y rutas, que por ahora muestran páginas *placeholder*. Guardas, `NotFoundPage`, `errorElement`, `usePageTitle` y foco al cambiar de ruta.
- `api/client.ts` con interceptores JWT, `AuthProvider`, `QueryClient` y `ApiError`.
- MSW: `browser.ts`, `server.ts`, `db/` con la semilla completa, `scenarios.ts` y `MockPanel`.
- Componentes base de 3.1 y 3.2, con sus pruebas. Una página interna `/_ui`, solo en dev, que los muestra todos (sirve de catálogo visual sin instalar Storybook).
- `Header`, `CategoryNav` y `Footer` terminados.

### Fase 1 · Catálogo y búsqueda

Pantallas: **15, 21** Inicio · **02, 07** Listado · **09** Filtros móvil · **08** Buscar · **03, 10** Ficha (sin 360°) · **22** Departamentos · **16, 23** Estados vacío, error y carga.
Requisitos: A1–A7, A12 (solo lectura de reseñas), A13, A14, C1, C5, G2, G3, E1–E4.

### Fase 2 · Carrito, checkout y confirmación

Pantallas: **04, 11** Carrito · **05, 12** Checkout (invitado y con sesión, envío y recolección) · **06, 13** Confirmación (pendiente, pagado o rechazado, con *polling*).
Requisitos: C2–C4, D1–D5, B3, G2. Es el flujo crítico: lleva el e2e más completo (compra completa solo con teclado y una prueba que confirma que no hay campos de tarjeta).

### Fase 3 · Cuenta del cliente

Pantallas: **28, 39** Login · **14, 29** Registro · Restablecer contraseña (sin diseño; se arma con los mismos componentes de Login) · **30, 40** Mi cuenta · **31, 41** Pedidos · **32, 42** Seguimiento · **33, 43** Direcciones · **34, 44** Deseos · **35, 45** Datos y ARCO · **36, 46** Devolución · **37, 47** Reseña.
Requisitos: B1, B2, B4–B6, D6, D9, A12. Aquí se prueba a fondo el refresh del JWT (mock con expiración corta) y el merge del carrito de invitado.

### Fase 4 · Herramientas

Pantallas: **17, 24** Comparador · **18, 25** Vista 360° · **19, 26** Calculadora (pintura completa; piso y taquetes según A10) · **20, 27** Sucursales.
Requisitos: A8–A11. Cada herramienta respeta su feature flag (`GET /feature-flags`). Si la 360° está apagada, la ficha muestra solo la galería.

### Fase 5 · Administración

Pantallas: **48** Resumen · **49** Productos · **50** Editar producto y variantes · **51** Categorías · **52** Pedidos · **53** Detalle de pedido · **54** Usuarios y roles · **55** Reportes · **56** Configuración.
Requisitos: I1–I6, F4. Reglas clave: no se puede publicar sin una variante con precio y stock (I2), solo transiciones válidas (I3) y las llaves de la pasarela nunca se muestran completas (I6).

### Fase 6 · Sucursal

Pantallas: **57** Inventario · **58** Pedidos para recolección · **59** Entregar pedido (móvil, por pasos).
Requisito: I7.

### Fase 7 · Integración y QA

- Apagar los mocks y conectar con los microservicios reales, servicio por servicio, según los vaya terminando backend. Esto puede empezar en paralelo desde la fase 2.
- **Refresh token en cookie `HttpOnly`:** cambiar `api/tokenStorage.ts` y quitar `refresh_token` del cuerpo de la respuesta (sección 4.3).
- Pasada completa de accesibilidad: axe en todas las rutas, navegación con teclado y apoyo a la prueba con NVDA y VoiceOver (D7).
- Rendimiento: `loading="lazy"` y `srcset` en imágenes, división de código por sección, presupuesto del bundle público por debajo de 200 kB gzip y Lighthouse en móvil (E6).
- Matriz de navegadores con Playwright en Chromium, Firefox y WebKit (E5).
- Apoyar las pruebas de usabilidad (H1–H3) con el sitio construido.

**Orden y dependencias:** 0 → 1 → 2 → 3 es la ruta crítica, porque permite una compra completa de punta a punta. Las fases 4, 5 y 6 no dependen entre sí y se pueden repartir entre varias personas cuando termine la 1 (la 5 y la 6 solo necesitan la base de la fase 0 y la autenticación de la fase 3).

---

## 7. Pruebas

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unitarias | Vitest + Testing Library | componentes base (roles, aria, teclado), `orderStatus`, formato de precios, esquemas zod |
| Integración | Vitest + MSW (`server.ts`) | páginas con datos: filtros que cambian la URL, carrito optimista, errores 422 en formularios, refresh del 401 |
| E2E | Playwright + `dev:mock` | un flujo por fase: compra como invitado, registro e inicio de sesión, cambio de estado en el admin, entrega en sucursal |
| Accesibilidad | `@axe-core/playwright` | todas las rutas en 390 px y 1280 px |

---

## 8. Decisiones

| # | Tema | Decisión |
|---|---|---|
| 1 | Refresh token | `sessionStorage` detrás de `api/tokenStorage.ts` mientras se usan mocks. La cookie `HttpOnly` se implementa en la fase 7, al conectar con el backend. |
| 2 | Dependencias | Instaladas: fontsource, react-hook-form, zod, @hookform/resolvers, msw, @axe-core/playwright y faker. |
| 3 | Estilos | CSS Modules con las variables de `tokens.css`. |
| 4 | Colores | Estandarizados en `docs/diseno/tokens.css`. Se agregaron los colores de los prototipos que faltaban, con nombre por uso. `#8E979F` pasa a `#868F98` y `#4A535C` pasa a `#656E78` para cumplir 3:1 en controles. |
| 5 | Tono de estados | Tabla al final de `tokens.css`: pagado = info, cancelado y reembolsado = neutro en todas las vistas, y el *resultado* del pago confirmado es ok. |
| 6 | Endpoints extra | Propuestos y con seguimiento en `docs/api/endpoints-propuestos.md`. Pendiente de revisar con backend. |
| 7 | Rama | Se trabaja directamente en `frontend`. |

Los prototipos HTML de `docs/diseno/` conservan los colores originales: son la referencia visual y no se editan. En el código manda `tokens.css`.
