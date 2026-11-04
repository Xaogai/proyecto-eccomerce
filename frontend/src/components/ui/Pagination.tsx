import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { cx } from '@/lib/cx'
import { pagesToShow } from '@/lib/pagination'
import styles from './Pagination.module.css'

interface PaginationProps {
  page: number
  totalPages: number
  /** Parámetro de la URL donde vive la página (por defecto "page"). */
  param?: string
}

/** Páginas como enlaces (la página vive en la URL, así se puede compartir y volver atrás). */
export function Pagination({ page, totalPages, param = 'page' }: PaginationProps) {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  if (totalPages <= 1) return null

  const hrefFor = (p: number) => {
    const next = new URLSearchParams(params)
    if (p === 1) next.delete(param)
    else next.set(param, String(p))
    const qs = next.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  return (
    <nav aria-label="Paginación" className={styles.nav}>
      {page > 1 && (
        <Link to={hrefFor(page - 1)} className={cx(styles.item, styles.text)}>
          Anterior
        </Link>
      )}
      {pagesToShow(page, totalPages).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} className={styles.gap} aria-hidden="true">
            …
          </span>
        ) : (
          <Link
            key={p}
            to={hrefFor(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Página ${p}`}
            className={styles.item}
          >
            {p}
          </Link>
        ),
      )}
      {page < totalPages && (
        <Link to={hrefFor(page + 1)} className={cx(styles.item, styles.text)}>
          Siguiente
        </Link>
      )}
    </nav>
  )
}
