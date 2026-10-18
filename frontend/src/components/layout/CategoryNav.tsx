import { Link, useMatch } from 'react-router-dom'
import { findDepartment, useCategories } from '@/features/catalog/api'
import styles from './CategoryNav.module.css'

/**
 * Barra naranja de departamentos (A1). Visible desde 769 px; en móvil se usa /departamentos.
 * Marca el departamento que contiene la categoría actual.
 */
export function CategoryNav() {
  const { data } = useCategories()
  // useMatch y no useParams: el layout no recibe los parámetros de su ruta hija.
  const slug = useMatch('/categoria/:slug')?.params.slug
  const active = data && slug ? findDepartment(data, slug)?.slug : undefined

  return (
    <nav aria-label="Categorías" className={styles.nav}>
      <ul role="list" className={`contenedor ${styles.list}`}>
        {(data ?? []).map((c) => (
          <li key={c.slug}>
            <Link
              to={`/categoria/${c.slug}`}
              className={styles.link}
              aria-current={c.slug === active ? 'page' : undefined}
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
