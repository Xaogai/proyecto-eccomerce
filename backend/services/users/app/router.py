"""Controladores REST para Autenticación, Usuarios, Direcciones y Derechos ARCO (LFPDPPP)."""

from datetime import datetime, timezone
import uuid
from typing import Any

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from backend.services.users.app.schemas import (
    AccountDeleteRequest,
    AddressCreateRequest,
    AddressResponse,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RoleChangeRequest,
    LogoutRequest,
    PasswordChangeRequest,
    TokenRefreshRequest,
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
    UserUpdateRequest,
)
from backend.services.users.app.user_repository import UserRepository
from backend.shared.config import settings
from backend.shared.configuracion import security_value
from backend.shared.database import get_db
from backend.shared.models import Pedido, Usuario
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


def user_response(user: Usuario) -> UserResponse:
    """Perfil público con la sucursal del staff (sin password_hash)."""
    staff = user.staff_sucursal
    return UserResponse(
        id=user.id,
        nombre=user.nombre,
        email=user.email,
        fecha_registro=user.fecha_registro,
        tipo_usuario=user.tipo_usuario,
        telefono=user.telefono,
        acepta_marketing=user.acepta_marketing,
        acepta_personalizacion=user.acepta_personalizacion,
        sucursal_id=staff.sucursal_id if staff else None,
        sucursal_nombre=staff.sucursal.nombre if staff and staff.sucursal else None,
    )


@router.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(
    payload: UserRegisterRequest,
    repo: UserRepository = Depends(get_user_repository),
) -> UserResponse:
    """
    Registra un nuevo usuario en la plataforma con contraseña cifrada (HU-03, RQ-SEG-001).

    Args:
        payload: Datos de registro validados.
        repo: Repositorio de usuarios inyectado.

    Returns:
        Usuario: Perfil del usuario registrado.
    """
    if not payload.acepta_aviso_privacidad:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debe aceptar el aviso de privacidad (LFPDPPP) para crear una cuenta",
        )
    existing = repo.get_by_email(payload.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "email_taken",
                "message": "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.",
            },
        )
    pwd_hash = hash_password(payload.password)
    user = repo.create_user(
        nombre=payload.nombre,
        email=payload.email,
        password_hash=pwd_hash,
        # El registro público solo crea clientes: admin y staff los asigna un administrador.
        tipo_usuario="cliente",
    )
    user.telefono = payload.telefono
    user.acepta_marketing = payload.acepta_marketing
    repo.db.commit()
    record_audit_event("user_registered", str(user.id), f"user:{user.id}", {"role": user.tipo_usuario})
    send_email_notification(
        recipient_email=user.email,
        recipient_user_id=str(user.id),
        subject="Bienvenido a Ferremarket — Cuenta registrada",
        body=f"Hola {user.nombre}, tu cuenta ({user.email}) ha sido creada exitosamente en Ferremarket.",
        template_type="account_welcome",
    )
    return user_response(user)


REFRESH_COOKIE = "refresh_token"


def set_refresh_cookie(response: Response, token: str, persistent: bool) -> None:
    """Refresh token en cookie HttpOnly para que el JavaScript de la página no pueda leerlo (Sec. 18.1)."""
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.jwt_refresh_expires_days * 86400 if persistent else None,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/api/v1/auth",
    )


@router.post("/auth/login", response_model=TokenResponse)
def login_user(
    payload: UserLoginRequest,
    response: Response,
    repo: UserRepository = Depends(get_user_repository),
) -> TokenResponse:
    """
    Autentica al usuario y emite tokens JWT access y refresh (Sec. 13.1, Sec. 18.1).

    Args:
        payload: Correo, contraseña y si se mantiene la sesión al cerrar el navegador.
        response: Respuesta donde se pone la cookie HttpOnly con el refresh token.
        repo: Repositorio de usuarios.

    Returns:
        TokenResponse: Par de tokens access y refresh.

    Raises:
        HTTPException: 401 con los intentos restantes, o 429 si la cuenta está bloqueada.
    """
    normalized_email = payload.email.strip().lower()
    check_account_lockout(normalized_email)
    user = repo.get_by_email(normalized_email)
    if not user or not verify_password(payload.password, user.password_hash):
        attempts = register_failed_login(normalized_email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "invalid_credentials",
                "message": "El correo o la contraseña no son correctos.",
                "intentos_restantes": max(0, security_value("intentos_maximos") - attempts),
            },
        )
    clear_failed_logins(normalized_email)
    access_token = create_access_token(str(user.id), user.email, user.tipo_usuario)
    refresh_token = create_refresh_token(str(user.id), user.email, user.tipo_usuario, payload.recordar)
    record_audit_event("user_login", str(user.id), f"user:{user.id}", {"role": user.tipo_usuario})
    set_refresh_cookie(response, refresh_token, payload.recordar)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in_minutes=security_value("minutos_sesion"),
    )


