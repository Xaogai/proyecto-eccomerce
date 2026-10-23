# Changelog

Todos los cambios relevantes del proyecto se registran en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [No publicado]

### Agregado

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

- Tokens de diseño estandarizados: cada color de los prototipos tiene nombre por uso, se ajustó el contraste de los estados deshabilitado y borde oscuro, y se fijó un tono por estado de pedido.
