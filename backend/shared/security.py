"""Módulo de seguridad: hashing de contraseñas (RQ-SEG-001), JWT con rotación/revocación y RBAC (Sec. 18.1)."""

from datetime import datetime, timedelta, timezone
import json
import uuid
from typing import Any

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from sqlalchemy.orm import Session

from backend.shared.config import settings
from backend.shared.configuracion import security_value
from backend.shared.database import get_db, operational_session
from backend.shared.models import BitacoraAuditoria, IntentoLoginFallido, TokenRevocado, Usuario

bearer_scheme = HTTPBearer(auto_error=False)

def record_audit_event(
    event_type: str,
    actor_id: str | None,
    resource: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Registra un evento persistente en la bitácora de auditoría para operaciones sensibles."""
    now = datetime.now(timezone.utc)
    entry_id = uuid.uuid4()
    clean_details = json.loads(json.dumps(details or {}, default=str))
    with operational_session() as session:
        session.add(
            BitacoraAuditoria(
                id=entry_id,
                fecha=now,
                tipo_evento=event_type,
                actor_id=actor_id,
                recurso=resource,
                detalles=clean_details,
            )
        )
    return {
        "id": str(entry_id),
        "timestamp": now.isoformat(),
        "event_type": event_type,
        "actor_id": actor_id,
        "resource": resource,
        "details": clean_details,
    }


def get_audit_logs(event_type: str | None = None) -> list[dict[str, Any]]:
    """Obtiene los registros de la bitácora de auditoría, opcionalmente filtrados por tipo."""
    with operational_session() as session:
        query = session.query(BitacoraAuditoria)
        if event_type:
            query = query.filter(BitacoraAuditoria.tipo_evento == event_type)
        rows = query.order_by(BitacoraAuditoria.fecha.asc()).all()
        return [
            {
                "id": str(row.id),
                "timestamp": row.fecha.isoformat(),
                "event_type": row.tipo_evento,
                "actor_id": row.actor_id,
                "resource": row.recurso,
                "details": row.detalles,
            }
            for row in rows
        ]


def hash_password(plain_password: str) -> str:
    """
    Genera el hash seguro de una contraseña usando bcrypt (RQ-SEG-001).

    Args:
        plain_password: Contraseña en texto plano.

    Returns:
        str: Hash criptográfico de la contraseña.
    """
    salt = bcrypt.gensalt(rounds=4)
    return bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """
    Verifica una contraseña en texto plano contra su hash bcrypt almacenado (RQ-SEG-001).

    Args:
        plain_password: Contraseña proporcionada por el usuario.
        password_hash: Hash almacenado en la base de datos.

    Returns:
        bool: True si la contraseña coincide, False en caso contrario.
    """
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _encode_jwt(payload: dict[str, Any]) -> str:
    """Codifica un JWT firmado con HS256 usando PyJWT."""
    return str(jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm))


def _decode_jwt(token: str) -> dict[str, Any]:
    """Decodifica y valida un token JWT firmado con HS256."""
    try:
        return dict(jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
        ) from exc


def create_access_token(user_id: str, email: str, role: str) -> str:
    """
    Crea un access token JWT de vida corta (15-30 min conforme a Sec. 18.1).

    Args:
        user_id: UUID del usuario en formato string.
        email: Correo electrónico del usuario.
        role: Rol del usuario ('cliente', 'admin', 'staff').

    Returns:
        str: Token JWT firmado.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=security_value("minutos_sesion"))).timestamp()),
    }
    return _encode_jwt(payload)


def create_refresh_token(user_id: str, email: str, role: str) -> str:
    """
    Crea un refresh token JWT de larga duración para rotación de sesión (Sec. 18.1).

    Args:
        user_id: UUID del usuario en formato string.
        email: Correo electrónico del usuario.
        role: Rol del usuario ('cliente', 'admin', 'staff').

    Returns:
        str: Refresh token JWT firmado.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "refresh",
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.jwt_refresh_expires_days)).timestamp()),
    }
    return _encode_jwt(payload)


def create_password_reset_token(user_id: str, email: str) -> str:
    """Crea un token JWT de un solo uso (15 min) para recuperación de contraseña (HU-03)."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "password_reset",
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=15)).timestamp()),
    }
    return _encode_jwt(payload)


