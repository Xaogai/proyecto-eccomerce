import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import styles from './SideNav.module.css'

export interface SideNavItem {
  to: string
  label: string
  /** Contador opcional ("Pedidos 12") */
  badge?: ReactNode
  /** Coincidencia exacta (para la entrada "Resumen" en la raíz de la sección) */
  end?: boolean
}

/** Navegación lateral de Mi cuenta, Admin y Sucursal (AccountNav, AdminNav). La entrada actual va en carbón. */
export function SideNav({
  label,
  items,
  footer,
}: {
  label: string
  items: SideNavItem[]
  footer?: ReactNode
}) {
  return (
    <nav aria-label={label} className={styles.nav}>
      <ul role="list" className={styles.list}>
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className={styles.link}>
              <span>{item.label}</span>
              {item.badge !== undefined && <span className={styles.badge}>{item.badge}</span>}
            </NavLink>
          </li>
        ))}
      </ul>
      {footer}
    </nav>
  )
}
