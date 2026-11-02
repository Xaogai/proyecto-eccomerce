"""Servicio de notificaciones transaccionales por correo con persistencia y soporte SMTP (HU-10, Sec. 3.2)."""

from email.message import EmailMessage
import smtplib
from typing import Any

from backend.shared.config import settings
from backend.shared.database import operational_session
from backend.shared.models import BitacoraAuditoria
from backend.shared.security import record_audit_event


def _deliver_smtp_if_configured(recipient_email: str, subject: str, body: str) -> str:
    """Envía el mensaje por SMTP si `settings.smtp_host` está configurado; retorna el modo de entrega."""
    if not settings.smtp_host.strip():
        return "sandbox_outbox"
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from_email
    msg["To"] = recipient_email
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=5) as server:
            if settings.smtp_user and settings.smtp_password:
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        return "smtp_sent"
    except Exception:
        return "smtp_fallback_outbox"


def send_email_notification(
    recipient_email: str,
    recipient_user_id: str | None,
    subject: str,
    body: str,
    template_type: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Envía y persiste una notificación por correo electrónico al cliente (HU-10).

    Args:
        recipient_email: Correo destino del cliente.
        recipient_user_id: UUID del usuario destinatario en string (si aplica).
        subject: Asunto del correo.
        body: Resumen legible del correo (incluye folio y detalle de compra en HU-10).
        template_type: Tipo ('order_confirmation', 'shipment_status', 'password_reset').
        metadata: Metadatos estructurados adicionales.

    Returns:
        dict[str, Any]: Registro de la notificación persistida.
    """
    delivery_mode = _deliver_smtp_if_configured(recipient_email, subject, body)
    details: dict[str, Any] = {
        "recipient_email": recipient_email,
        "subject": subject,
        "body": body,
        "template_type": template_type,
        "delivery_mode": delivery_mode,
        **(metadata or {}),
    }
    return record_audit_event(
        event_type="email_notification_sent",
        actor_id=recipient_user_id,
        resource=f"email:{recipient_email.strip().lower()}",
        details=details,
    )


def list_user_notifications(user_id: str, email: str) -> list[dict[str, Any]]:
    """Lista las notificaciones de correo enviadas a un usuario específico (HU-10)."""
    target_resource = f"email:{email.strip().lower()}"
    with operational_session() as session:
        rows = (
            session.query(BitacoraAuditoria)
            .filter(
                BitacoraAuditoria.tipo_evento == "email_notification_sent",
                (BitacoraAuditoria.actor_id == user_id) | (BitacoraAuditoria.recurso == target_resource),
            )
            .order_by(BitacoraAuditoria.fecha.desc())
            .all()
        )
        return [
            {
                "id": str(row.id),
                "timestamp": row.fecha.isoformat(),
                "subject": row.detalles.get("subject", ""),
                "body": row.detalles.get("body", ""),
                "template_type": row.detalles.get("template_type", ""),
                "delivery_mode": row.detalles.get("delivery_mode", "sandbox_outbox"),
                "metadata": row.detalles,
            }
            for row in rows
        ]
