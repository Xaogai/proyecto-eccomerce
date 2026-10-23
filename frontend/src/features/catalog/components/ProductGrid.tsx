import type { ProductSummary } from '@/api/schemas/catalog'
import { LoadingStatus, ProductCardSkeleton } from '@/components/feedback/States'
import { cx } from '@/lib/cx'
import { ProductCard } from './ProductCard'
import styles from './ProductGrid.module.css'

interface ProductGridProps {
  products?: ProductSummary[]
  loading?: boolean
  skeletons?: number
  cardVariant?: 'completa' | 'simple'
  /** "listado": 1→2→3 columnas (27.4); "inicio": auto-fill */
  layout?: 'listado' | 'inicio'
}

/** Cuadrícula de productos como lista (el lector anuncia "lista, 24 elementos"). */
export function ProductGrid({
  products,
  loading,
  skeletons = 6,
  cardVariant,
  layout = 'listado',
}: ProductGridProps) {
  if (loading && !products?.length) {
    return (
      <div className={cx(styles.grid, styles[layout])}>
        <LoadingStatus label="Cargando productos" />
        {Array.from({ length: skeletons }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    )
  }
  return (
    <ul role="list" className={cx(styles.grid, styles[layout])} aria-busy={loading || undefined}>
      {products?.map((p) => (
        <li key={p.sku} className={styles.item}>
          <ProductCard product={p} variant={cardVariant} />
        </li>
      ))}
    </ul>
  )
}
