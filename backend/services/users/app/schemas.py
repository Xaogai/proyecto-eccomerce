"""Esquemas Pydantic para el servicio de Usuarios y Autenticación."""

from datetime import datetime
import uuid
from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserRegisterRequest(BaseModel):
    """Datos requeridos para registrar un usuario (HU-03, LFPDPPP)."""

    nombre: str = Field(..., min_length=2, max_length=150)
    email: str = Field(..., max_length=150)
    password: str = Field(..., min_length=8, max_length=128)
    tipo_usuario: str = Field(default="cliente")
    rol_admin: str | None = Field(default=None)
    sucursal_id: uuid.UUID | None = Field(default=None)
    acepta_aviso_privacidad: bool = Field(default=True)
    telefono: str | None = Field(default=None, max_length=20)
    acepta_marketing: bool = Field(default=False)

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, value: str) -> str:
        """Valida que el correo electrónico tenga un formato válido (HU-03)."""
        cleaned = value.strip().lower()
        if "@" not in cleaned or "." not in cleaned.split("@")[-1]:
            raise ValueError("Formato de correo electrónico inválido")
        return cleaned

    @field_validator("tipo_usuario")
    @classmethod
    def validate_tipo_usuario(cls, value: str) -> str:
        """Valida que el discriminador de tipo_usuario sea válido."""
        if value not in {"cliente", "admin", "staff"}:
            raise ValueError("tipo_usuario debe ser 'cliente', 'admin' o 'staff'")
        return value


class UserLoginRequest(BaseModel):
    """Credenciales para inicio de sesión."""

    email: str
    password: str


class TokenRefreshRequest(BaseModel):
    """Solicitud de renovación de access token mediante refresh token."""

    refresh_token: str


class LogoutRequest(BaseModel):
    """Refresh token que también se invalida al cerrar sesión."""

    refresh_token: str | None = None


class PasswordChangeRequest(BaseModel):
    """Cambio de contraseña desde Mi cuenta (pide la actual)."""

    password_actual: str
    password_nueva: str = Field(..., min_length=8, max_length=128)


class PasswordResetRequest(BaseModel):
    """Solicitud de recuperación de contraseña por correo (HU-03)."""

    email: str


class PasswordResetConfirmRequest(BaseModel):
    """Confirmación de cambio de contraseña mediante token de recuperación (HU-03)."""

    reset_token: str
    new_password: str = Field(..., min_length=8, max_length=128)


class TokenResponse(BaseModel):
    """Respuesta con par de tokens JWT (access y refresh)."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in_minutes: int


class AddressCreateRequest(BaseModel):
    """Datos para registrar una dirección de cliente."""

    calle: str = Field(..., min_length=3, max_length=200)
    ciudad: str = Field(..., min_length=2, max_length=100)
    codigo_postal: str = Field(..., min_length=4, max_length=10)
    es_predeterminada: bool = False


class AddressResponse(BaseModel):
    """Representación de una dirección de entrega."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    cliente_id: uuid.UUID
    calle: str
    ciudad: str
    codigo_postal: str
    es_predeterminada: bool


class UserUpdateRequest(BaseModel):
    """Solicitud de rectificación de datos personales (Derechos ARCO - LFPDPPP)."""

    nombre: str | None = Field(default=None, min_length=2, max_length=150)
    email: str | None = Field(default=None, max_length=150)


class RoleChangeRequest(BaseModel):
    """Solicitud administrativa para cambio de rol de usuario."""

    tipo_usuario: str = Field(..., pattern="^(cliente|admin|staff)$")
    rol_admin: str | None = None
    sucursal_id: uuid.UUID | None = None


class UserResponse(BaseModel):
    """Respuesta pública del perfil de usuario (sin exponer password_hash)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    email: str
    fecha_registro: datetime
    tipo_usuario: str
    telefono: str | None = None
    acepta_marketing: bool = False
    acepta_personalizacion: bool = False
    sucursal_id: uuid.UUID | None = None
    sucursal_nombre: str | None = None
