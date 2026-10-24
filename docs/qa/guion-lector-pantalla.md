# Guion: compra completa con teclado y lector de pantalla (D7)

Requisito D7 del checklist (Documento de Calidad, 28.3): una persona tiene que poder comprar de principio a fin solo con teclado y con lector de pantalla. La revisión automática (axe) ya pasa en todas las pantallas, pero no sustituye esta prueba.

Tiempo estimado: 30 minutos por combinación.

## Combinaciones

Hagan al menos las dos primeras. La tercera, si alguien tiene Mac.

| # | Lector | Navegador | Equipo |
|---|---|---|---|
| 1 | NVDA (gratis: nvaccess.org) | Chrome o Firefox | Windows |
| 2 | VoiceOver (ya viene en iOS) | Safari | iPhone |
| 3 | VoiceOver | Safari | Mac |

## Preparación

1. En `frontend/`, correr `npm run dev:mock` y abrir `http://localhost:5173`. Para el iPhone, abrir la IP de la computadora en la misma red: `npm run dev:mock -- --host`.
2. Usuario de prueba: `cliente@ejemplo.com`, contraseña `Taller123`. Para comprar como invitado no hace falta.
3. Si algo se descompone, en la esquina inferior izquierda está el panel "Mock" con "Reiniciar datos de prueba".

Teclas que se usan:

| Acción | NVDA | VoiceOver iPhone | VoiceOver Mac |
|---|---|---|---|
| Siguiente elemento | Tab o flecha abajo | Deslizar a la derecha | VO + flecha derecha |
| Lista de encabezados | NVDA + F7 | Rotor: Encabezados | VO + U |
| Saltar por encabezados | H | Rotor + deslizar abajo | VO + Cmd + H |
| Activar | Enter o Espacio | Doble toque | VO + Espacio |
| Detener la voz | Ctrl | Toque con dos dedos | Ctrl |

## Pasos

Marquen cada paso: **Sí** (se pudo y se entendió), **Con dificultad** o **No**. Anoten lo que dijo el lector cuando algo no fue claro.

### 1. Inicio y búsqueda

| Paso | Qué debe pasar |
|---|---|
| 1.1 Cargar el inicio y presionar Tab una vez | Aparece "Saltar al contenido". Al activarlo, el foco pasa al contenido principal. |
| 1.2 Listar los encabezados | Hay un solo h1: "Compra en línea y recoge en tu sucursal en 2 horas". |
| 1.3 Elegir sucursal: botón "Elegir sucursal" | Se abre un diálogo. El foco entra al diálogo; Esc lo cierra y regresa al botón. |
| 1.4 Buscar "taladro" en el buscador | Al escribir, el lector anuncia cuántas sugerencias hay. Con flechas se recorren y Enter abre una. |

### 2. Listado y ficha

| Paso | Qué debe pasar |
|---|---|
| 2.1 En el listado, aplicar un filtro (por ejemplo, una marca) | Se anuncia "N productos encontrados". La casilla dice si está marcada. |
| 2.2 Abrir un producto | El h1 es el nombre del producto. Al cambiar de página, el foco va al título. |
| 2.3 Elegir otra versión (variante) | Son botones de opción: se cambia con flechas y se anuncia el precio de cada una. |
| 2.4 Cambiar la cantidad y "Agregar al carrito" | Se anuncia "Agregaste N piezas de … al carrito". |

### 3. Carrito

| Paso | Qué debe pasar |
|---|---|
| 3.1 Abrir el carrito desde el encabezado | El enlace se lee "Carrito N productos". |
| 3.2 Cambiar la cantidad de un producto | Se anuncia el nuevo subtotal. |
| 3.3 Botón "Eliminar" de un producto | Se anuncia "Quitaste … del carrito". Anoten dónde queda el foco: no debe saltar al inicio de la página. |
| 3.4 "Continuar al pago" | Lleva al checkout. |

### 4. Checkout

| Paso | Qué debe pasar |
|---|---|
| 4.1 Listar encabezados | h1 "Checkout"; h2 "Tus datos", "Entrega", "Pago" y "Tu pedido". |
| 4.2 Presionar "Pagar …" con todo vacío | Aparece "Revisa N campos antes de continuar" y se lee de inmediato. Cada campo con error lo dice al llegar a él. |
| 4.3 Llenar "Nombre completo", "Teléfono" y "Correo electrónico" | Cada campo se anuncia con su etiqueta. Al corregir, el error desaparece. |
| 4.4 Entrega: "Recoger en tienda" o "Envío a domicilio" | Botones de opción agrupados. Con envío, al escribir el código postal se anuncia el nuevo total. |
| 4.5 Leer la sección "Pago" | Explica que se paga en la pasarela y que el sitio no pide datos de tarjeta. No hay campos de tarjeta. |
| 4.6 "Pagar $…" | Lleva a la pasarela simulada. |

### 5. Pasarela y confirmación

| Paso | Qué debe pasar |
|---|---|
| 5.1 En la pasarela simulada, "Aprobar pago" | Regresa al sitio. |
| 5.2 Confirmación | Primero se anuncia "Estamos confirmando tu pago" y, unos segundos después, "Gracias, tu pedido está pagado", sin mover el foco. |
| 5.3 Repetir con "Rechazar pago" | Se anuncia "Tu banco no aprobó el pago" y hay un botón para reintentar. |

### 6. Seguimiento (con sesión iniciada)

| Paso | Qué debe pasar |
|---|---|
| 6.1 Mi cuenta → Mis pedidos → abrir el pedido | La línea de tiempo se lee en orden y dice cuál es el paso actual. |
| 6.2 Pedido listo para recoger (10482) | Se lee el código de entrega. |

## Registro de resultados

| Persona | Lector y navegador | Fecha | Pasos con "No" | Pasos con dificultad | Notas |
|---|---|---|---|---|---|
| | | | | | |

Si un paso sale **No**, abran un issue con: el número de paso, el lector y el navegador, lo que se escuchó y lo que se esperaba. Cuando todas las combinaciones de la tabla de arriba pasen sin "No", se marca D7 como "Cumple" en `docs/diseno/checklist.md`.
