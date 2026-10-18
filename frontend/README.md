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
npm run e2e          # pruebas end-to-end (Playwright)
npm run lint         # revisión estática (oxlint)
npm run build        # build de producción en dist/
```

## Datos simulados

Con `npm run dev:mock`, MSW contesta las peticiones a `/api/v1` en el navegador. Los datos salen de los prototipos de `docs/diseno/prototipos/`.

En la esquina inferior izquierda hay un panel para cambiar de escenario: lento, sin resultados, error del servidor, sin conexión, fila de espera y pago rechazado. También se puede elegir con `?mock=error` en la URL.

Usuarios de prueba (contraseña `Taller123`):

| Correo | Rol |
|---|---|
| cliente@ejemplo.com | Cliente |
| staff@ejemplo.com | Staff de sucursal (Toluca Centro) |
| admin@ejemplo.com | Administrador |
| bloqueada@ejemplo.com | Cliente con cuenta bloqueada |

En desarrollo, `/_ui` muestra todos los componentes base.

## Backend real

`npm run dev` envía cada prefijo de `/api/v1` a su microservicio. Las URL se configuran en un `.env.local`, por ejemplo `API_CATALOG_URL=http://localhost:8001`; los nombres están en `vite.config.ts`.

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

- Plan por fases: `docs/diseno/plan-frontend.md`
- Diseño y pantallas: `docs/diseno/README.md`
- Accesibilidad y responsive: `docs/diseno/checklist.md`
- Contrato de API: `docs/api/endpoints-propuestos.md`
