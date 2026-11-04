// Filtros, orden y página del listado viven en la URL (se pueden compartir y el botón Atrás funciona).
// Este módulo traduce entre los parámetros de la URL de la tienda y los de EP-02.

export const PAGE_SIZE = 24

export const SORT_OPTIONS = [
  { value: 'relevancia', label: 'Más relevantes' },
  { value: 'precio_asc', label: 'Menor precio' },
  { value: 'precio_desc', label: 'Mayor precio' },
  { value: 'nuevo', label: 'Más nuevos' },
  { value: 'calificacion', label: 'Mejor calificados' },
] as const

export interface ListingState {
  q: string
  page: number
  sort: string
  /** Pesos enteros (en la URL); se mandan a la API en centavos */
  priceMin: number | null
  priceMax: number | null
  pickupToday: boolean
  /** clave de faceta → valores ("brand" es la marca) */
  attrs: Record<string, string[]>
}

const intOrNull = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null)

export function readListing(params: URLSearchParams): ListingState {
  const attrs: Record<string, string[]> = {}
  params.forEach((value, key) => {
    if (key.startsWith('attr.') && value) attrs[key.slice(5)] = value.split(',')
  })
  return {
    q: params.get('q') ?? '',
    page: Math.max(1, intOrNull(params.get('page')) ?? 1),
    sort: params.get('sort') ?? 'relevancia',
    priceMin: intOrNull(params.get('precio_min')),
    priceMax: intOrNull(params.get('precio_max')),
    pickupToday: params.get('disponible') === 'hoy',
    attrs,
  }
}

/** Devuelve nuevos parámetros con los cambios aplicados. Cualquier cambio de filtro vuelve a la página 1. */
export function writeListing(params: URLSearchParams, patch: Partial<ListingState>): URLSearchParams {
  const next = new URLSearchParams(params)
  const set = (key: string, value: string | null) => (value ? next.set(key, value) : next.delete(key))

  if ('q' in patch) set('q', patch.q || null)
  if ('sort' in patch) set('sort', patch.sort === 'relevancia' ? null : (patch.sort ?? null))
  if ('priceMin' in patch) set('precio_min', patch.priceMin != null ? String(patch.priceMin) : null)
  if ('priceMax' in patch) set('precio_max', patch.priceMax != null ? String(patch.priceMax) : null)
  if ('pickupToday' in patch) set('disponible', patch.pickupToday ? 'hoy' : null)
  if (patch.attrs) {
    for (const key of [...next.keys()]) if (key.startsWith('attr.')) next.delete(key)
    for (const [key, values] of Object.entries(patch.attrs))
      if (values.length) next.set(`attr.${key}`, values.join(','))
  }
  if ('page' in patch) set('page', patch.page && patch.page > 1 ? String(patch.page) : null)
  else next.delete('page')
  return next
}

/** Parámetros de EP-02 a partir del estado del listado. */
export function toApiParams(
  state: ListingState,
  extra: { category?: string; storeId?: string | null; pageSize?: number; page?: number },
): Record<string, string | number> {
  const out: Record<string, string | number> = {
    page: extra.page ?? state.page,
    page_size: extra.pageSize ?? PAGE_SIZE,
    sort: state.sort,
  }
  if (extra.category) out.category = extra.category
  if (state.q) out.q = state.q
  if (extra.storeId) out.store_id = extra.storeId
  if (state.pickupToday && extra.storeId) out.pickup_today = 'true'
  if (state.priceMin != null) out.price_min = state.priceMin * 100
  if (state.priceMax != null) out.price_max = state.priceMax * 100
  for (const [key, values] of Object.entries(state.attrs)) out[`attr.${key}`] = values.join(',')
  return out
}

export interface ActiveFilter {
  id: string
  label: string
  /** Texto para el resumen leído en voz alta */
  spoken: string
  remove: Partial<ListingState>
}

const pesos = (n: number) => `$${n.toLocaleString('es-MX')}`

/** Filtros activos como chips + texto del resumen ("Filtrado por: …"). */
export function activeFilters(
  state: ListingState,
  facetTitles: Record<string, string>,
  storeName?: string,
): ActiveFilter[] {
  const out: ActiveFilter[] = []
  if (state.priceMin != null || state.priceMax != null) {
    const label =
      state.priceMin != null && state.priceMax != null
        ? `${pesos(state.priceMin)} a ${pesos(state.priceMax)}`
        : state.priceMax != null
          ? `Hasta ${pesos(state.priceMax)}`
          : `Desde ${pesos(state.priceMin!)}`
    out.push({
      id: 'precio',
      label,
      spoken: `precio ${label.toLowerCase()}`,
      remove: { priceMin: null, priceMax: null },
    })
  }
  for (const [key, values] of Object.entries(state.attrs)) {
    const title = facetTitles[key] ?? key
    for (const value of values) {
      out.push({
        id: `${key}:${value}`,
        label: `${title} ${value}`,
        spoken: `${title.toLowerCase()} ${value}`,
        remove: { attrs: { ...state.attrs, [key]: values.filter((v) => v !== value) } },
      })
    }
  }
  if (state.pickupToday && storeName) {
    out.push({
      id: 'hoy',
      label: `Recoger hoy en ${storeName}`,
      spoken: `recoger hoy en ${storeName}`,
      remove: { pickupToday: false },
    })
  }
  return out
}

export function filterSummary(filters: ActiveFilter[]): string {
  if (filters.length === 0) return 'Sin filtros activos'
  const list = filters.map((f) => f.spoken)
  const joined = list.length > 1 ? `${list.slice(0, -1).join(', ')} y ${list.at(-1)}` : list[0]
  return `Filtrado por: ${joined}. ${filters.length} ${filters.length === 1 ? 'filtro activo' : 'filtros activos'}`
}
