# Changelog

Todos los cambios relevantes del proyecto se registran en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [No publicado]

### Agregado

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

- Checkout y confirmación se cargan bajo demanda: el paquete público baja de 213 KB a 193 KB gzip.
- Los esqueletos de carga ocupan el mismo lugar que el contenido final y el pie de página ya no aparece arriba mientras carga: el CLS en móvil baja de 0.16–0.23 a menos de 0.05.
- Tokens de diseño estandarizados: cada color de los prototipos tiene nombre por uso, se ajustó el contraste de los estados deshabilitado y borde oscuro, y se fijó un tono por estado de pedido.

### Corregido

- Vite actualizado a 8.3.5 por 2 vulnerabilidades altas (solo en desarrollo).
- Las pruebas con espera ya no fallan cuando la cobertura las hace más lentas.
- En Safari de iPhone, las páginas con tablas y Editar producto se podían desplazar a lo ancho.
- Categorías (admin) mostraba la dirección web como `/c/…`; la ruta real es `/categoria/…`.
- La prueba "apagar el comparador lo quita de la tienda" abría una página inexistente y pasaba sin probar nada.
- Orden de encabezados en el listado móvil (las tarjetas usaban h3 sin un h2 antes).
- Al cambiar de página, si la página nueva aún mostraba su esqueleto de carga, el foco caía en el contenido y no en el título; ahora espera a que aparezca el título.

