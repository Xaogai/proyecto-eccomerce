// Lógica del catálogo simulado: filtros, facetas, orden, búsqueda y forma de las respuestas (EP-02 a EP-05).
import { fakerES_MX as faker } from '@faker-js/faker'
import type { ProductDetail, ProductSummary, Review } from '@/api/schemas/catalog'
import { normalize } from '@/lib/text'
import { attrTitles, type DbProduct, type DbVariant } from './seed'
import { categoryPath, categoryWithDescendants, db } from './store'

export const DEFAULT_PAGE_SIZE = 24
const LOW_STOCK = 5

type StockStatus = 'ok' | 'low' | 'out' | 'ship_only'

const totalStock = (v: DbVariant) => Object.values(v.stock).reduce((a, b) => a + b, 0)
export const minPrice = (p: DbProduct) => Math.min(...p.variants.map((v) => v.price))

/** Estado y texto de stock de un producto (o variante) visto desde una sucursal. */
export function stockFor(
  variants: DbVariant[],
  storeId: string | null,
): { status: StockStatus; qty: number; label: string } {
  const store = storeId ? db.stores.find((s) => s.id === storeId) : null
  const total = variants.reduce((n, v) => n + totalStock(v), 0)
  const ship = variants.some((v) => v.ship)

  if (store) {
    const qty = variants.reduce((n, v) => n + (v.stock[store.id] ?? 0), 0)
    if (qty > LOW_STOCK) return { status: 'ok', qty, label: `${qty} en ${store.name}` }
    if (qty > 0) return { status: 'low', qty, label: `Quedan ${qty} en ${store.name}` }
    if (total > 0) return { status: 'out', qty: 0, label: 'Agotado en tu sucursal' }
    return ship
      ? { status: 'ship_only', qty: 0, label: 'Solo envío a domicilio' }
      : { status: 'out', qty: 0, label: 'Agotado' }
  }
  const stores = db.stores.filter((s) => variants.some((v) => (v.stock[s.id] ?? 0) > 0)).length
  if (stores > 0)
    return {
      status: 'ok',
      qty: total,
      label: `Disponible en ${stores} ${stores === 1 ? 'sucursal' : 'sucursales'}`,
    }
  return ship
    ? { status: 'ship_only', qty: 0, label: 'Solo envío a domicilio' }
    : { status: 'out', qty: 0, label: 'Agotado' }
}

const image = (p: DbProduct, alt = `Foto de ${p.name}`) => ({ url: '/mock/producto.svg', alt })

export function toSummary(p: DbProduct, storeId: string | null): ProductSummary {
  const stock = stockFor(p.variants, storeId)
  const withStock = p.variants.find((v) => stockFor([v], storeId).qty > 0) ?? p.variants[0]
  const prices = p.variants.map((v) => v.price)
  return {
    sku: p.sku,
    variant_sku: withStock.sku,
    name: p.name,
    brand: p.brand,
    image: image(p),
    price: Math.min(...prices),
    price_from: new Set(prices).size > 1 ? Math.min(...prices) : undefined,
    variant_count: p.variants.length,
    stock: { status: stock.status, label: stock.label },
    rating: p.rating,
  }
}

export function toDetail(p: DbProduct, storeId: string | null): ProductDetail {
  return {
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    description: p.description,
    category_path: categoryPath(p.category),
    images: ['vista lateral', 'vista frontal', 'detalle', 'en uso'].map((view) =>
      image(p, `${p.name}, ${view}`),
    ),
    images_360: p.has360 ? Array.from({ length: 24 }, () => '/mock/producto.svg') : undefined,
    variants: p.variants.map((v) => {
      const s = stockFor([v], storeId)
      return {
        sku: v.sku,
        label: v.label,
        price: v.price,
        stock: { store_id: storeId, qty: s.qty, status: s.status },
      }
    }),
    specs: p.specs,
    rating: p.rating,
  }
}

// ---------- Búsqueda ----------

function haystack(p: DbProduct): string {
  const cat = categoryPath(p.category)
    .map((c) => c.name)
    .join(' ')
  return normalize(`${p.name} ${p.brand} ${cat} ${p.variants.map((v) => v.sku).join(' ')} sku ${p.sku}`)
}

const tokens = (q: string) => normalize(q).split(/\s+/).filter(Boolean)

export function matchesQuery(p: DbProduct, q: string): boolean {
  const text = haystack(p)
  return tokens(q).every((t) => text.includes(t))
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[b.length]
}

/**
 * "¿Quisiste decir…?": corrige cada palabra con la más parecida del catálogo y quita
 * las que no existen, hasta encontrar una búsqueda con resultados.
 */
