"""Configuración centralizada mediante variables de entorno (pydantic-settings)."""

from pathlib import Path
import secrets

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


def _random_secret() -> str:
    """Llave aleatoria por proceso para desarrollo: no hay secretos en el código (sec. 14.4, AE-19)."""
    return secrets.token_urlsafe(48)


class Settings(BaseSettings):
    """Variables de configuración de la plataforma E-commerce Ferremarket."""

    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://ecommerce:ecommerce@localhost:5432/ecommerce"
    redis_url: str = "redis://localhost:6379/0"
    # Sin JWT_SECRET_KEY, cada arranque usa una llave nueva y las sesiones anteriores dejan de valer.
    jwt_secret_key: str = Field(default_factory=_random_secret)
    jwt_algorithm: str = "HS256"
    jwt_access_expires_min: int = 15
    jwt_refresh_expires_days: int = 7
    s3_endpoint: str = "http://localhost:9000"
    s3_bucket: str = "product-images"
    payment_provider: str = "stripe"
    # Vacía o sin el prefijo de pruebas del proveedor (sk_test_, TEST-): se usa la pasarela simulada.
    payment_api_key: str = ""
    payment_webhook_secret: str = Field(default_factory=_random_secret)
    payment_timeout_seconds: int = 5
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "notificaciones@ferremarket.local"
    max_login_attempts: int = 5
    lockout_minutes: int = 15
    reservation_ttl_minutes: int = 15
    # Dirección pública de la tienda: los correos llevan enlaces a ella (restablecer contraseña, pedidos).
    frontend_url: str = "http://localhost:5173"
    # Pasarela de pruebas servida por el backend (/api/v1/pagos/sandbox). En producción va en False.
    pasarela_sandbox: bool = True
    # Cookie del refresh token solo por HTTPS; en producción va en True.
    cookie_secure: bool = False
    # Fotos de devoluciones e imágenes que suben los usuarios (volumen en Docker).
    media_dir: str = str(ROOT_DIR / "media")
    # Orígenes que pueden llamar a la API desde el navegador, separados por coma (además de FRONTEND_URL).
    cors_origins: str = ""
    # Datos sintéticos al arrancar (sec. 20): cuentas, catálogo y pedidos de prueba. En producción va en False.
    seed_synthetic_data: bool = True

    # Respaldos 3-2-1: copia 1 es la base de datos; la 2 va a BACKUP_DIR y la 3 a BACKUP_OFFSITE_DIR,
    # que debe estar en otro medio (disco externo, unidad de red o carpeta sincronizada con la nube).
    backup_dir: str = str(ROOT_DIR / "backups" / "local")
    backup_offsite_dir: str = ""
    # Llave para cifrar los respaldos (AES-256-GCM). Sin ella no se generan respaldos.
    backup_encryption_key: str = ""

    # Roles de PostgreSQL con privilegio mínimo. Sin contraseña, el rol se crea sin poder iniciar sesión.
    db_role_auditor_password: str = ""
    db_role_app_password: str = ""
    db_role_sucursal_password: str = ""
    db_role_respaldo_password: str = ""
    # Ajusta postgresql.conf (log_statement, log_connections...). Requiere superusuario; apagado por defecto.
    db_audit_server_settings: bool = False

    @field_validator("jwt_secret_key", "payment_webhook_secret", mode="before")
    @classmethod
    def _secret_or_random(cls, value: object) -> object:
        """Vacía equivale a no definida: se genera una llave aleatoria."""
        return _random_secret() if value in (None, "") else value

    @field_validator("jwt_secret_key")
    @classmethod
    def _strong_jwt_key(cls, value: str) -> str:
        """HS256 necesita al menos 32 bytes de llave (RFC 7518, sec. 3.2)."""
        if len(value.encode("utf-8")) < 32:
            raise ValueError(
                "JWT_SECRET_KEY debe tener al menos 32 caracteres. Genera una con: "
                'python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return value

    def allowed_origins(self) -> list[str]:
        """Orígenes permitidos por CORS: la tienda y los que se agreguen en CORS_ORIGINS."""
        extra = [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]
        return [self.frontend_url.rstrip("/"), *extra]


settings = Settings()
