# Changelog

Todos los cambios relevantes del proyecto se registran en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [No publicado]

### Agregado

- Alta de personal desde Usuarios y roles ("Invitar personal", pantalla 54): el admin crea staff (con sucursal) o admin, y la cuenta nace con una contraseña temporal que se ve una sola vez y no queda en la bitácora (`POST /api/v1/admin/users`).
- Cambio obligatorio de la contraseña temporal: al entrar, la persona va a "Crea tu contraseña" y el backend responde 403 `password_change_required` en todo lo demás hasta que la cambie (migración 0005).
- Desde la rama `backend`:
  - 100 productos más en los datos sintéticos (`catalog_seed_100.py`), y 30 pedidos y 25 registros de bitácora por operación sensible para el muestreo del plan de auditoría (AE-39).
  - Controles de PostgreSQL: roles con privilegio mínimo, restricciones CHECK y DEFAULT, clasificación de la información, triggers de auditoría por sentencia y 5 vistas.
  - CI del backend: búsqueda de secretos, `pip check` y reportes JUnit y de cobertura.
- Respaldos cifrados 3-2-1 (`POST /api/v1/admin/db-backup-321`, `GET /api/v1/admin/db-backups` y `python -m backend.shared.backups crear|restaurar`):
  - Volcado de todas las tablas, en SQLite o PostgreSQL, cifrado con AES-256-GCM. Sin `BACKUP_ENCRYPTION_KEY` no se genera.
  - Copia en `BACKUP_DIR` y en `BACKUP_OFFSITE_DIR`; solo cuenta como 3-2-1 si la segunda está en otro disco.
  - Cada respaldo se descifra y se restaura en una base de prueba antes de registrarlo en `respaldos_bd`. Restaurar sobre una base con datos pide `--reemplazar`.
- Migración 0004: bitácora de respaldos y, en PostgreSQL, los controles de auditoría (sin extensiones ni superusuario; reversible).
- Las contraseñas de los roles de PostgreSQL vienen de `DB_ROLE_*_PASSWORD` y se validan con la política (12 caracteres, mayúscula, minúscula, dígito y símbolo); sin ella el rol no puede iniciar sesión.
- CI: pruebas contra PostgreSQL 16 y del backend en Windows y macOS.
- `openapi.json` al día con los 76 endpoints, `python -m backend.gateway.export_openapi` para regenerarlo y una prueba que falla si queda atrasado.
- Integración del frontend con el backend real (EP-01 a EP-53):
  - Capa de traducción en `frontend/src/api/backend/`: las pantallas siguen usando el contrato y los datos simulados no cambian.
  - Backend: catálogo con facetas y stock por sucursal, reseñas, carrito con stock y unión del de invitado, checkout con envío por código postal, pasarela de pruebas, pedidos con historial, devoluciones con foto, Mi cuenta completa, panel de administración y panel de sucursal.
  - Migración 0003 con imágenes, reseñas, lista de deseos, historial de pedidos, devoluciones y configuración.
  - Configuración de seguridad (intentos, bloqueo, sesión y reserva) editable por el admin y aplicada al momento.
  - Pruebas: 82 del backend (95% de cobertura, 4 de ellas contra PostgreSQL) y 36 de la traducción, incluida cada una de las 50 rutas contra un backend falso.
- Refresh token en cookie HttpOnly, SameSite=Strict y solo en `/api/v1/auth` (sec. 18.1); con el backend real el JavaScript de la página ya no puede leerlo. `COOKIE_SECURE=true` en producción.

- Docker para producción:
  - El frontend se sirve con nginx: `/api/` va al backend y el resto de rutas a React Router.
  - El backend tiene revisión de salud y el frontend espera a que esté listo.
  - `JWT_SECRET_KEY` se toma de `.env` y el compose no arranca si falta.
  - `.dockerignore` en la raíz y en el frontend, para que no se copien `node_modules`, `.venv`, `.env` ni las bases locales a las imágenes.
- Auditoría contra el Documento de Calidad:
  - CI del frontend en GitHub Actions (sec. 15.1): linter, formato, pruebas con cobertura, build con presupuesto, `npm audit` y end-to-end en 5 navegadores.
  - Cobertura con `npm run coverage` y mínimo de 80% en sesión y JWT, carrito, checkout y utilidades (sec. 10.2).
  - Pruebas de cierre de sesión con invalidación del refresh token, de sesión vencida, de la validación del checkout, de los errores de la API y de los filtros en la URL (19 pruebas).
  - Documentación de los providers de sesión y sucursal, del cliente de React Query y de `useDebounce` (sec. 14.3).
