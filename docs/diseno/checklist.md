# Checklist del Documento de Calidad

59 puntos: 51 cumplen, 2 parciales, 6 pendientes (pruebas con el sitio construido o con usuarios).

## A · Catálogo y búsqueda

| # | Requisito | Fuente | Dónde se resuelve | Estado |
|---|---|---|---|---|
| A1 | Categorías jerárquicas de hasta 3 niveles, con menú visible desde 769 px | HU-01, 27.4 | Escritorio: barra de categorías y migas. Móvil: Departamentos con 3 niveles | Cumple |
| A2 | Listado de productos paginado por categoría | HU-01, 13.1 | Listado (escritorio y móvil) | Cumple |
| A3 | Variantes con SKU, precio y stock; el precio cambia al elegir variante | HU-02 | Ficha de producto (escritorio y móvil, interactiva) | Cumple |
| A4 | Buscador con autocompletado | 3.2, 27.5 | Móvil: Buscar. Mismo componente en el encabezado de escritorio | Cumple |
| A5 | Filtros por atributo que se combinan y actualizan sin recargar | HU-09 | Escritorio: panel lateral. Móvil: pantalla Filtros | Cumple |
| A6 | Filtros activos anunciados al lector de pantalla | 28.3 | Aviso "2 filtros activos" en región aria-live | Cumple |
| A7 | Ordenar resultados | 3.2 | Listado (escritorio y móvil) | Cumple |
| A8 | Comparador de productos como tabla accesible | 27.4, 28.3 | Comparador (escritorio y móvil): tabla con encabezados y "solo diferencias" | Cumple |
| A9 | Imágenes con zoom o vista 360° | 27.5 | Vista 360° (escritorio y móvil) con giro por teclado | Cumple |
| A10 | Calculadora de materiales con etiquetas y errores accesibles | 27.5, 28.3 | Calculadora: pintura completa e interactiva. Piso y taquetes solo como pestañas | Parcial |
| A11 | Localizador de tiendas con lista de texto además del mapa | 27.5, 28.3 | Sucursales (escritorio y móvil): lista completa, mapa complementario | Cumple |
| A12 | Reseñas de producto | 3.2 | Ficha: sección de reseñas. Escribir reseña (escritorio y móvil) | Cumple |
| A13 | Página de inicio con departamentos y productos disponibles | 3.6 | Inicio (escritorio y móvil) | Cumple |
| A14 | Estados sin resultados, error de conexión, carga y fila de espera | 24.3, anexo 1.8 | Estados (escritorio) y Sin resultados (móvil) | Cumple |

## B · Cuenta de usuario

| # | Requisito | Fuente | Dónde se resuelve | Estado |
|---|---|---|---|---|
| B1 | Registro con correo válido y contraseña de 8 caracteres o más | HU-03 | Registro (escritorio y móvil) con error de ejemplo | Cumple |
| B2 | Aviso de privacidad visible y aceptado durante el registro | 4.5 | Registro (escritorio y móvil) | Cumple |
| B3 | Comprar como invitado, sin crear cuenta | 3.3, anexo 1.8 | Checkout, Login y Registro | Cumple |
| B4 | Mensaje claro de cuenta bloqueada por intentos fallidos | 18.1 | Iniciar sesión: estados normal, error y bloqueada (Tweaks) | Cumple |
| B5 | Mi cuenta: pedidos, direcciones, lista de deseos y derechos ARCO | 3.3, 4.5 | Mi cuenta, Pedidos, Direcciones, Lista de deseos y Datos (escritorio y móvil) | Cumple |
| B6 | Restablecer contraseña | 18.1 | Enlace en Iniciar sesión. Falta la pantalla del correo y nueva contraseña | Parcial |

## C · Carrito

| # | Requisito | Fuente | Dónde se resuelve | Estado |
|---|---|---|---|---|
| C1 | Agregar al carrito sin iniciar sesión | HU-04 | Listado y Ficha | Cumple |
| C2 | Cambiar cantidad, eliminar y recalcular el total | HU-04 | Carrito (escritorio y móvil, interactivo) | Cumple |
| C3 | Mostrar el precio vigente de cada variante | anexo 2.2.2 | Carrito: precio unitario y fecha de vigencia | Cumple |
| C4 | Aviso de producto agotado con una salida | anexo 1.8 | Listado y Carrito | Cumple |
| C5 | Elegir la variante antes de agregar un producto que tiene varias | HU-02 | Listado: botón Elegir variante | Cumple |

## D · Checkout, pago y posventa

