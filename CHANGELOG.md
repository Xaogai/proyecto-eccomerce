# Changelog

Todos los cambios notables en este proyecto son documentados en este archivo siguiendo [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y [Versionado Semántico](https://semver.org/lang/es/) (Secciones 15.1, 15.2 y 32 del Documento de Calidad `DC-ECOM-001` v2.0; Criterios `AE-18` y `AE-36`).

## [1.0.0] - 2026-10-26

### Referencia de Esquema de Base de Datos (Alembic — Sec. 32 / AE-36)
- **Migraciones aplicadas:** `0001_initial_schema_2fn` → `0002_operational_tables` (reversibles vía `alembic downgrade`).
- **Versión de contrato API pública:** `/api/v1` (OpenAPI 3.1.0).

### Added
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
