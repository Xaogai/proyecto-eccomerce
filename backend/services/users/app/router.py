"""Controladores REST para Autenticación, Usuarios, Direcciones y Derechos ARCO (LFPDPPP)."""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from backend.services.users.app.schemas import (
    AddressCreateRequest,
    AddressResponse,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RoleChangeRequest,
    TokenRefreshRequest,
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
    UserUpdateRequest,
)
from backend.services.users.app.user_repository import UserRepository
from backend.shared.config import settings
from backend.shared.database import get_db
from backend.shared.models import Usuario
from backend.shared.notifications import list_user_notifications, send_email_notification
from backend.shared.security import (
    bearer_scheme,
    check_account_lockout,
    clear_failed_logins,
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    get_optional_user,
    hash_password,
    record_audit_event,
    register_failed_login,
    require_roles,
    revoke_token,
    verify_password,
)

router = APIRouter(prefix="/api/v1", tags=["Autenticación y Cuentas"])


def get_user_repository(db: Session = Depends(get_db)) -> UserRepository:
    """Inyección de dependencias para UserRepository (Sec. 14.2)."""
    return UserRepository(db)


@router.get("/privacy-notice")
def get_privacy_notice() -> dict[str, Any]:
    """
    Devuelve el Aviso de Privacidad oficial conforme a la LFPDPPP (Sec. 4.5, AE-45).

    Returns:
        dict[str, Any]: Contenido normativo del aviso de privacidad y derechos ARCO.
    """
    return {
        "responsable": "Ferremarket S.A. de C.V. (Proyecto Ecommerce tipo Home Depot)",
        "normativa": "Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP)",
        "finalidades": [
            "Creación y administración de cuenta de usuario",
            "Procesamiento de pedidos, pagos y entregas a domicilio o recolección en sucursal",
            "Envío de notificaciones sobre el estado de pedidos",
        ],
        "derechos_arco": {
            "acceso": "GET /api/v1/users/me/arco",
            "rectificacion": "PUT /api/v1/users/me",
            "cancelacion_oposicion": "DELETE /api/v1/users/me",
        },
        "ultima_actualizacion": "2026-09-17",
    }


@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(
    payload: UserRegisterRequest,
    current_user: Usuario | None = Depends(get_optional_user),
    repo: UserRepository = Depends(get_user_repository),
) -> Usuario:
    """
    Registra un nuevo usuario en la plataforma con contraseña cifrada (HU-03, RQ-SEG-001).

    Args:
        payload: Datos de registro validados.
        current_user: Usuario autenticado opcional (requerido si se solicita rol distinto de cliente).
        repo: Repositorio de usuarios inyectado.

    Returns:
        Usuario: Perfil del usuario registrado.
    """
    if not payload.acepta_aviso_privacidad:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debe aceptar el aviso de privacidad (LFPDPPP) para crear una cuenta",
        )
    if payload.tipo_usuario != "cliente" and (current_user is None or current_user.tipo_usuario != "admin"):
        record_audit_event(
            "privilege_escalation_blocked",
            str(current_user.id) if current_user else None,
            f"register:{payload.email}",
            {"requested_role": payload.tipo_usuario},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo un administrador autenticado puede registrar cuentas administrativas o de personal",
        )
    existing = repo.get_by_email(payload.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El correo electrónico ya se encuentra registrado",
        )
    pwd_hash = hash_password(payload.password)
    user = repo.create_user(
        nombre=payload.nombre,
        email=payload.email,
        password_hash=pwd_hash,
        tipo_usuario=payload.tipo_usuario,
        rol_admin=payload.rol_admin,
        sucursal_id=payload.sucursal_id,
    )
    record_audit_event("user_registered", str(user.id), f"user:{user.id}", {"role": user.tipo_usuario})
    send_email_notification(
        recipient_email=user.email,
        recipient_user_id=str(user.id),
        subject="Bienvenido a Ferremarket — Cuenta registrada",
        body=f"Hola {user.nombre}, tu cuenta ({user.email}) ha sido creada exitosamente en Ferremarket.",
        template_type="account_welcome",
    )
    return user


