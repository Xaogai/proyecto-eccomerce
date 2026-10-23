import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ProductPage } from '@/api/schemas/catalog'
import { useSelectedStore } from '@/app/providers/storeContext'
import { ErrorState } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/toastContext'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Pagination } from '@/components/ui/Pagination'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { plural } from '@/lib/format'
import { useProducts } from '../api'
import { activeFilters, PAGE_SIZE, readListing, SORT_OPTIONS, toApiParams, writeListing } from '../query'
import { CompareBar } from '@/features/compare/CompareBar'
import { ActiveFilters, Filters } from './Filters'
import { ProductGrid } from './ProductGrid'
import styles from './ProductListing.module.css'

interface ProductListingProps {
  /** Slug de la categoría (listado) o nada (búsqueda) */
  category?: string
  /** Qué mostrar cuando no hay resultados (la búsqueda muestra "¿Quisiste decir…?") */
  renderEmpty: (page: ProductPage | undefined) => ReactNode
  /** Recibe el total para pintarlo junto al título */
  onTotal?: (total: number | undefined) => void
}

/**
 * Listado con filtros, orden y paginación (prototipos Escritorio-1-Listado, Movil-1-Listado y Movil-3-Filtros).
 * Escritorio (≥1025 px): filtros en barra lateral y páginas numeradas.
 * Móvil y tablet: botón "Filtros" que abre un panel, y "Ver más" que agrega la siguiente tanda.
 */
export function ProductListing({ category, renderEmpty, onTotal }: ProductListingProps) {
  const [params, setParams] = useSearchParams()
  const state = useMemo(() => readListing(params), [params])
  const { store } = useSelectedStore()
  const desktop = useMediaQuery('escritorio')
  const { announce } = useToast()
  const [sheetOpen, setSheetOpen] = useState(false)

  // Móvil: "Ver más" agranda la página en vez de cambiarla. Vuelve a 24 cuando cambian los filtros.
  const filtersKey = writeListing(params, {}).toString()
  const resetKey = `${category}|${filtersKey}`
  const [more, setMore] = useState({ key: resetKey, limit: PAGE_SIZE })
  const limit = more.key === resetKey ? more.limit : PAGE_SIZE

  const apiParams = toApiParams(state, {
    category,
    storeId: store?.id,
    ...(desktop ? {} : { page: 1, pageSize: limit }),
  })
  const query = useProducts(apiParams)
  const data = query.data
  const facetTitles = Object.fromEntries((data?.facets ?? []).map((f) => [f.key, f.title]))
  const active = activeFilters(state, facetTitles, store?.name)

  useEffect(() => onTotal?.(data?.total), [data?.total, onTotal])

  const first = data && data.total > 0 ? (desktop ? (data.page - 1) * data.page_size + 1 : 1) : 0
  const last = data ? Math.min(data.total, first + data.items.length - 1) : 0
  const rangeText = data
    ? data.total === 0
      ? 'Sin resultados'
      : `Mostrando ${first}–${last} de ${data.total}`
    : ''

  // Anuncia el nuevo total cuando terminan de cargar los resultados de un filtro.
  useEffect(() => {
    if (!query.isFetching && data) announce(`${plural(data.total, 'producto')} encontrados`)
  }, [query.isFetching, data, announce])

  // flushSync: la casilla marcada se ve marcada de inmediato (sin esperar la transición del router).
  const update = (patch: Parameters<typeof writeListing>[1]) =>
    setParams(writeListing(params, patch), { flushSync: true })

  const filters = data && (
    <Filters
      state={state}
      facets={data.facets}
      active={active}
      onChange={update}
      storeName={store?.name}
      collapsible={!desktop}
    />
  )

  const sortSelect = (
    <label className={styles.sort}>
      <span>Ordenar por</span>
      <select value={state.sort} onChange={(e) => update({ sort: e.target.value })}>
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )

  if (query.isError && !data) {
    return (
      <ErrorState
        title="No pudimos cargar los productos"
        onRetry={() => query.refetch()}
        actions={
          <ButtonLink to="/" variant="outline">
            Ir al inicio
          </ButtonLink>
        }
      >
        Revisa tu conexión a internet y vuelve a intentarlo. Tu carrito y tus filtros siguen guardados.
      </ErrorState>
    )
  }

  const empty = data && data.total === 0
  const noFiltersApplied = active.length === 0

  return (
    <div className={styles.layout}>
      {desktop && (
        <aside className={styles.sidebar} aria-labelledby="filtros-titulo">
          <h2 id="filtros-titulo" className={styles.sidebarTitle}>
            Filtros
          </h2>
          <ActiveFilters active={active} onChange={update} />
          {filters}
        </aside>
      )}

      <section aria-label="Resultados" className={styles.results}>
        {desktop ? (
          <div className={styles.toolbar}>
            <span className={styles.range}>{rangeText}</span>
            {sortSelect}
          </div>
        ) : (
          <>
            <div className={styles.mobileBar}>
              <Button variant="secondary" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
                <FilterIcon />
                Filtros{active.length > 0 && ` (${active.length})`}
              </Button>
              {sortSelect}
            </div>
            <ActiveFilters active={active} onChange={update} showClear={false} />
          </>
        )}

        {empty && noFiltersApplied ? (
          renderEmpty(data)
        ) : empty ? (
          <div className={styles.noMatch}>
            <p>Ningún producto coincide con estos filtros.</p>
            <Button
              variant="outline"
              onClick={() => update({ attrs: {}, priceMin: null, priceMax: null, pickupToday: false })}
            >
              Limpiar filtros
            </Button>
          </div>
        ) : (
          <ProductGrid products={data?.items} loading={query.isFetching || query.isPending} />
        )}

        <CompareBar />
        {data && !empty && desktop && (
          <Pagination page={data.page} totalPages={Math.ceil(data.total / data.page_size)} />
        )}
        {data && !empty && !desktop && data.items.length < data.total && (
          <Button
            variant="outline"
            fullWidth
            loading={query.isFetching}
            onClick={() => setMore({ key: resetKey, limit: limit + PAGE_SIZE })}
          >
            Ver {Math.min(PAGE_SIZE, data.total - data.items.length)} productos más
          </Button>
        )}
      </section>

      {!desktop && (
        <Dialog
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Filtros"
          variant="sheet"
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => update({ attrs: {}, priceMin: null, priceMax: null, pickupToday: false })}
              >
                Limpiar
              </Button>
              <Button onClick={() => setSheetOpen(false)} loading={query.isFetching}>
                Ver {data ? plural(data.total, 'resultado') : 'resultados'}
              </Button>
            </>
          }
        >
          <ActiveFilters active={active} onChange={update} showClear={false} />
          {filters}
        </Dialog>
      )}
    </div>
  )
}

function FilterIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  )
}