- Frontend, QA (fase 7, la parte que no depende del backend):
  - Pruebas end-to-end también en Firefox, Safari y iPhone (WebKit), además de Chrome y Android: 185 pruebas en 5 navegadores.
  - Presupuesto del paquete público (200 KB gzip) revisado en cada `npm run build`; también con `npm run size`.
  - Imágenes de producto con carga diferida, espacio reservado y `srcset` cuando la API lo mande.
  - Guion para probar la compra con NVDA y VoiceOver (`docs/qa/guion-lector-pantalla.md`) y material para la evaluación heurística, la prueba con usuarios y el SUS (`docs/qa/prueba-usabilidad.md`).
- Frontend, fase 6 (sucursal), para staff de su sucursal (el admin puede elegir cualquiera):
  - Inventario: búsqueda por producto, SKU o pasillo, filtros de pocas piezas y agotados, y ajuste con motivo obligatorio que nunca deja menos piezas de las apartadas.
  - Pedidos para recoger: por preparar, listos y entregados hoy, con aviso de atrasados en texto y actualización cada 30 segundos; los pedidos solo avanzan (pagado, en preparación, listo).
  - Entregar pedido, pensada para el celular: código del cliente, revisión de identificación y productos, y confirmación.
  - Pruebas: 6 de componentes y 5 end-to-end con revisión de accesibilidad en escritorio y móvil.
- Las pruebas end-to-end corren contra un build con datos simulados (`npm run build:mock`), más rápido y estable que el servidor de desarrollo.
- Frontend, fase 5 (administración), solo para el rol admin y cargada bajo demanda:
  - Resumen: indicadores del día con enlace a su lista, alertas por prioridad y gráfica de ventas de 7 días con resumen para lectores de pantalla y vista de tabla.
  - Productos: búsqueda, categoría y estado en la URL, con conteos por estado.
  - Editar producto: información, atributos, variantes con precio y stock, e imágenes con texto alternativo obligatorio; no se publica sin una variante con precio y stock (I2).
  - Categorías: árbol de hasta 3 niveles para agregar, renombrar y eliminar solo si está vacía.
  - Pedidos: filtros por estado, sucursal y fecha; detalle con cambio de estado solo a los permitidos (I3), confirmación para cancelar o reembolsar, avisos de la pasarela y registro de cambios.
  - Usuarios y roles: cambiar rol y sucursal (no el propio) y desbloquear cuentas.
  - Reportes: indicadores por periodo, ventas por departamento, inventario por sucursal y exportar CSV.
  - Configuración: funciones activas, pasarela con la llave enmascarada (I6), envío gratis y seguridad.
  - Pruebas: 9 de componentes y 9 end-to-end con revisión de accesibilidad en escritorio y móvil.
- Frontend, fase 4 (herramientas), cada una con su bandera de funcionalidad:
  - Comparador de hasta 4 productos: casilla "Comparar" en el listado, barra con los elegidos y tabla accesible con "Mostrar solo diferencias".
  - Vista 360° en la ficha: giro con barra, botones, arrastre o teclado, con el ángulo anunciado y zoom.
  - Calculadora de materiales: pintura, piso y azulejo, y taquetes y tornillos, con errores accesibles y pintura sugerida al carrito.
  - Localizador de sucursales: búsqueda por CP o ciudad, distancia, stock de un producto o del carrito, elegir mi sucursal y cómo llegar; el mapa es solo apoyo visual.
  - Pruebas: 17 de componentes y 14 end-to-end con revisión de accesibilidad.
- Frontend, fase 3 (cuenta del cliente):
  - Iniciar sesión con aviso de intentos restantes, cuenta bloqueada, "Mantener mi sesión" y regreso a la página de origen; cada rol entra a su panel.
  - Crear cuenta con aviso de privacidad obligatorio y restablecer contraseña.
  - Mi cuenta: resumen, pedidos con filtro, seguimiento con línea de tiempo y código de entrega, direcciones (agregar, editar, principal, eliminar), lista de deseos con baja de precio.
  - Datos y privacidad (ARCO): corregir datos, consentimientos, copia de datos, cambiar contraseña y eliminar cuenta.
  - Devolución con motivo y foto, y reseñas con moderación.
  - Mi cuenta y acceso se cargan bajo demanda para dividir el paquete.
  - Pruebas: 21 de componentes y 8 end-to-end con revisión de accesibilidad.