export function suggestCorrection(q: string, products: DbProduct[]): string | null {
  const vocabulary = new Set(
    products.flatMap((p) => tokens(`${p.name} ${p.brand}`)).filter((w) => w.length > 2),
  )
  const fixed = tokens(q).flatMap((t) => {
    if (vocabulary.has(t)) return [t]
    let best: string | null = null
    let bestDist = 3
    for (const w of vocabulary) {
      const d = levenshtein(t, w)
      if (d < bestDist) {
        best = w
        bestDist = d
      }
    }
    return best ? [best] : []
  })
  // Quita palabras del final hasta que haya resultados ("taladro inalambrico rojo 36v" → "taladro inalambrico").
  for (let n = fixed.length; n > 0; n--) {
    const candidate = fixed.slice(0, n).join(' ')
    if (candidate !== normalize(q) && products.some((p) => matchesQuery(p, candidate))) {
      // Recupera la forma con acentos tal como aparece en algún nombre.
      return restoreAccents(candidate, products)
    }
  }
  return null
}

function restoreAccents(candidate: string, products: DbProduct[]): string {
  const words = new Map<string, string>()
  for (const p of products) {
    for (const w of p.name.toLowerCase().split(/\s+/)) words.set(normalize(w), w)
  }
  return candidate
    .split(' ')
    .map((w) => words.get(w) ?? w)
    .join(' ')
}

// ---------- Listado con filtros y facetas ----------

export interface ProductQuery {
  category?: string | null
  q?: string | null
  page: number
  pageSize: number
  sort: string
  storeId: string | null
  pickupToday: boolean
  priceMin: number | null
  priceMax: number | null
  /** attr.<clave> → valores seleccionados ("brand" es la marca) */
  attrs: Record<string, string[]>
}

export function parseQuery(url: URL): ProductQuery {
  const p = url.searchParams
  const num = (k: string) => (p.get(k) && !Number.isNaN(Number(p.get(k))) ? Number(p.get(k)) : null)
  const attrs: Record<string, string[]> = {}
  p.forEach((value, key) => {
    if (key.startsWith('attr.') && value) attrs[key.slice(5)] = value.split(',')
  })
  return {
    category: p.get('category'),
    q: p.get('q'),
    page: Math.max(1, num('page') ?? 1),
    pageSize: Math.min(96, Math.max(1, num('page_size') ?? DEFAULT_PAGE_SIZE)),
    sort: p.get('sort') ?? 'relevancia',
    storeId: p.get('store_id'),
    pickupToday: p.get('pickup_today') === 'true',
    priceMin: num('price_min'),
    priceMax: num('price_max'),
    attrs,
  }
}

const attrValue = (p: DbProduct, key: string) => (key === 'brand' ? p.brand : p.attrs[key])

/** Aplica todos los filtros menos el de la faceta `except` (así cada faceta cuenta sobre el resto). */
function applyFilters(base: DbProduct[], query: ProductQuery, except?: string): DbProduct[] {
  return base.filter((p) => {
    for (const [key, values] of Object.entries(query.attrs)) {
      if (key !== except && !values.includes(attrValue(p, key) ?? '')) return false
    }
    const price = minPrice(p)
    if (except !== 'price') {
      if (query.priceMin !== null && price < query.priceMin) return false
      if (query.priceMax !== null && price > query.priceMax) return false
    }
    if (query.pickupToday && query.storeId && stockFor(p.variants, query.storeId).qty === 0) return false
    return true
  })
}

function relevance(p: DbProduct, q: string | null | undefined): number {
  if (!q) return 0
  const name = normalize(p.name)
  return tokens(q).reduce((n, t) => n + (name.startsWith(t) ? 3 : name.includes(t) ? 2 : 1), 0)
}

const sorters: Record<string, (a: DbProduct, b: DbProduct) => number> = {
  precio_asc: (a, b) => minPrice(a) - minPrice(b),
  precio_desc: (a, b) => minPrice(b) - minPrice(a),
  nuevo: (a, b) => b.created_at.localeCompare(a.created_at),
  calificacion: (a, b) => b.rating.avg - a.rating.avg,
}

export function listProducts(query: ProductQuery) {
  let base = db.products.filter((p) => p.status === 'publicado')
  if (query.category) {
    const slugs = categoryWithDescendants(query.category)
    base = base.filter((p) => slugs.has(p.category))
  }
  if (query.q) base = base.filter((p) => matchesQuery(p, query.q!))

  const filtered = applyFilters(base, query)
  const sorted = [...filtered].sort(
    sorters[query.sort] ??
      ((a, b) => relevance(b, query.q) - relevance(a, query.q) || b.rating.count - a.rating.count),
  )

  const keys = ['brand', ...new Set(base.flatMap((p) => Object.keys(p.attrs)))]
  const facets = keys
    .map((key) => {
      const pool = applyFilters(base, query, key)
      const counts = new Map<string, number>()
      for (const p of pool) {
        const v = attrValue(p, key)
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
      }
      const selected = query.attrs[key] ?? []
      for (const v of selected) if (!counts.has(v)) counts.set(v, 0)
      return {
        key,
        title: key === 'brand' ? 'Marca' : (attrTitles[key] ?? key),
        options: [...counts.entries()]
          .sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))
          .map(([value, count]) => ({ value, label: value, count, selected: selected.includes(value) })),
      }
    })
    .filter((f) => f.options.length > 1 || f.options.some((o) => o.selected))

  const start = (query.page - 1) * query.pageSize
  return {
    items: sorted.slice(start, start + query.pageSize).map((p) => toSummary(p, query.storeId)),
    page: query.page,
    page_size: query.pageSize,
    total: sorted.length,
    facets,
    did_you_mean:
      query.q && sorted.length === 0
        ? suggestCorrection(
            query.q,
            db.products.filter((p) => p.status === 'publicado'),
          )
        : null,
  }
}

