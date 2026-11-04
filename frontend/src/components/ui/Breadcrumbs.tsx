import { Link } from 'react-router-dom'
import styles from './Breadcrumbs.module.css'

export interface Crumb {
  label: string
  to?: string
}

/**
 * Migas de pan. En móvil solo se ve el enlace al nivel anterior ("‹ Herramientas eléctricas"),
 * como en Movil-1-Listado.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const parent = [...items].reverse().find((c, i) => i > 0 && c.to)

  return (
    <>
      <nav aria-label="Migas de pan" className={styles.nav}>
        <ol role="list" className={styles.list}>
          {items.map((c, i) => {
            const last = i === items.length - 1
            return (
              <li key={`${c.label}-${i}`} className={styles.item}>
                {last || !c.to ? (
                  <span aria-current={last ? 'page' : undefined} className={styles.current}>
                    {c.label}
                  </span>
                ) : (
                  <Link to={c.to}>{c.label}</Link>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
      {parent?.to && (
        <Link to={parent.to} className={styles.back}>
          <span aria-hidden="true">‹&nbsp;</span>
          {parent.label}
        </Link>
      )}
    </>
  )
}
