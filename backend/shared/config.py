"""Configuración centralizada mediante variables de entorno (pydantic-settings)."""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Variables de configuración de la plataforma E-commerce Ferremarket."""

    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://ecommerce:ecommerce@localhost:5432/ecommerce"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = "ferremarket-dev-secret-key-change-in-prod-2026"
    jwt_algorithm: str = "HS256"
    jwt_access_expires_min: int = 15
    jwt_refresh_expires_days: int = 7
    s3_endpoint: str = "http://localhost:9000"
    s3_bucket: str = "product-images"
    payment_provider: str = "stripe"
    payment_api_key: str = "sandbox_key_default"
    payment_webhook_secret: str = "whsec_ferremarket_sandbox"
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


settings = Settings()