@router.post("/auth/login", response_model=TokenResponse)
def login_user(
    payload: UserLoginRequest,
    repo: UserRepository = Depends(get_user_repository),
) -> TokenResponse:
    """
    Autentica al usuario y emite tokens JWT access y refresh (Sec. 13.1, Sec. 18.1).

    Args:
        payload: Correo y contraseña.
        repo: Repositorio de usuarios.

    Returns:
        TokenResponse: Par de tokens access y refresh.
    """
    normalized_email = payload.email.strip().lower()
    check_account_lockout(normalized_email)
    user = repo.get_by_email(normalized_email)
    if not user or not verify_password(payload.password, user.password_hash):
        register_failed_login(normalized_email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )
    clear_failed_logins(normalized_email)
    access_token = create_access_token(str(user.id), user.email, user.tipo_usuario)
    refresh_token = create_refresh_token(str(user.id), user.email, user.tipo_usuario)
    record_audit_event("user_login", str(user.id), f"user:{user.id}", {"role": user.tipo_usuario})
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in_minutes=settings.jwt_access_expires_min,
    )


@router.post("/auth/refresh", response_model=TokenResponse)
def refresh_access_token(
    payload: TokenRefreshRequest,
    repo: UserRepository = Depends(get_user_repository),
) -> TokenResponse:
    """
    Renueva el access token y rota el refresh token (invalidando el anterior - Sec. 18.1).

    Args:
        payload: Refresh token vigente.
        repo: Repositorio de usuarios.

    Returns:
        TokenResponse: Nuevos tokens access y refresh.
    """
    claims = decode_token(payload.refresh_token, expected_type="refresh")
    revoke_token(payload.refresh_token)
    user_id = uuid.UUID(str(claims["sub"]))
    user = repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    new_access = create_access_token(str(user.id), user.email, user.tipo_usuario)
    new_refresh = create_refresh_token(str(user.id), user.email, user.tipo_usuario)
    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in_minutes=settings.jwt_access_expires_min,
    )


@router.post("/auth/logout")
def logout_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, str]:
    """
    Invalida el token actual en el cierre de sesión (Sec. 18.1, AE-22).

    Args:
        credentials: Bearer token actual.

    Returns:
        dict[str, str]: Mensaje de confirmación.
    """
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")
    revoke_token(credentials.credentials)
    return {"detail": "Sesión cerrada y token revocado exitosamente"}


@router.post("/auth/password-reset/request")
def request_password_reset(
    payload: PasswordResetRequest,
    repo: UserRepository = Depends(get_user_repository),
) -> dict[str, Any]:
    """
    Solicita un token de recuperación de contraseña de un solo uso y lo envía por correo (HU-03).
    """
    user = repo.get_by_email(payload.email)
    if not user:
        return {"detail": "Si el correo está registrado, recibirá las instrucciones de recuperación."}
    reset_token = create_password_reset_token(str(user.id), user.email)
    send_email_notification(
        recipient_email=user.email,
        recipient_user_id=str(user.id),
        subject="Recuperación de contraseña — Ferremarket",
        body=(
            f"Hola {user.nombre}, solicitaste restablecer tu contraseña. "
            f"Usa este token de recuperación vigente por 15 minutos: {reset_token}"
        ),
        template_type="password_reset",
        metadata={"expires_in_minutes": 15},
    )
    return {
        "detail": "Correo de recuperación enviado exitosamente",
        "sandbox_reset_token": reset_token,
    }


@router.post("/auth/password-reset/confirm")
def confirm_password_reset(
    payload: PasswordResetConfirmRequest,
    repo: UserRepository = Depends(get_user_repository),
) -> dict[str, str]:
    """
    Confirma el cambio de contraseña usando un token de recuperación de un solo uso (HU-03, RQ-SEG-001).
    """
    claims = decode_token(payload.reset_token, expected_type="password_reset")
    revoke_token(payload.reset_token)
    user_id = uuid.UUID(str(claims["sub"]))
    user = repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    repo.update_password(user, hash_password(payload.new_password))
    clear_failed_logins(user.email)
    record_audit_event("password_reset_completed", str(user.id), f"user:{user.id}")
    return {"detail": "Contraseña actualizada exitosamente"}