@router.post("/auth/refresh", response_model=TokenResponse)
def refresh_access_token(
    response: Response,
    payload: TokenRefreshRequest | None = None,
    refresh_cookie: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    repo: UserRepository = Depends(get_user_repository),
) -> TokenResponse:
    """
    Renueva el access token y rota el refresh token (invalidando el anterior - Sec. 18.1).

    Args:
        response: Respuesta donde se pone la cookie con el refresh token nuevo.
        payload: Refresh token en el cuerpo (clientes sin cookie).
        refresh_cookie: Refresh token de la cookie HttpOnly (el navegador).
        repo: Repositorio de usuarios.

    Returns:
        TokenResponse: Nuevos tokens access y refresh.

    Raises:
        HTTPException: 401 si no hay token, está vencido o ya se usó.
    """
    token = (payload.refresh_token if payload else None) or refresh_cookie
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión no iniciada")
    claims = decode_token(token, expected_type="refresh")
    revoke_token(token)
    user_id = uuid.UUID(str(claims["sub"]))
    user = repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    new_access = create_access_token(str(user.id), user.email, user.tipo_usuario)
    recordar = bool(claims.get("recordar"))
    new_refresh = create_refresh_token(str(user.id), user.email, user.tipo_usuario, recordar)
    set_refresh_cookie(response, new_refresh, persistent=recordar)
    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in_minutes=security_value("minutos_sesion"),
    )


@router.post("/auth/logout")
def logout_user(
    response: Response,
    payload: LogoutRequest | None = None,
    refresh_cookie: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, str]:
    """
    Invalida el token actual en el cierre de sesión (Sec. 18.1, AE-22).

    Args:
        response: Respuesta donde se borra la cookie del refresh token.
        payload: Refresh token en el cuerpo (clientes sin cookie).
        refresh_cookie: Refresh token de la cookie HttpOnly.
        credentials: Bearer token actual.

    Returns:
        dict[str, str]: Mensaje de confirmación.
    """
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autenticado")
    revoke_token(credentials.credentials)
    for token in {payload.refresh_token if payload else None, refresh_cookie} - {None}:
        try:
            revoke_token(str(token))
        except HTTPException:
            pass  # un refresh token ya inválido no impide cerrar sesión
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
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
            f"Abre este enlace en los próximos 15 minutos: {reset_link(reset_token)}"
        ),
        template_type="password_reset",
        metadata={"expires_in_minutes": 15},
    )
    # El token solo viaja por correo: en la respuesta permitiría tomar cuentas ajenas.
    return {"detail": "Si el correo está registrado, recibirá las instrucciones de recuperación."}


def reset_link(token: str) -> str:
    """Enlace de la página Restablecer contraseña del frontend."""
    return f"{settings.frontend_url.rstrip('/')}/cuenta/restablecer/{token}"


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
def get_my_profile(current_user: Usuario = Depends(get_current_user)) -> UserResponse:
    """Obtiene el perfil del usuario autenticado."""
    return user_response(current_user)


@router.post("/users/me/password")
def change_my_password(
    payload: PasswordChangeRequest,
    current_user: Usuario = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repository),
) -> dict[str, str]:
    """Cambia la contraseña verificando la actual (Mi cuenta, datos y privacidad)."""
    if not verify_password(payload.password_actual, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "wrong_password", "message": "Tu contraseña actual no es correcta."},
        )
    repo.update_password(current_user, hash_password(payload.password_nueva))
    record_audit_event("password_changed", str(current_user.id), f"user:{current_user.id}")
    return {"detail": "Contraseña actualizada"}


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
) -> UserResponse:
    """Derecho de Rectificación (ARCO - LFPDPPP): Permite corregir datos del usuario."""
    updated = repo.update_user(current_user, nombre=payload.nombre, email=payload.email)
    if payload.telefono is not None:
        updated.telefono = payload.telefono.strip() or None
        repo.db.commit()
    record_audit_event("arco_rectificacion", str(current_user.id), f"user:{current_user.id}")
    return user_response(updated)


ESTADOS_EN_CURSO = ("pendiente_pago", "confirmado", "en_preparacion", "listo_para_recoger", "enviado", "incidencia")


@router.delete("/users/me")
def cancel_my_account(
    payload: AccountDeleteRequest,
    current_user: Usuario = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repository),
) -> dict[str, str]:
    """
    Derecho de Cancelación y Oposición (ARCO - LFPDPPP): Anonimiza datos y elimina direcciones.

    Pide la contraseña y no procede con pedidos en curso (hay que entregarlos o cancelarlos antes).
    """
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "wrong_password", "message": "La contraseña no es correcta."},
        )
    en_curso = (
        repo.db.query(Pedido)
        .filter(Pedido.cliente_id == current_user.id, Pedido.estado.in_(ESTADOS_EN_CURSO))
        .order_by(Pedido.fecha.desc())
        .all()
    )
    if en_curso:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "active_orders",
                "message": "Tienes pedidos en curso.",
                "pedidos": [{"id": str(p.id), "folio": p.folio, "estado": p.estado} for p in en_curso],
            },
        )
    user_id_str = str(current_user.id)
    repo.anonymize_user(current_user)
    record_audit_event("arco_cancelacion", user_id_str, f"user:{user_id_str}")
    return {
        "detail": "Sus datos personales han sido anonimizados y eliminados conforme a los derechos ARCO (LFPDPPP)",
        "fecha_efectiva": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/users/me/addresses", response_model=AddressResponse, status_code=status.HTTP_201_CREATED)
def add_my_address(
    payload: AddressCreateRequest,
    current_user: Usuario = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repository),
) -> Any:
    """Agrega una dirección de envío a la cuenta del cliente autenticado."""
    return repo.add_address(cliente_id=current_user.id, **payload.model_dump())


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
