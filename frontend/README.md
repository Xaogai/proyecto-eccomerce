# Frontend

Tienda en línea en React + TypeScript con Vite. Consume la API `/api/v1` de los microservicios en `backend/`.

## Requisitos

- Node.js 20 o superior

## Comandos

```bash
npm install          # instala dependencias
npm run dev:mock     # desarrollo con datos simulados (no necesita backend)
npm run dev          # desarrollo contra el backend real
npm test             # pruebas unitarias y de componentes (Vitest)
npm run e2e          # pruebas end-to-end (Playwright) contra un build con datos simulados, en Chrome, Android, Firefox, Safari e iPhone
npm run build:mock   # build con datos simulados en dist-mock/ (lo usa npm run e2e)
npm run preview:mock # sirve dist-mock/ en http://localhost:4173
npm run lint         # revisión estática (oxlint)
npm run build        # build de producción en dist/; falla si el paquete público pasa de 200 KB gzip
npm run size         # solo revisa el presupuesto del paquete público del último build
```

La primera vez, instala los navegadores de las pruebas end-to-end con `npx playwright install chromium firefox webkit`.

## Datos simulados

Con `npm run dev:mock`, MSW contesta las peticiones a `/api/v1` en el navegador. Los datos salen de los prototipos de diseño.

En la esquina inferior izquierda hay un panel para cambiar de escenario: lento, sin resultados, error del servidor, sin conexión, fila de espera y pago rechazado. También se puede elegir con `?mock=error` en la URL.

Usuarios de prueba (contraseña `Taller123`):

| Correo | Rol |
|---|---|
| cliente@ejemplo.com | Cliente |
| staff@ejemplo.com | Staff de sucursal (Toluca Centro) |
| staff.metepec@ejemplo.com | Staff de sucursal (Metepec) |
| admin@ejemplo.com | Administrador |
| bloqueada@ejemplo.com | Cliente con cuenta bloqueada |

Para probar la entrega en sucursal: el pedido 10482 de Ana está listo para recoger en Toluca Centro con el código `4821`.

En desarrollo, `/_ui` muestra todos los componentes base.

## Backend real

`npm run dev` envía todo `/api` al gateway del backend (`http://localhost:8000`; otra dirección con `API_URL` en un `.env.local`).

Las pantallas usan el contrato de API (EP-01 a EP-53). Con el backend real, cada llamada pasa por `src/api/backend/`, que la convierte a la ruta del backend (nombres en español, pesos en lugar de centavos) y regresa la respuesta con la forma del contrato. Con datos simulados y en las pruebas esa capa no se usa.

Las cuentas de prueba del backend están en el README de la raíz.

## Estructura

```
src/
  api/          cliente HTTP, JWT, rutas y esquemas zod del contrato
  app/          proveedores, router y guardas por rol
  components/   componentes base (ui/), encabezado y navegación (layout/), avisos y estados (feedback/)
  features/     hooks de datos por dominio
  layouts/      layouts de tienda, checkout, Mi cuenta y paneles internos
  mocks/        MSW: semilla, handlers y escenarios
  pages/        páginas
  styles/       tokens de diseño y estilos globales
```

## Documentación

El plan por fases, los prototipos de diseño, el checklist de accesibilidad, el contrato de API y el material de QA se guardan fuera de este repositorio.