// ---------- Sugerencias del buscador (EP-04) ----------

export function suggest(q: string) {
  const published = db.products.filter((p) => p.status === 'publicado')
  const matches = published.filter((p) => matchesQuery(p, q))
  const queries = new Map<string, number>()
  const nq = normalize(q)
  const firstToken = nq.split(' ')[0]
  for (const p of matches) {
    // Frase que empieza en la palabra escrita: "Kit taladro y atornillador" + "tala" → "taladro y"
    const words = p.name.toLowerCase().split(' ')
    const at = words.findIndex((w) => normalize(w).startsWith(firstToken))
    if (at < 0) continue
    const phrase = words.slice(at, at + 2).join(' ')
    queries.set(phrase, (queries.get(phrase) ?? 0) + 1)
  }
  const categories = new Map<string, string>()
  for (const p of matches) {
    const leaf = categoryPath(p.category).at(-1)
    if (leaf) categories.set(leaf.slug, leaf.name)
  }
  return {
    queries: [...queries.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([phrase]) => phrase)
      .slice(0, 4),
    products: matches
      .sort((a, b) => relevance(b, q) - relevance(a, q))
      .slice(0, 3)
      .map((p) => ({ sku: p.sku, name: p.name, image: image(p) })),
    categories: [...categories.entries()].slice(0, 3).map(([slug, name]) => ({ slug, name })),
  }
}

// ---------- Reseñas (EP-05) ----------

const reviewCache = new Map<string, Review[]>()

const TITLES: Record<number, string[]> = {
  5: ['Excelente compra', 'Potente y ligero', 'Muy recomendable', 'Justo lo que buscaba'],
  4: ['Buen producto', 'Cumple bien', 'Buena relación calidad-precio'],
  3: ['Regular', 'Cumple, sin más'],
  2: ['Esperaba más'],
  1: ['No me funcionó'],
}

const BODIES: Record<number, string[]> = {
  5: [
    'Funciona muy bien y llegó a tiempo. Lo volvería a comprar.',
    'Excelente calidad por el precio. Lo usé todo el fin de semana sin problemas.',
    'Lo recogí en la sucursal el mismo día. Muy práctico.',
  ],
  4: [
    'Cumple con lo que promete. El empaque podría ser mejor.',
    'Buen producto para uso en casa; para trabajo pesado se queda corto.',
    'Me gustó, aunque el manual es poco claro.',
  ],
  3: ['Hace su trabajo, pero esperaba mejores acabados.', 'Está bien para el precio, sin más.'],
  2: ['Tuve que cambiarlo porque una pieza venía floja.'],
  1: ['No funcionó desde el primer día; lo devolví.'],
}

/** Reseñas fijas por producto (semilla = SKU). Las dos primeras del 100245 son las del prototipo. */
export function reviewsFor(p: DbProduct): Review[] {
  const cached = reviewCache.get(p.sku)
  if (cached) return cached
  faker.seed(Number(p.sku.replace(/\D/g, '')) || 1)
  const count = Math.min(p.rating.count, 40)
  const list: Review[] = Array.from({ length: count }, (_, i) => {
    const rating = faker.helpers.weightedArrayElement([
      { weight: Math.round(p.rating.avg * 10), value: 5 },
      { weight: 20, value: 4 },
      { weight: 6, value: 3 },
      { weight: 2, value: 2 },
      { weight: 1, value: 1 },
    ])
    return {
      id: `${p.sku}-r${i}`,
      author: `${faker.person.firstName()} ${faker.person.lastName().charAt(0)}.`,
      rating,
      title: faker.helpers.arrayElement(TITLES[rating]),
      body: faker.helpers.arrayElement(BODIES[rating]),
      created_at: faker.date.between({ from: '2026-01-01', to: '2026-10-15' }).toISOString(),
      verified: faker.datatype.boolean(0.8),
    }
  }).sort((a, b) => b.created_at.localeCompare(a.created_at))

  if (p.sku === '100245' && list.length >= 2) {
    list[0] = {
      ...list[0],
      author: 'Ana L.',
      rating: 5,
      title: 'Potente y ligero',
      body: 'Lo usé para colgar repisas en muro de concreto. La batería me duró toda la tarde.',
      created_at: '2026-10-17T12:00:00.000Z',
      verified: true,
    }
    list[1] = {
      ...list[1],
      author: 'Iván C.',
      rating: 4,
      title: 'Buen taladro, cargador lento',
      body: 'Cumple bien en madera y block. El cargador tarda más de lo que esperaba.',
      created_at: '2026-10-02T12:00:00.000Z',
      verified: true,
    }
  }
  reviewCache.set(p.sku, list)
  return list
}

export function resetReviewCache() {
  reviewCache.clear()
}
