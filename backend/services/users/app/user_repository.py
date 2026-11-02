"""Repositorio de acceso a datos para usuarios, roles y direcciones (Patrón Repositorio - Sec. 14.2)."""

import uuid
from sqlalchemy.orm import Session

from backend.shared.models import (
    Administrador,
    Cliente,
    Direccion,
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

    def add_address(
        self,
        cliente_id: uuid.UUID,
        calle: str,
        ciudad: str,
        codigo_postal: str,
        es_predeterminada: bool = False,
    ) -> Direccion:
        """
        Agrega una dirección postal asociada al cliente.

        Args:
            cliente_id: UUID del cliente.
            calle: Calle y número.
            ciudad: Ciudad o municipio.
            codigo_postal: Código postal.
            es_predeterminada: Si se marca como dirección predeterminada.

        Returns:
            Direccion: Dirección creada.
        """
        self.ensure_cliente_profile(cliente_id)
        if es_predeterminada:
            self.db.query(Direccion).filter(Direccion.cliente_id == cliente_id).update(
                {"es_predeterminada": False}
            )
        direccion = Direccion(
            cliente_id=cliente_id,
            calle=calle,
            ciudad=ciudad,
            codigo_postal=codigo_postal,
            es_predeterminada=es_predeterminada,
        )
        self.db.add(direccion)
        self.db.commit()
        self.db.refresh(direccion)
        return direccion

    def list_addresses(self, cliente_id: uuid.UUID) -> list[Direccion]:
        """Lista todas las direcciones registradas de un cliente."""
        return self.db.query(Direccion).filter(Direccion.cliente_id == cliente_id).all()
