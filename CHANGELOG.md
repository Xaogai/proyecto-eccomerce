# Changelog

Todos los cambios relevantes del proyecto se registran en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [Versionado Semántico](https://semver.org/lang/es/).

## [No publicado]

### Agregado

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
