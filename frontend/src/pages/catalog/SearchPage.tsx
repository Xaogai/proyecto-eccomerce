import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState } from '@/components/feedback/States'
import { ButtonLink } from '@/components/ui/Button'
import { useSelectedStore } from '@/app/providers/storeContext'
import { useCategories } from '@/features/catalog/api'
import { ProductListing } from '@/features/catalog/components/ProductListing'
import { SearchCombobox } from '@/features/catalog/components/SearchCombobox'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePageTitle } from '@/hooks/usePageTitle'
import { plural } from '@/lib/format'
import styles from './catalog.module.css'

/**
 * Búsqueda (pantallas 08, 16 y 23).
 * En móvil incluye el buscador con sugerencias y búsquedas recientes (Movil-2-Buscar);
 * en escritorio se busca desde el encabezado y aquí solo están los resultados.
 */
export function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q')?.trim() ?? ''
  const navigate = useNavigate()
  const desktop = useMediaQuery('menu')
  const { store } = useSelectedStore()
  // /buscar?disponible=hoy sin texto: todo lo que se puede recoger hoy en la sucursal
  const todayOnly = !q && params.get('disponible') === 'hoy' && !!store
  const title = q ? `Resultados para "${q}"` : todayOnly ? `Disponibles hoy en ${store.name}` : ''
  const [total, setTotal] = useState<number>()
  usePageTitle(title || 'Buscar')

  return (
    <>
      {!title && !desktop && <h1 className="sr-only">Buscar productos</h1>}
      {!desktop && (
        <SearchCombobox
          key={q}
          variant="pagina"
          initialQuery={q}
          autoFocus={!q}
          leading={
            <button type="button" className={styles.back} onClick={() => navigate(-1)} aria-label="Volver">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          }
        />
      )}

      {title ? (
        <>
          <div className={styles.titleRow}>
            <h1 className={styles.searchTitle}>{title}</h1>
            {total !== undefined && total > 0 && (
              <span className={styles.total}>{plural(total, 'producto')}</span>
            )}
          </div>
          <ProductListing
            key={title}
            onTotal={setTotal}
            renderEmpty={(page) =>
              q ? (
                <NoResults q={q} suggestion={page?.did_you_mean} />
              ) : (
                <EmptyState title="No hay productos para recoger hoy">
                  Prueba con envío a domicilio o elige otra sucursal.
                </EmptyState>
              )
            }
          />
        </>
      ) : (
        desktop && (
          <EmptyState headingLevel={1} title="¿Qué estás buscando?">
            Escribe un producto, una marca o un SKU en el buscador de arriba.
          </EmptyState>
        )
      )}
    </>
  )
}

/** Sin resultados (Escritorio-7-Estados, estado 1): sugerencia, consejos y categorías relacionadas. */
function NoResults({ q, suggestion }: { q: string; suggestion?: string | null }) {
  const { data } = useCategories()
  const related = (data ?? []).slice(0, 4)

  return (
    <EmptyState title={`No encontramos "${q}"`}>
      {suggestion && (
        <p className={styles.didYouMean}>
          ¿Quisiste decir <Link to={`/buscar?q=${encodeURIComponent(suggestion)}`}>{suggestion}</Link>?
        </p>
      )}
      <div className={styles.noResultsCols}>
        <div>
          <h3 className={styles.smallHeading}>Prueba así</h3>
          <ul className={styles.tips}>
            <li>Revisa la ortografía o usa menos palabras.</li>
            <li>Busca por SKU, por ejemplo: SKU 100245.</li>
            <li>Quita filtros como color o voltaje.</li>
          </ul>
        </div>
        {related.length > 0 && (
          <div>
            <h3 className={styles.smallHeading}>Departamentos</h3>
            <div className={styles.chipLinks}>
              {related.map((c) => (
                <ButtonLink key={c.slug} to={`/categoria/${c.slug}`} variant="ghost" size="sm">
                  {c.name}
                </ButtonLink>
              ))}
            </div>
          </div>
        )}
      </div>
    </EmptyState>
  )
}