def decode_token(token: str, expected_type: str = "access") -> dict[str, Any]:
    """
    Valida un JWT, verifica que no haya sido revocado y comprueba su tipo.

    Args:
        token: Cadena JWT.
        expected_type: Tipo esperado ('access' o 'refresh').

    Returns:
        dict[str, Any]: Claims contenidos en el token.
    """
    payload = _decode_jwt(token)
    jti = payload.get("jti")
    if jti and _is_token_revoked(str(jti)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El token ha sido revocado",
        )
    if payload.get("type") != expected_type:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Se esperaba un token de tipo {expected_type}",
        )
    return payload


def _is_token_revoked(jti: str) -> bool:
    """Consulta en la base de datos si el JTI del token fue revocado."""
    with operational_session() as session:
        return session.get(TokenRevocado, jti) is not None


def revoke_token(token: str) -> None:
    """Revoca un token persistiendo su JTI y purga las revocaciones que ya no pueden usarse."""
    payload = _decode_jwt(token)
    jti = payload.get("jti")
    if not jti:
        return
    purge_before = datetime.now(timezone.utc) - timedelta(days=settings.jwt_refresh_expires_days + 1)
    with operational_session() as session:
        session.query(TokenRevocado).filter(TokenRevocado.revocado_en < purge_before).delete()
        if session.get(TokenRevocado, str(jti)) is None:
            session.add(TokenRevocado(jti=str(jti)))


def _recent_failed_attempts(session: Session, email: str) -> int:
    """Cuenta los intentos fallidos del correo dentro de la ventana de bloqueo."""
    window_start = datetime.now(timezone.utc) - timedelta(minutes=security_value("minutos_bloqueo"))
    return (
        session.query(IntentoLoginFallido)
        .filter(IntentoLoginFallido.email == email, IntentoLoginFallido.fecha > window_start)
        .count()
    )


def check_account_lockout(email: str) -> None:
    """Verifica si una cuenta está bloqueada temporalmente por intentos fallidos (Sec. 18.1)."""
    with operational_session() as session:
        attempts = _recent_failed_attempts(session, email)
    if attempts >= security_value("intentos_maximos"):
        record_audit_event("account_locked", None, f"user:{email}", {"attempts": attempts})
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "account_locked",
                "message": "Bloqueamos tu cuenta por seguridad tras varios intentos fallidos.",
                "reintentar_en_s": security_value("minutos_bloqueo") * 60,
            },
        )


def register_failed_login(email: str) -> int:
    """Registra un intento fallido de inicio de sesión y regresa cuántos van en la ventana de bloqueo."""
    with operational_session() as session:
        session.add(IntentoLoginFallido(email=email))
        session.flush()
        count = _recent_failed_attempts(session, email)
    record_audit_event("login_failed", None, f"user:{email}", {"count": count})
    return count


def clear_failed_logins(email: str) -> None:
    """Limpia el contador de intentos fallidos tras un inicio de sesión exitoso."""
    with operational_session() as session:
        session.query(IntentoLoginFallido).filter(IntentoLoginFallido.email == email).delete()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Usuario:
    """Dependencia que obtiene el usuario autenticado a partir del Bearer token."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales de autenticación no proporcionadas",
        )
    payload = decode_token(credentials.credentials, expected_type="access")
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token sin identificador de usuario")
    try:
        user_uuid = uuid.UUID(str(user_id_str))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="ID de usuario inválido") from exc

    user = db.query(Usuario).filter(Usuario.id == user_uuid).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Usuario | None:
    """Dependencia que retorna el usuario autenticado o None si es un cliente invitado."""
    if credentials is None:
        return None
    try:
        return get_current_user(credentials, db)
    except HTTPException:
        return None


def require_roles(*allowed_roles: str):
    """
    Generador de dependencia RBAC que restringe el acceso por rol (Sec. 18.1, AE-22).

    Args:
        allowed_roles: Roles autorizados ('cliente', 'staff', 'admin').
    """

    def _role_checker(current_user: Usuario = Depends(get_current_user)) -> Usuario:
        if current_user.tipo_usuario not in allowed_roles:
            record_audit_event(
                "unauthorized_role_access",
                str(current_user.id),
                "rbac_guard",
                {"user_role": current_user.tipo_usuario, "allowed_roles": list(allowed_roles)},
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tiene permisos suficientes para realizar esta operación",
            )
        return current_user

    return _role_checker
