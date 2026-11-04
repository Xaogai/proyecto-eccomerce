"""Repositorio de acceso a datos para usuarios, roles y direcciones (Patrón Repositorio - Sec. 14.2)."""

from typing import Any
import uuid
from sqlalchemy.orm import Session

from backend.shared.models import (
    Administrador,
    Cliente,
    Direccion,
    ListaDeseos,
    StaffSucursal,
    Usuario,
)


class UserRepository:
    """Encapsula las operaciones de persistencia para la entidad Usuario y sus subtipos."""

    def __init__(self, db_session: Session) -> None:
        """Inicializa el repositorio con una sesión activa de SQLAlchemy."""
        self.db = db_session

    def get_by_id(self, user_id: uuid.UUID) -> Usuario | None:
        """
        Obtiene un usuario por su identificador UUID.

        Args:
            user_id: Identificador único del usuario.

        Returns:
            Usuario | None: Instancia del usuario o None si no existe.
        """
        return self.db.query(Usuario).filter(Usuario.id == user_id).first()

    def get_by_email(self, email: str) -> Usuario | None:
        """
        Busca un usuario por su correo electrónico.

        Args:
            email: Correo electrónico normalizado.

        Returns:
            Usuario | None: Usuario encontrado o None.
        """
        return self.db.query(Usuario).filter(Usuario.email == email.lower().strip()).first()

    def create_user(
        self,
        nombre: str,
        email: str,
        password_hash: str,
        tipo_usuario: str = "cliente",
        rol_admin: str | None = None,
        sucursal_id: uuid.UUID | None = None,
    ) -> Usuario:
        """
        Crea un usuario y su registro de especialización (Cliente, Administrador o StaffSucursal).

        Args:
            nombre: Nombre completo del usuario.
            email: Correo electrónico único.
            password_hash: Contraseña cifrada mediante hash (RQ-SEG-001).
            tipo_usuario: Discriminador ('cliente', 'admin', 'staff').
            rol_admin: Sub-rol en caso de administrador.
            sucursal_id: UUID de sucursal en caso de staff.

        Returns:
            Usuario: Entidad persistida en la base de datos.
        """
        user = Usuario(
            nombre=nombre,
            email=email.lower().strip(),
            password_hash=password_hash,
            tipo_usuario=tipo_usuario,
        )
        self.db.add(user)
        self.db.flush()

        if tipo_usuario == "cliente":
            self.db.add(Cliente(usuario_id=user.id))
        elif tipo_usuario == "admin":
            self.db.add(Administrador(usuario_id=user.id, rol=rol_admin or "superadmin"))
            # También habilitamos perfil cliente por si realiza pruebas de compra
            self.db.add(Cliente(usuario_id=user.id))
        elif tipo_usuario == "staff":
            if sucursal_id is not None:
                self.db.add(StaffSucursal(usuario_id=user.id, sucursal_id=sucursal_id))
            self.db.add(Cliente(usuario_id=user.id))

        self.db.commit()
        self.db.refresh(user)
        return user

    def update_user(self, user: Usuario, nombre: str | None = None, email: str | None = None) -> Usuario:
        """
        Actualiza los datos personales de un usuario (Derecho de Rectificación ARCO).

        Args:
            user: Instancia del usuario a modificar.
            nombre: Nuevo nombre completo opcional.
            email: Nuevo correo electrónico opcional.

        Returns:
            Usuario: Usuario actualizado.
        """
        if nombre is not None:
            user.nombre = nombre
        if email is not None:
            user.email = email.lower().strip()
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_password(self, user: Usuario, new_password_hash: str) -> Usuario:
        """Actualiza el hash de contraseña de un usuario tras recuperación verificada (HU-03, RQ-SEG-001)."""
        user.password_hash = new_password_hash
        self.db.commit()
        self.db.refresh(user)
        return user

    def anonymize_user(self, user: Usuario) -> None:
        """
        Anonimiza los datos personales de un usuario (Derecho de Cancelación/Oposición ARCO).

        Args:
            user: Usuario que solicita la cancelación de sus datos.
        """
        anon_suffix = str(user.id)[:8]
        user.nombre = f"Usuario Cancelado {anon_suffix}"
        user.email = f"deleted_{anon_suffix}@anon.ferremarket.local"
        user.telefono = None
        user.acepta_marketing = False
        user.acepta_personalizacion = False
        self.db.query(ListaDeseos).filter(ListaDeseos.usuario_id == user.id).delete()
        self.db.query(Direccion).filter(Direccion.cliente_id == user.id).delete()
        self.db.commit()

    def ensure_cliente_profile(self, user_id: uuid.UUID) -> Cliente:
        """Garantiza que exista el registro en la tabla `clientes` para el usuario."""
        cliente = self.db.query(Cliente).filter(Cliente.usuario_id == user_id).first()
        if not cliente:
            cliente = Cliente(usuario_id=user_id)
            self.db.add(cliente)
            self.db.commit()
            self.db.refresh(cliente)
        return cliente

    def add_address(self, cliente_id: uuid.UUID, **fields: Any) -> Direccion:
        """
        Agrega una dirección postal asociada al cliente.

        Args:
            cliente_id: UUID del cliente.
            fields: Columnas de `direcciones` (calle, ciudad, codigo_postal, es_predeterminada, colonia…).

        Returns:
            Direccion: Dirección creada. La primera dirección del cliente queda como predeterminada.
        """
        self.ensure_cliente_profile(cliente_id)
        es_predeterminada = bool(fields.pop("es_predeterminada", False)) or not self.list_addresses(cliente_id)
        if es_predeterminada:
            self._clear_default(cliente_id)
        direccion = Direccion(cliente_id=cliente_id, es_predeterminada=es_predeterminada, **fields)
        self.db.add(direccion)
        self.db.commit()
        self.db.refresh(direccion)
        return direccion

    def _clear_default(self, cliente_id: uuid.UUID) -> None:
        """Quita la marca de predeterminada a las direcciones del cliente."""
        self.db.query(Direccion).filter(Direccion.cliente_id == cliente_id).update({"es_predeterminada": False})

    def get_address(self, cliente_id: uuid.UUID, address_id: uuid.UUID) -> Direccion | None:
        """Dirección del cliente (None si no existe o es de otra persona)."""
        d = self.db.get(Direccion, address_id)
        return d if d is not None and d.cliente_id == cliente_id else None

    def update_address(self, direccion: Direccion, changes: dict[str, Any]) -> Direccion:
        """Aplica los cambios enviados; marcarla como predeterminada desmarca las demás."""
        if changes.pop("es_predeterminada", None):
            self._clear_default(direccion.cliente_id)
            direccion.es_predeterminada = True
        for key, value in changes.items():
            setattr(direccion, key, value)
        self.db.commit()
        self.db.refresh(direccion)
        return direccion

    def delete_address(self, direccion: Direccion) -> None:
        """Borra la dirección; si era la predeterminada, pasa la marca a otra."""
        cliente_id, era_principal = direccion.cliente_id, direccion.es_predeterminada
        self.db.delete(direccion)
        self.db.flush()
        if era_principal:
            otra = self.db.query(Direccion).filter(Direccion.cliente_id == cliente_id).first()
            if otra is not None:
                otra.es_predeterminada = True
        self.db.commit()

    def list_addresses(self, cliente_id: uuid.UUID) -> list[Direccion]:
        """Lista todas las direcciones registradas de un cliente."""
        return self.db.query(Direccion).filter(Direccion.cliente_id == cliente_id).all()