| # | Requisito | Fuente | Dónde se resuelve | Estado |
|---|---|---|---|---|
| D1 | Envío a domicilio con costo calculado por código postal | HU-07 | Checkout (interactivo) | Cumple |
| D2 | Recolección en tienda, mostrando sucursales con stock | HU-07 | Checkout | Cumple |
| D3 | Pago en la pasarela hospedada, sin campos de tarjeta en el sitio | HU-06, 4.4, 18.2 | Checkout | Cumple |
| D4 | Confirmación con folio y estado pendiente mientras se confirma el pago | anexo 1.5 | Confirmación: estados pendiente y pagado | Cumple |
| D5 | Pago rechazado con opción de reintentar | anexo 1.8 | Confirmación: estado rechazado | Cumple |
| D6 | Estados del pedido visibles para el cliente | anexo 1.3 | Seguimiento de pedido (escritorio y móvil) con línea de tiempo y código de entrega | Cumple |
| D7 | Checkout completo solo con teclado y lector de pantalla | 28.3 | Controles nativos con etiqueta. Falta la prueba con NVDA y VoiceOver | Pendiente |
| D8 | Correo de confirmación del pedido | 3.2 (módulo 9) | Correo de confirmación | Cumple |
| D9 | Solicitar devolución | anexo 1.3, 1.4 | Devolución (escritorio y móvil) | Cumple |

## E · Responsive y dispositivos

| # | Requisito | Fuente | Dónde se resuelve | Estado |
|---|---|---|---|---|
| E1 | Mobile-first de 320 a 480 px, con buscador y filtros al alcance del pulgar | 27.4 | 25 pantallas móviles a 390 px | Cumple |
| E2 | 2 columnas de 481 a 768 px y 3 de 769 a 1024 px | 27.4 | Grilla fluida de las pantallas de escritorio | Cumple |
| E3 | Filtros laterales y comparador de 1025 a 1440 px | 27.4 | Listado y Comparador de escritorio | Cumple |
| E4 | Más productos por fila desde 1441 px | 27.4 | Grilla fluida | Cumple |
| E5 | Chrome, Edge, Safari y Firefox; iOS 15+ y Android 10+ | 27.2, 27.3 | Se valida en QA con el sitio construido | Pendiente |
| E6 | Rendimiento de imágenes y 360° en Android de gama baja | 27.5 | Se valida en QA; la vista 360° tiene feature flag | Pendiente |

## F · Accesibilidad WCAG 2.1 AA

| # | Requisito | Fuente | Dónde se resuelve | Estado |
|---|---|---|---|---|
| F1 | Contraste de texto de 4.5:1 o más | 28.2 | Paleta medida: de 5.2:1 a 9.7:1 | Cumple |
| F2 | Foco visible y navegación completa con teclado | 28.2 | Contorno naranja de 3 px en todos los controles | Cumple |
| F3 | Etiquetas visibles y errores específicos por campo | 28.2 | Registro, Checkout, Calculadora, Admin producto | Cumple |
| F4 | Texto alternativo en imágenes de producto | 28.2 | Todas; el admin exige el texto al subir imágenes | Cumple |
| F5 | Idioma declarado con lang="es" | 28.2 | Todas las pantallas | Cumple |
| F6 | Áreas táctiles de 44 px o más | 28.2 | Todas las pantallas | Cumple |

## G · Contenido y confianza

| # | Requisito | Fuente | Dónde se resuelve | Estado |
|---|---|---|---|---|
| G1 | Pie con aviso de privacidad, envíos, plazos y devoluciones | 4.5, 6.1 | Pantallas de compra de escritorio, Inicio y Listado móvil | Cumple |
| G2 | Costo de envío, plazos y total claros antes de pagar | 6.1 | Ficha, Carrito y Checkout | Cumple |
| G3 | Sucursal y código postal visibles | HU-07 | Encabezado de las pantallas de compra | Cumple |

## H · Proceso de usabilidad (sec. 26)

| # | Requisito | Fuente | Dónde se resuelve | Estado |
|---|---|---|---|---|
| H1 | Evaluación con las 10 heurísticas de Nielsen antes de la UI definitiva | 26.1 | Hacer sobre este prototipo | Pendiente |
| H2 | Prueba con 5 a 8 usuarios: compra sin guía en menos de 5 minutos | RQ-USA-001, 26.1 | Hacer sobre este prototipo | Pendiente |
| H3 | Puntaje SUS de 68 o más | 26.3 | Medir en la prueba con usuarios | Pendiente |

## I · Paneles internos

| # | Requisito | Fuente | Dónde se resuelve | Estado |
|---|---|---|---|---|
| I1 | Administración de productos, variantes y categorías | HU-08, 3.3 | Admin: Productos, Editar producto, Categorías | Cumple |
| I2 | No publicar un producto sin variante con precio y stock | 19, HU-08 | Admin: Editar producto (validación interactiva) | Cumple |
| I3 | Gestión de pedidos con solo transiciones válidas y registro de cambios | anexo 1.3 | Admin: Pedidos y Detalle de pedido | Cumple |
| I4 | Usuarios, roles y desbloqueo de cuentas | 3.3, 18.1 | Admin: Usuarios y roles | Cumple |
| I5 | Reportes de ventas e inventario | 3.6 | Admin: Resumen y Reportes | Cumple |
| I6 | Configuración, pasarela sin exponer llaves y feature flags | 11.4, 15.3, 22.3 | Admin: Configuración | Cumple |
| I7 | Sucursal: inventario local y pedidos para recolección | 3.3 | Sucursal: Inventario, Pedidos para recoger y Entregar (móvil) | Cumple |