- Frontend, fase 2 (carrito, checkout y confirmación):
  - Carrito para invitado o con sesión: cambiar cantidad, quitar, stock por sucursal y opción de envío cuando algo está agotado en la sucursal.
  - Checkout en 3 pasos con validación accesible: tus datos, entrega (recoger en una sucursal con todo el pedido o envío con costo por CP y direcciones guardadas) y pago en la pasarela hospedada, sin campos de tarjeta.
  - Fila de espera cuando hay mucha demanda (24.3).
  - Confirmación que consulta el pedido hasta que se confirma el pago (pendiente, pagado o rechazado) y permite reintentar el pago.
  - Al iniciar sesión, el carrito de invitado se une al de la cuenta.
  - Datos de prueba: pasarela simulada y datos que sobreviven a una recarga.
  - Pruebas: 9 de componentes y 6 end-to-end (compra completa con teclado y revisión de accesibilidad).
- Frontend, fase 1 (catálogo y búsqueda), con la marca Ferremarket:
  - Inicio con departamentos y productos disponibles hoy en la sucursal.
  - Listado por categoría con migas de pan, filtros combinables (marca, atributos, precio y disponibilidad) que se aplican sin recargar, orden y paginación; en móvil, panel de filtros y "Ver más".
  - Búsqueda con autocompletado accesible, búsquedas recientes y "¿Quisiste decir…?" cuando no hay resultados.
  - Ficha de producto con galería, selector de variante (precio, SKU y stock), recoger en sucursal o envío con costo por CP, cantidad, agregar al carrito, lista de deseos, especificaciones y reseñas.
  - Departamentos por niveles en móvil y páginas de aviso de privacidad, envíos y devoluciones.
  - Pruebas: 55 unitarias y de componentes, y 22 end-to-end en escritorio y móvil con revisión de accesibilidad (axe).
- Frontend, fase 0 (cimientos):
  - Rutas de todas las pantallas del diseño, con layouts de tienda, checkout y acceso, y paneles de administración y sucursal.
  - Acceso por rol (cliente, staff y admin) y páginas 404, 403 y de error.
  - Cliente de API con JWT: el token de acceso vive en memoria y se renueva automáticamente cuando vence.
  - Datos simulados (MSW) basados en los prototipos, para trabajar sin backend.
  - Componentes base accesibles (WCAG 2.1 AA): botones, campos, diálogos, tablas, pestañas, avisos y estados de carga, vacío y error.
  - Encabezado con buscador, selector de sucursal y carrito; menú de departamentos y pie de página.
  - Pruebas con Vitest (27) y configuración de Playwright y Prettier.
- Documentación del frontend:
  - Plan de implementación por fases (`docs/diseno/plan-frontend.md`).
  - Contrato de API propuesto, con seguimiento por endpoint (`docs/api/endpoints-propuestos.md`).
  - Paquete de diseño: README, checklist de accesibilidad, tokens y prototipos.

### Cambiado

- Los endpoints de auditoría (bitácora, calidad de datos, respaldos y datos sintéticos) pasan del gateway al servicio admin; el cálculo del reporte queda en `data_quality.py` (MVC).
- `run_app.py` levanta la API con uvicorn y sirve el build de React en el mismo puerto, en Windows, macOS o Linux; usa `.venv` si existe.
- CORS solo acepta `FRONTEND_URL` y los orígenes de `CORS_ORIGINS` (antes `*` con credenciales).
- `SEED_SYNTHETIC_DATA=false` evita cargar los datos sintéticos en producción.
- El reporte de calidad de datos separa la bitácora real de las muestras sintéticas: el muestreo AE-39 solo se cumple con registros reales.
- Vitest usa la mitad de los núcleos: con todos, jsdom saturaba el equipo y fallaban pruebas al azar (172 de 172 estables, 80 s).
- Checkout y confirmación se cargan bajo demanda: el paquete público baja de 213 KB a 193 KB gzip.
- Los esqueletos de carga ocupan el mismo lugar que el contenido final y el pie de página ya no aparece arriba mientras carga: el CLS en móvil baja de 0.16–0.23 a menos de 0.05.
- Tokens de diseño estandarizados: cada color de los prototipos tiene nombre por uso, se ajustó el contraste de los estados deshabilitado y borde oscuro, y se fijó un tono por estado de pedido.

