import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/feedback/States'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { ButtonLink } from '@/components/ui/Button'
import { findCategoryPath, useCategories } from '@/features/catalog/api'
import { ProductListing } from '@/features/catalog/components/ProductListing'
import { usePageTitle } from '@/hooks/usePageTitle'
import { plural } from '@/lib/format'
import { NotFoundPage } from '../NotFoundPage'
import styles from './catalog.module.css'

/** Listado por categoría (pantallas 02, 07 y 09; HU-01 y HU-09). */
export function CategoryPage() {
  const { slug = '' } = useParams()
  const categories = useCategories()
  const [total, setTotal] = useState<number>()
  const path = categories.data ? findCategoryPath(categories.data, slug) : []
  const category = path.at(-1)
  usePageTitle(category?.name)

  if (categories.isPending) return <PageSkeleton label="Cargando categoría" />
  if (categories.isError) {
    return (
      <ErrorState
        headingLevel={1}
        title="No pudimos cargar los productos"
        onRetry={() => categories.refetch()}
      >
        Revisa tu conexión a internet y vuelve a intentarlo. Tu carrito sigue guardado.
      </ErrorState>
    )
  }
  if (categories.data && !category) return <NotFoundPage />

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Inicio', to: '/' },
          ...path.map((c, i) => ({
            label: c.name,
            to: i < path.length - 1 ? `/categoria/${c.slug}` : undefined,
          })),
        ]}
      />
      <div className={styles.titleRow}>
        <h1>{category?.name}</h1>
        {total !== undefined && <span className={styles.total}>{plural(total, 'producto')}</span>}
      </div>

      {category && category.children.length > 0 && (
        <nav aria-label={`Subcategorías de ${category.name}`}>
          <ul role="list" className={styles.subcats}>
            {category.children.map((c) => (
              <li key={c.slug}>
                <ButtonLink to={`/categoria/${c.slug}`} variant="outline" size="sm">
                  {c.name}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {category && (
        <ProductListing
          key={category.slug}
          category={category.slug}
          onTotal={setTotal}
          renderEmpty={() => (
            <EmptyState
              title="Aún no hay productos en esta categoría"
              actions={
                <ButtonLink to="/departamentos" variant="outline">
                  Ver departamentos
                </ButtonLink>
              }
            >
              Pronto agregaremos productos. Mientras tanto, explora otros departamentos.
            </EmptyState>
          )}
        />
      )}
    </>
  )
}