@router.get("/users/me/notifications")
def get_my_notifications(
    current_user: Usuario = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Lista las notificaciones por correo enviadas al usuario autenticado (HU-10)."""
    return list_user_notifications(str(current_user.id), current_user.email)


@router.get("/users/me", response_model=UserResponse)
def get_my_profile(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    """Obtiene el perfil del usuario autenticado."""
    return current_user


@router.get("/users/me/arco")
def export_personal_data_arco(
    current_user: Usuario = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repository),
) -> dict[str, Any]:
    """
    Derecho de Acceso (ARCO - LFPDPPP): Exporta todos los datos personales del titular.
    """
    addresses = repo.list_addresses(current_user.id)
    return {
        "titular": {
            "id": str(current_user.id),
            "nombre": current_user.nombre,
            "email": current_user.email,
            "fecha_registro": current_user.fecha_registro.isoformat(),
            "tipo_usuario": current_user.tipo_usuario,
        },
        "direcciones": [
            {
                "id": str(a.id),
                "calle": a.calle,
                "ciudad": a.ciudad,
                "codigo_postal": a.codigo_postal,
                "es_predeterminada": a.es_predeterminada,
            }
            for a in addresses
        ],
        "derechos_ejercibles": ["acceso", "rectificacion", "cancelacion", "oposicion"],
    }


@router.put("/users/me", response_model=UserResponse)
def update_my_profile(
    payload: UserUpdateRequest,
    current_user: Usuario = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repository),
) -> Usuario:
    """Derecho de Rectificación (ARCO - LFPDPPP): Permite corregir datos del usuario."""
    if payload.email is not None:
        collision = repo.get_by_email(payload.email)
        if collision and collision.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El correo electrónico indicado ya está en uso por otra cuenta",
            )
    updated = repo.update_user(current_user, nombre=payload.nombre, email=payload.email)
    record_audit_event("arco_rectificacion", str(current_user.id), f"user:{current_user.id}")
    return updated


@router.delete("/users/me")
def cancel_my_account(
    current_user: Usuario = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    repo: UserRepository = Depends(get_user_repository),
) -> dict[str, str]:
    """Derecho de Cancelación y Oposición (ARCO - LFPDPPP): Anonimiza datos, elimina direcciones y revoca sesión."""
    user_id_str = str(current_user.id)
    repo.anonymize_user(current_user)
    if credentials is not None:
        revoke_token(credentials.credentials)
    record_audit_event("arco_cancelacion", user_id_str, f"user:{user_id_str}")
    return {"detail": "Sus datos personales han sido anonimizados y eliminados conforme a los derechos ARCO (LFPDPPP)"}


@router.post("/users/me/addresses", response_model=AddressResponse, status_code=status.HTTP_201_CREATED)
def add_my_address(
    payload: AddressCreateRequest,
    current_user: Usuario = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repository),
) -> Any:
    """Agrega una dirección de envío a la cuenta del cliente autenticado."""
    return repo.add_address(
        cliente_id=current_user.id,
        calle=payload.calle,
        ciudad=payload.ciudad,
        codigo_postal=payload.codigo_postal,
        es_predeterminada=payload.es_predeterminada,
    )


@router.get("/users/me/addresses", response_model=list[AddressResponse])
def list_my_addresses(
    current_user: Usuario = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repository),
) -> Any:
    """Lista las direcciones guardadas del cliente autenticado."""
    return repo.list_addresses(current_user.id)


@router.patch("/users/{user_id}/role", response_model=UserResponse)
def change_user_role(
    user_id: uuid.UUID,
    payload: RoleChangeRequest,
    admin_user: Usuario = Depends(require_roles("admin")),
    repo: UserRepository = Depends(get_user_repository),
) -> Usuario:
    """
    Cambia el rol de un usuario (restringido a administradores con registro en bitácora).
    """
    target = repo.get_by_id(user_id)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    old_role = target.tipo_usuario
    target.tipo_usuario = payload.tipo_usuario
    repo.db.commit()
    repo.db.refresh(target)
    record_audit_event(
        "role_change",
        str(admin_user.id),
        f"user:{target.id}",
        {"previous_role": old_role, "new_role": payload.tipo_usuario},
    )
    return target
