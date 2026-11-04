import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/providers/authContext'
import { Logo } from '@/components/layout/Logo'
import { SideNav, type SideNavItem } from '@/components/layout/SideNav'
import { SkipLink } from '@/components/ui/SkipLink'
import { useRouteFocus } from '@/hooks/useRouteFocus'
import headerStyles from '@/components/layout/Header.module.css'
import styles from './layouts.module.css'

const ROLE_LABEL = { admin: 'Administrador', staff: 'Staff de sucursal', cliente: 'Cliente' } as const

const adminNav: SideNavItem[] = [
  { to: '/admin', label: 'Resumen', end: true },
  { to: '/admin/productos', label: 'Productos' },
  { to: '/admin/categorias', label: 'Categorías' },
  { to: '/admin/pedidos', label: 'Pedidos' },
  { to: '/admin/usuarios', label: 'Usuarios y roles' },
  { to: '/admin/reportes', label: 'Reportes' },
  { to: '/admin/configuracion', label: 'Configuración' },
]

const branchNav: SideNavItem[] = [
  { to: '/sucursal/inventario', label: 'Inventario' },
  { to: '/sucursal/recoleccion', label: 'Pedidos para recolección' },
  { to: '/sucursal/entrega', label: 'Entregar pedido' },
]

/** Paneles internos (Admin-* y Sucursal-*): barra oscura con usuario y "Salir", navegación lateral. */
export function InternalLayout({ section }: { section: 'admin' | 'sucursal' }) {
  useRouteFocus()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isAdmin = section === 'admin'
  const subtitle = isAdmin ? 'Administración' : `Sucursal${user?.branch_name ? ` ${user.branch_name}` : ''}`

  return (
    <>
      <SkipLink />
      <header className={headerStyles.header}>
        <div className={`${headerStyles.bar} ${styles.internalBar}`}>
          <Logo to={isAdmin ? '/admin' : '/sucursal/inventario'} suffix={subtitle} />
          {user && (
            <span className={styles.who}>
              {user.name} · {ROLE_LABEL[user.role]}
            </span>
          )}
          <button
            type="button"
            className={styles.exit}
            onClick={async () => {
              await logout()
              navigate('/cuenta/login')
            }}
          >
            Salir
          </button>
        </div>
      </header>
      <div className={`${styles.withSide} ${styles.internal}`}>
        <SideNav label={isAdmin ? 'Administración' : 'Sucursal'} items={isAdmin ? adminNav : branchNav} />
        <main id="contenido" className={styles.sideContent}>
          <Outlet />
        </main>
      </div>
    </>
  )
}
