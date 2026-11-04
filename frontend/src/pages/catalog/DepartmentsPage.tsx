import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Category } from '@/api/schemas/catalog'
import { ErrorState, PageSkeleton } from '@/components/feedback/States'
import { useCategories } from '@/features/catalog/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import styles from './DepartmentsPage.module.css'

/**
 * Departamentos en móvil (pantalla 22, Movil-10-Departamentos): se baja nivel por nivel
 * (hasta 3, HU-01) con un botón para regresar. En escritorio también funciona como mapa del sitio.
 */
export function DepartmentsPage() {
  usePageTitle('Departamentos')
  const { data, isPending, isError, refetch } = useCategories()
  const [path, setPath] = useState<Category[]>([])

  if (isPending) return <PageSkeleton label="Cargando departamentos" />
  if (isError || !data)
    return (
      <ErrorState headingLevel={1} title="No pudimos cargar los departamentos" onRetry={() => refetch()} />
    )

  const current = path.at(-1)
  const items = current ? current.children : data
  const levelText = current ? `${current.name} · nivel ${path.length + 1} de 3` : 'Todos los departamentos'

  return (
    <nav aria-labelledby="dep-titulo" className={styles.panel}>
      <h1 id="dep-titulo" className={styles.title}>
        Departamentos
      </h1>

      {current && (
        <button type="button" className={styles.back} onClick={() => setPath(path.slice(0, -1))}>
          <span aria-hidden="true">‹ </span>
          {path.length > 1 ? path[path.length - 2].name : 'Todos los departamentos'}
        </button>
      )}

      <p className={styles.level} aria-live="polite">
        {levelText}
      </p>

      <ul role="list" className={styles.list}>
        {current && (
          <li>
            <Link to={`/categoria/${current.slug}`} className={`${styles.item} ${styles.all}`}>
              Ver todo en {current.name}
            </Link>
          </li>
        )}
        {items.map((c) => (
          <li key={c.slug}>
            {c.children.length > 0 ? (
              <button
                type="button"
                className={styles.item}
                onClick={() => setPath([...path, c])}
                aria-label={`${c.name}, ver subcategorías`}
              >
                {c.name}
                <span aria-hidden="true">›</span>
              </button>
            ) : (
              <Link to={`/categoria/${c.slug}`} className={styles.item}>
                {c.name}
              </Link>
            )}
          </li>
        ))}
      </ul>

      <div className={styles.extra}>
        <Link to="/sucursales">Sucursales</Link>
        <Link to="/calculadora">Calculadora de materiales</Link>
      </div>
    </nav>
  )
}
