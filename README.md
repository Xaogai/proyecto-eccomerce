# 🛒 Proyecto E-commerce

Plataforma de comercio electrónico basada en una arquitectura de **microservicios** con backend en **FastAPI** y frontend en **React + TypeScript**.

> ⚠️ **Estado:** en desarrollo inicial. La estructura de los servicios, las migraciones y la infraestructura local ya están configuradas; la lógica de negocio se está implementando.

---

## 📑 Tabla de contenidos

- [Características](#-características)
- [Arquitectura](#-arquitectura)
- [Tecnologías](#-tecnologías)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Requisitos previos](#-requisitos-previos)
- [Instalación](#-instalación)
- [Variables de entorno](#-variables-de-entorno)
- [Uso](#-uso)
- [Migraciones de base de datos](#-migraciones-de-base-de-datos)
- [Respaldos y controles de la base de datos](#-respaldos-y-controles-de-la-base-de-datos)
- [Pruebas y calidad de código](#-pruebas-y-calidad-de-código)
- [Contribuir](#-contribuir)
- [Licencia](#-licencia)

---

## ✨ Características

- Registro e inicio de sesión de usuarios con **JWT** (access y refresh tokens).
- Catálogo de productos con imágenes almacenadas en **S3 / MinIO**.
- Control de inventario.
- Carrito de compras.
- Proceso de checkout.
- Integración con proveedor de pagos.
- Gestión de envíos.

## 🏗 Arquitectura

El backend está dividido en servicios independientes, cada uno con su propia aplicación y sus propias migraciones de base de datos:

| Servicio      | Responsabilidad                                   |
| ------------- | ------------------------------------------------- |
| `users`       | Registro, autenticación y perfiles de usuario     |
| `catalog`     | Productos, categorías e imágenes                  |
| `inventory`   | Existencias y disponibilidad de productos         |
| `cart`        | Carrito de compras                                |
| `checkout`    | Creación y confirmación de órdenes                |
| `payments`    | Procesamiento de pagos                            |
| `shipping`    | Envíos y seguimiento                              |

Servicios de infraestructura (vía Docker Compose):

| Servicio     | Uso                               | Puerto(s)     |
| ------------ | --------------------------------- | ------------- |
| PostgreSQL 16 | Base de datos principal          | `5432`        |
| Redis 7      | Caché y sesiones                  | `6379`        |
| MinIO        | Almacenamiento de objetos (S3)    | `9000`, `9001` (consola) |

## 🧰 Tecnologías

**Backend**
- [Python 3.12](https://www.python.org/)
- [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/)
- [SQLAlchemy](https://www.sqlalchemy.org/) + [Alembic](https://alembic.sqlalchemy.org/)
- [Pydantic](https://docs.pydantic.dev/) / pydantic-settings
- [PyJWT](https://pyjwt.readthedocs.io/), bcrypt
- psycopg 3, redis-py, boto3
- pytest, pytest-cov, ruff, mypy

**Frontend**
- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/)
- [React Router](https://reactrouter.com/), [TanStack Query](https://tanstack.com/query), Axios
- Vitest, Testing Library, Playwright
- Oxlint, Prettier

**Infraestructura**
- Docker / Docker Compose
- PostgreSQL, Redis, MinIO

## 📁 Estructura del proyecto

```
proyecto-eccomerce/
├── backend/
│   ├── requirements.txt
│   └── services/
│       ├── cart/
│       │   ├── alembic/          # Migraciones del servicio
│       │   ├── alembic.ini
│       │   ├── app/              # Código de la aplicación
│       │   └── tests/            # Pruebas del servicio
│       ├── catalog/
│       ├── checkout/
│       ├── inventory/
│       ├── payments/
│       ├── shipping/
│       └── users/
├── frontend/
│   ├── public/
│   ├── src/
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
├── .env.example
├── CHANGELOG.md
└── README.md
```

## ✅ Requisitos previos

- [Python 3.12+](https://www.python.org/downloads/)
- [Node.js 20+](https://nodejs.org/) y npm
- [Docker](https://www.docker.com/) y Docker Compose
- [Git](https://git-scm.com/)

## 🚀 Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/<usuario>/proyecto-eccomerce.git
cd proyecto-eccomerce
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` con tus valores (ver [Variables de entorno](#-variables-de-entorno)).

### 3. Levantar la infraestructura

```bash
docker compose up -d
```

### 4. Backend

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate
# Linux / macOS
source .venv/bin/activate

pip install -r backend/requirements.txt
```

### 5. Frontend

```bash
cd frontend
npm install
```

## 🔐 Variables de entorno

| Variable                   | Descripción                                   | Ejemplo                                                         |
| -------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| Variable | Descripción | Valor por defecto |
| -------- | ----------- | ----------------- |
| `DATABASE_URL` | PostgreSQL o SQLite (`sqlite:///./ferremarket.db`) | PostgreSQL en `localhost:5432` |
| `JWT_SECRET_KEY` | Llave de los JWT, 32 caracteres o más | Aleatoria en cada arranque (las sesiones se cierran al reiniciar) |
| `JWT_ACCESS_EXPIRES_MIN` / `JWT_REFRESH_EXPIRES_DAYS` | Duración de los tokens | `15` / `7` |
| `FRONTEND_URL` / `CORS_ORIGINS` | Dirección de la tienda y otros orígenes permitidos | `http://localhost:5173` / ninguno |
| `COOKIE_SECURE` / `PASARELA_SANDBOX` / `SEED_SYNTHETIC_DATA` | En producción: `true` / `false` / `false` | `false` / `true` / `true` |
| `PAYMENT_PROVIDER` / `PAYMENT_API_KEY` | Proveedor y llave (vacía: pasarela simulada) | `stripe` / vacía |
| `PAYMENT_WEBHOOK_SECRET` | Firma de los webhooks de pago | Aleatoria en cada arranque |
| `BACKUP_ENCRYPTION_KEY` | Llave de los respaldos (sin ella no se generan) | — |
| `BACKUP_DIR` / `BACKUP_OFFSITE_DIR` | Copias 2 y 3 del respaldo | `backups/local` / ninguna |
| `DB_ROLE_*_PASSWORD` | Contraseñas de los 4 roles de PostgreSQL | — (el rol no puede iniciar sesión) |
| `DB_AUDIT_SERVER_SETTINGS` | Ajustar `postgresql.conf` (requiere superusuario) | `false` |
| `REDIS_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `SMTP_*` | Servicios de apoyo | ver `.env.example` |

`.env.example` explica cada una. Genera llaves con `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

> 🔒 Nunca subas el archivo `.env` al repositorio. Ya está incluido en `.gitignore`.

## 💻 Uso

### Frontend

```bash
cd frontend
npm run dev        # Servidor de desarrollo (http://localhost:5173)
npm run build      # Compilación para producción
npm run preview    # Previsualizar la compilación
npm run lint       # Análisis estático con Oxlint
```

### Todo con Docker (como en producción)

```bash
docker compose up -d --build
```

Requiere `JWT_SECRET_KEY` (32 caracteres o más) en `.env`; para respaldos, también `BACKUP_ENCRYPTION_KEY`. Al arrancar, el backend aplica las migraciones y carga los datos sintéticos.

| Servicio | URL |
| -------- | --- |
| Tienda (nginx con el build de producción) | http://localhost:5173 |
| API Gateway y documentación | http://localhost:8000/docs |

nginx manda `/api/` al backend, así que el frontend y la API comparten origen.

### Sin Docker, en un solo puerto

```bash
cd frontend && npm install && npm run build && cd ..
python run_app.py            # http://127.0.0.1:8000: tienda, API y /docs
```

Funciona en Windows, macOS y Linux. Si existe `.venv`, `run_app.py` lo usa aunque lo lances con otro Python.
Con `DATABASE_URL=sqlite:///./ferremarket.db` no hace falta PostgreSQL. `HOST` y `PORT` cambian la dirección.

### Sin Docker (desarrollo)

```bash
# Terminal 1: backend en http://localhost:8000 (con SQLite si no tienes PostgreSQL)
DATABASE_URL=sqlite:///./ferremarket.db uvicorn backend.gateway.main:app --port 8000

# Terminal 2: frontend en http://localhost:5173 contra ese backend
cd frontend
npm run dev
```

`npm run dev:mock` sigue funcionando sin backend, con los datos simulados.

### Probar la tienda con el backend

Cuentas de prueba (contraseña `Sintetico2026!`):

| Correo | Rol |
| ------ | --- |
| `ana.torres.sintetica@ferremarket.local` | Cliente |
| `staff.toluca.sintetico@ferremarket.local` | Staff de Sucursal Toluca Centro |
| `admin.sintetico@ferremarket.local` | Administrador |

- **Pago:** el checkout lleva a la pasarela de pruebas del backend (`/api/v1/pagos/sandbox/…`), con un botón para pagar y otro para simular un pago rechazado. En producción se apaga con `PASARELA_SANDBOX=false`.
- **Correos:** sin `SMTP_HOST`, cada correo (bienvenida, recuperar contraseña, pedido listo) se imprime en la consola del backend con su enlace.
- **Comprar** pide iniciar sesión: el backend no acepta compras como invitado. El carrito del invitado pasa a la cuenta al entrar.
- **Recoger en tienda:** el código de 4 dígitos llega en la confirmación del pedido; el staff lo usa en Sucursal → Entregar pedido.

### Infraestructura

| Servicio      | URL                                             |
| ------------- | ----------------------------------------------- |
| Consola MinIO | http://localhost:9001 (`minioadmin` / `minioadmin`) |
| PostgreSQL    | `localhost:5432` (`ecommerce` / `ecommerce`)     |
| Redis         | `localhost:6379`                                 |

Para detener los contenedores:

```bash
docker compose down
```

## 🗄 Migraciones de base de datos

El backend aplica las migraciones al arrancar, desde `backend/services/users/alembic`. Los otros 6 servicios
tienen una copia idéntica de cada migración: al agregar una, cópiala a las 7 carpetas.

| Migración | Contenido |
| --------- | --------- |
| `0001_initial_schema_2fn` | Las 16 tablas en 2FN |
| `0002_operational_tables` | Bitácora, tokens revocados, intentos de login, reservas y webhooks |
| `0003_tienda_en_linea` | Imágenes, reseñas, deseos, historial, devoluciones y configuración |
| `0004_controles_bd` | Bitácora de respaldos y, en PostgreSQL, CHECK, DEFAULT, triggers de auditoría y vistas |

```bash
cd backend/services/users
alembic revision -m "descripcion del cambio"   # Crear migración
alembic upgrade head                          # Aplicar
alembic downgrade -1                          # Revertir la última
```

## 🛡 Respaldos y controles de la base de datos

**Respaldos 3-2-1.** Copia 1: la base en uso. Copia 2: `BACKUP_DIR`. Copia 3: `BACKUP_OFFSITE_DIR`, en otro disco,
una unidad de red o una carpeta que se sincronice con la nube. Si las dos carpetas están en el mismo disco, el respaldo
se hace igual, pero se registra que no cumple el 3-2-1.

```bash
python -m backend.shared.backups crear                          # o POST /api/v1/admin/db-backup-321 (admin)
python -m backend.shared.backups restaurar ARCHIVO.fmbak         # en una base con las migraciones y sin datos
python -m backend.shared.backups restaurar ARCHIVO.fmbak --reemplazar
```

- Se cifra con AES-256-GCM a partir de `BACKUP_ENCRYPTION_KEY`. Guarda la llave fuera del servidor: sin ella no hay forma de restaurar.
- Cada respaldo se descifra y se restaura en una base de prueba antes de registrarse; `GET /api/v1/admin/db-backups` muestra el resultado.
- Para programarlo: `cron` en Linux y macOS (`0 3 * * * cd /ruta && .venv/bin/python -m backend.shared.backups crear`) o el Programador de tareas en Windows.
- En Docker, la copia 2 queda en el volumen `backups`. Para la copia 3, crea `docker-compose.override.yml`:

  ```yaml
  services:
    backend:
      environment:
        BACKUP_OFFSITE_DIR: /app/backups/offsite
      volumes:
        - /ruta/del/otro/disco:/app/backups/offsite
  ```

**Controles de PostgreSQL** (en SQLite no aplican):

- Migración 0004: restricciones CHECK y DEFAULT, clasificación de la información, cuotas, tablas para registrar cambios de emergencia y revisiones de bitácora, trigger que guarda cada cambio de las tablas sensibles (sin contraseñas) y 5 vistas. No necesita extensiones ni superusuario.
- Al arrancar se crean 4 roles con privilegio mínimo: `rol_ferremarket_auditor` y `rol_ferremarket_respaldo` (solo lectura), `rol_ferremarket_app` y `rol_ferremarket_operador_sucursal` (inventario y envíos). Solo pueden iniciar sesión si su `DB_ROLE_*_PASSWORD` cumple la política.
- Con `DB_AUDIT_SERVER_SETTINGS=true` y superusuario, también se ajustan `log_statement=mod`, `log_connections`, `log_disconnections` y `password_encryption`.
- Si al usuario de la aplicación le falta algún permiso, el backend arranca igual y `GET /api/v1/admin/data-quality-report` muestra qué control falta.

## 🧪 Pruebas y calidad de código

### Backend

```bash
pytest                                        # Pruebas (SQLite en memoria)
pytest --cov=backend --cov-fail-under=80      # Cobertura con el mínimo de 80%
ruff check backend run_app.py                 # Linter
mypy backend run_app.py                       # Verificación de tipos
python -m backend.gateway.export_openapi      # Regenera openapi.json si cambian los endpoints
```

Las pruebas de `backend/tests/test_postgresql.py` necesitan un PostgreSQL donde se puedan crear bases y roles:

```bash
TEST_POSTGRES_URL=postgresql+psycopg://postgres:postgres@localhost:5432/postgres pytest backend/tests/test_postgresql.py
```

### Frontend

```bash
cd frontend
npx vitest                # Pruebas unitarias
npx playwright test       # Pruebas end-to-end
npx prettier --write .    # Formateo
```

## 🤝 Contribuir

1. Haz un fork del proyecto.
2. Crea una rama para tu cambio: `git checkout -b feature/nueva-funcionalidad`
3. Haz commit de tus cambios: `git commit -m "feat: agrega nueva funcionalidad"`
4. Sube la rama: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request.

Se recomienda seguir la convención de [Conventional Commits](https://www.conventionalcommits.org/es/) y registrar los cambios relevantes en [CHANGELOG.md](CHANGELOG.md).

## 📄 Licencia

Este proyecto fue desarrollado con fines académicos para la materia de **Auditoría**. Consulta el archivo `LICENSE` si se agrega uno.
