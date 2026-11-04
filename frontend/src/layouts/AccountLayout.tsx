import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/providers/authContext'
import { SideNav } from '@/components/layout/SideNav'
import styles from './layouts.module.css'

const items = [
  { to: '/cuenta', label: 'Resumen', end: true },
  { to: '/cuenta/pedidos', label: 'Mis pedidos' },
  { to: '/cuenta/direcciones', label: 'Direcciones' },
  { to: '/cuenta/deseos', label: 'Lista de deseos' },
  { to: '/cuenta/datos', label: 'Datos y privacidad' },
]

/** Mi cuenta: navegación lateral en escritorio, arriba en móvil. Va dentro de ShopLayout. */
export function AccountLayout() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className={styles.withSide}>
      <SideNav
        label="Mi cuenta"
        items={items}
        footer={
          <button
            type="button"
            className="sidenav-action"
            onClick={async () => {
              await logout()
              navigate('/')
            }}
          >
            Cerrar sesión
          </button>
        }
      />
      <div className={styles.sideContent}>
        <Outlet />
      </div>
    </div>
  )
}