### Corregido

- Con una sesión guardada ("Mantener mi sesión"), abrir Iniciar sesión mandaba en silencio al panel de esa cuenta: parecía que el login de otra persona llevaba a la vista de cliente. Ahora avisa qué cuenta está abierta y deja cerrarla para entrar con otra.
- Controles de la base de datos que llegaron de la rama `backend`:
  - Contraseñas en el código: las de 4 roles, `Qwerty1234` como contraseña de PostgreSQL y la llave de los respaldos. También la llave JWT y el secreto de webhooks tenían valor por defecto; ahora, sin variable, se genera una llave aleatoria.
  - El respaldo se registraba como "AES-256-CBC" y era un cifrado hecho a mano; la "prueba de restauración" solo comparaba el hash de lo que se acababa de escribir.
  - El dictamen de revisión de bitácora ("conforme, sin incidentes"), los cambios de emergencia y el `UPDATE` que generaba actividad estaban fijos en el código.
  - La copia "offsite" era otra carpeta del mismo disco y `pg_dump` apuntaba a una ruta de Windows.
  - Los controles fallaban si el servidor no tenía `pgcrypto`, y como corrían al arrancar, la aplicación no levantaba. Además, cada arranque hacía un respaldo y cambiaba `postgresql.conf`.
  - El trigger de auditoría guardaba el hash de las contraseñas, y su función `SECURITY DEFINER` no fijaba `search_path`.
- `JWT_SECRET_KEY` exige 32 caracteres (HS256); `.env.example` traía `cambiar_esto` y `PAYMENT_PROVIDER` vacío.
- `run_app.py` buscaba `.venv` solo en Windows, mandaba todo como JSON (las imágenes no se veían) y no pasaba las cookies, así que la sesión no se guardaba.
- `openapi.json` documentaba 40 de los 76 endpoints.
- Seguridad del backend:
  - El carrito, el checkout, los pagos y el envío de otra persona responden 403 y quedan en la bitácora.
  - Dar de baja la cuenta también revoca la sesión y deja inservible la contraseña.
  - Cambiar el correo por uno que ya usa otra cuenta responde 409.
  - La imagen SVG de producto escapa el texto (XSS) y crear un producto con un SKU repetido responde 409.
  - El registro público ya no acepta `tipo_usuario: admin` ni `staff`.
  - El token para restablecer la contraseña ya no se regresa en la respuesta; solo viaja por correo.
  - Un carrito ya no se puede leer, modificar ni pagar con solo conocer su id.
  - El webhook de pago exige firma, y solo el admin puede firmar en el modo de pruebas.
  - `POST /payments` solo acepta pedidos propios y por su monto.
  - `POST /admin/seed-synthetic` pide sesión de admin.
  - La baja de cuenta pide la contraseña y no procede con pedidos en curso.
- El checkout cobra el envío y lo calcula por código postal (antes eran $99 fijos y no se cobraban).
- El total del listado contaba solo la página y el filtro por atributo se aplicaba después de paginar.
- El pedido de prueba 10311 tenía fecha fija y su plazo para devolver venció el 1 nov; 4 pruebas e2e fallaban.
- La imagen del backend y el CI instalan las dependencias con `backend/requirements.txt`; `pip install -e .` fallaba porque `pyproject.toml` no lista dependencias y encuentra `backend` y `frontend` como paquetes.
- Vite actualizado a 8.3.5 por 2 vulnerabilidades altas (solo en desarrollo).
- Las pruebas con espera ya no fallan cuando la cobertura las hace más lentas.
- En Safari de iPhone, las páginas con tablas y Editar producto se podían desplazar a lo ancho.
- Categorías (admin) mostraba la dirección web como `/c/…`; la ruta real es `/categoria/…`.
- La prueba "apagar el comparador lo quita de la tienda" abría una página inexistente y pasaba sin probar nada.
- Orden de encabezados en el listado móvil (las tarjetas usaban h3 sin un h2 antes).
- Al cambiar de página, si la página nueva aún mostraba su esqueleto de carga, el foco caía en el contenido y no en el título; ahora espera a que aparezca el título.

### Quitado

- `docs/` sale del repositorio (plan, prototipos, checklist, contrato de API y QA); la documentación se guarda aparte.
- `db_security_pgadmin.py`, con sus tablas de llaves y de respaldos (las reemplaza `respaldos_bd`) y los registros precargados de cambios de emergencia y de revisión de bitácora.


