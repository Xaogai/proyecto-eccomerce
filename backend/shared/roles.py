"""Reglas de cambio de rol: los clientes se registran solos y el personal lo da de alta un admin."""

STAFF_ROLES = ("staff", "admin")


def role_change_error(current: str, new: str) -> dict[str, str] | None:
    """
    Motivo por el que no se permite pasar de `current` a `new`, o `None` si se permite.

    Un cliente nunca se convierte en personal (para eso está "Invitar personal") y el personal nunca
    pasa a cliente (si deja de trabajar aquí, se desactiva su cuenta). Entre staff y admin sí se cambia.
    """
    if current == new:
        return None
    if current == "cliente":
        return {
            "code": "client_role_locked",
            "message": "Los clientes no cambian de rol. Para dar acceso a alguien del personal usa «Invitar personal».",
        }
    if new == "cliente":
        return {
            "code": "staff_to_client",
            "message": "El personal no pasa a cliente. Si ya no trabaja aquí, desactiva su cuenta.",
        }
    return None
