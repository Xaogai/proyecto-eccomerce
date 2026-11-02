# Changelog

Todos los cambios notables en este proyecto son documentados en este archivo siguiendo [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y [Versionado Semántico](https://semver.org/lang/es/) (Secciones 15.1 y 32 del Documento de Calidad).

## [1.0.0] - 2026-10-26

### Added
- **Modelo de Datos Normalizado en 2FN (Anexos 2 y 3, AE-14):** Implementación de las 16 tablas en SQLAlchemy 2.0 (`usuarios`, `clientes`, `administradores`, `staff_sucursal`, `direcciones`, `sucursales`, `categorias`, `productos`, `variantes`, `inventario`, `carritos`, `item_carrito` sin `precio_unitario`, `pedidos`, `item_pedido` con `precio_unitario_venta` congelado, `pagos` sin datos de tarjeta PCI-DSS y `envios`).
- **Migraciones Reversibles en Alembic (`0001_initial_schema_2fn`):** Configuración de `alembic/env.py` y script de migración con `upgrade()` y `downgrade()` en los 7 microservicios.
- **Microservicio `users` (HU-03, RQ-SEG-001, Sec. 18.1, LFPDPPP / AE-45):** Registro con validación de email y contraseña, hash bcrypt, login con bloqueo por fuerza bruta tras 5 intentos fallidos, JWT access (15 min) y refresh (7 días) con rotación y revocación en logout, RBAC (`cliente`, `staff`, `admin`), aviso de privacidad y flujo completo de derechos ARCO.
- **Microservicio `catalog` (HU-01, HU-02, HU-08, HU-09):** Árbol de categorías hasta 3 niveles, productos con variantes por SKU, búsqueda paginada y filtros combinados, alta administrativa con validación de completitud y bitácora de cambios de precio.
- **Microservicio `inventory` (HU-05, RQ-DISP-001):** Control de existencias por sucursal, reserva temporal con bloqueo transaccional/concurrencia y expiración automática a los 15 minutos.
- **Microservicio `cart` (HU-04, Anexo 2.2.2):** Carrito para clientes registrados e invitados con cálculo de precios y totales en tiempo real haciendo join con `variantes.precio`.
- **Microservicios `checkout` y `payments` (HU-06, RQ-SEG-002, RQ-DAT-001, AE-29, AE-31):** `PaymentGatewayFactory` (`StripeGateway` y `MercadoPagoGateway`), circuit breaker, rechazo de PAN/CVV (PCI-DSS SAQ-A), congelamiento de precio de venta, webhook firmado e idempotente, liberación automática de stock ante rechazo de pago y protección contra IDOR en consulta de pedidos.
- **Microservicio `shipping` (HU-07, Anexo 1.3):** Cotizador de envío por código postal, disponibilidad de recolección por sucursal y gestión de estados logísticos (incluyendo incidencias).
- **API Gateway Unificado (`backend/gateway/main.py`):** Punto de entrada `/api/v1/...`, generador de datos sintéticos (`seed_synthetic_data`, Sec. 20 / AE-26), bitácora de auditoría y reporte automatizado de calidad y conciliación de datos (`RQ-DAT-001`).