## [1.0.0] - 2026-10-26

### Referencia de Esquema de Base de Datos (Alembic — Sec. 32 / AE-36)
- **Migraciones aplicadas:** `0001_initial_schema_2fn` → `0002_operational_tables` (reversibles vía `alembic downgrade`).
- **Versión de contrato API pública:** `/api/v1` (OpenAPI 3.1.0).

### Agregado
- **Modelo de Datos Normalizado en 2FN (Anexos 2 y 3, AE-14):** Implementación de las 16 tablas de negocio en SQLAlchemy 2.0 (`usuarios`, `clientes`, `administradores`, `staff_sucursal`, `direcciones`, `sucursales`, `categorias`, `productos`, `variantes`, `inventario`, `carritos`, `item_carrito` sin `precio_unitario`, `pedidos`, `item_pedido` con `precio_unitario_venta` congelado, `pagos` sin datos de tarjeta PCI-DSS y `envios`).
- **Persistencia Operativa (`0002_operational_tables`):** 5 tablas operativas de soporte (`bitacora_auditoria`, `tokens_revocados`, `intentos_login_fallidos`, `reservas_inventario` y `eventos_webhook`) para garantizar persistencia transaccional y trazabilidad auditable.
- **Microservicio `users` (HU-03, RQ-SEG-001, Sec. 18.1, LFPDPPP / AE-22, AE-45):** Registro con validación de email y contraseña, hash bcrypt, login con bloqueo por fuerza bruta tras 5 intentos fallidos, JWT access (15 min) y refresh (7 días) con rotación y revocación en logout, recuperación de contraseña de un solo uso, RBAC (`cliente`, `staff`, `admin`), aviso de privacidad (`GET /api/v1/privacy-notice`) y flujo completo de derechos ARCO (`GET /api/v1/users/me/arco`, `PUT /api/v1/users/me`, `DELETE /api/v1/users/me`).
- **Microservicio `catalog` (HU-01, HU-02, HU-08, HU-09):** Árbol de categorías hasta 3 niveles, productos con variantes por SKU, búsqueda paginada y filtros combinados, alta administrativa con validación de completitud y bitácora de cambios de precio.
- **Microservicio `inventory` (HU-05, RQ-DISP-001, AE-25):** Control de existencias por sucursal, reserva temporal con bloqueo transaccional/concurrencia, idempotencia por llave y expiración automática a los 15 minutos.
- **Microservicio `cart` (HU-04, Anexo 2.2.2):** Carrito para clientes registrados e invitados con cálculo de precios y totales en tiempo real haciendo join con `variantes.precio`.
- **Microservicios `checkout` y `payments` (HU-06, RQ-SEG-002, RQ-DAT-001, AE-29, AE-31):** `PaymentGatewayFactory` (`StripeGateway` y `MercadoPagoGateway`), circuit breaker con cola de eventos pendientes, rechazo 422 de PAN/CVV (PCI-DSS SAQ-A), congelamiento de precio de venta en `item_pedido`, webhook firmado HMAC-SHA256 e idempotente (`eventos_webhook`), liberación automática de stock ante rechazo o cancelación y protección contra IDOR en consulta de pedidos.
- **Microservicio `shipping` (HU-07, HU-10, Anexo 1.3):** Cotizador de envío por código postal, disponibilidad de recolección por sucursal, gestión de estados logísticos y notificaciones automáticas por correo.
- **API Gateway Unificado (`backend/gateway/main.py`) y Frontend React 19 + TypeScript (`frontend/`):** Punto de entrada `/api/v1/...`, generador de datos sintéticos (`seed_synthetic_data`, Sec. 20 / AE-26 con 30 pedidos conciliables y 25 registros de bitácora por operación sensible) y reporte automatizado de calidad de datos (`GET /api/v1/admin/data-quality-report`).

---

## [0.1.0] - 2026-09-20

### Referencia de Esquema de Base de Datos (Alembic — Sec. 32 / AE-36)
- **Migración inicial:** Estructura base de configuración de microservicios y `docker-compose.yml` (PostgreSQL 16, Redis 7, MinIO S3).

### Added
- Estructura inicial del repositorio con los 7 servicios (`users`, `catalog`, `inventory`, `cart`, `checkout`, `payments`, `shipping`), configuración de entorno `.env.example` y base de proyecto Frontend en React + TypeScript + Vite.
