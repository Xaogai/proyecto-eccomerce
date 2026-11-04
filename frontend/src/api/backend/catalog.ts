// EP-01 a EP-09: catálogo, búsqueda, reseñas, comparador, sucursales y cotización de envío.
import type { Comparison, ProductDetail, ProductSummary, Review } from '../schemas/catalog'
import type { ShippingQuote, Store } from '../schemas/store'
import { normalize } from '@/lib/text'
import { bget, bsend } from './http'
import { type Route } from './router'
import {
  branches,
  categoryTree,
  findCategory,
  skuImage,
  slugify,
  toCategory,
  toCents,
  toPesos,
  variantLabel,
} from './shared'
import type { BBranchStock, BProduct, BProductPage, BReview, BReviewPage, BStore } from './types'

const LOW_STOCK = 5

type StockStatus = 'ok' | 'low' | 'out'

export function stockStatus(qty: number): StockStatus {
  if (qty <= 0) return 'out'
  return qty <= LOW_STOCK ? 'low' : 'ok'
}

/** Piezas de la variante en la sucursal pedida, o en todas si no se pidió sucursal. */
const variantQty = (v: BProduct['variantes'][number]) => v.stock_sucursal ?? v.stock_disponible

function stockLabel(
  product: BProduct,
  storeName: string | undefined,
): { status: StockStatus; label: string } {
  const qty = product.variantes.reduce((n, v) => n + variantQty(v), 0)
  const total = product.variantes.reduce((n, v) => n + v.stock_disponible, 0)
  if (!storeName)
    return qty > 0 ? { status: 'ok', label: 'Disponible en sucursales' } : { status: 'out', label: 'Agotado' }
  if (qty > LOW_STOCK) return { status: 'ok', label: `${qty} en ${storeName}` }
  if (qty > 0) return { status: 'low', label: `Quedan ${qty} en ${storeName}` }
  return { status: 'out', label: total > 0 ? 'Agotado en tu sucursal' : 'Agotado' }
}

function productImage(product: BProduct) {
  const first = product.imagenes[0]
  return first
    ? { url: first.url, alt: first.texto_alternativo }
    : { url: skuImage(product.variantes[0]?.sku ?? ''), alt: `Foto de ${product.nombre}` }
}

export function toSummary(product: BProduct, storeName?: string): ProductSummary {
  const prices = product.variantes.map((v) => toCents(v.precio))
  const withStock = product.variantes.find((v) => variantQty(v) > 0) ?? product.variantes[0]
  return {
    sku: product.variantes[0].sku,
    variant_sku: withStock.sku,
    name: product.nombre,
    brand: product.marca ?? '',
    image: productImage(product),
    price: Math.min(...prices),
    price_from: new Set(prices).size > 1 ? Math.min(...prices) : undefined,
    variant_count: product.variantes.length,
    stock: stockLabel(product, storeName),
    rating: { avg: product.calificacion_promedio, count: product.total_resenas },
  }
}

export function toDetail(product: BProduct, storeId: string | null): ProductDetail {
  const images = product.imagenes.length
    ? product.imagenes.map((img) => ({ url: img.url, alt: img.texto_alternativo }))
    : [productImage(product)]
  return {
    sku: product.variantes[0].sku,
    name: product.nombre,
    brand: product.marca ?? '',
    description: product.descripcion ?? '',
    category_path: product.ruta_categoria.map((c) => ({ slug: slugify(c.nombre), name: c.nombre })),
    images,
    variants: product.variantes.map((v) => {
      const qty = variantQty(v)
      return {
        sku: v.sku,
        label: variantLabel(v.atributos, v.sku),
        price: toCents(v.precio),
        stock: { store_id: storeId, qty, status: stockStatus(qty) },
      }
    }),
    specs: Object.entries(product.especificaciones).map(([k, v]) => ({ k, v: String(v) })),
    rating: { avg: product.calificacion_promedio, count: product.total_resenas },
  }
}

export function toReview(r: BReview): Review {
  return {
    id: r.id,
    author: r.autor,
    rating: r.calificacion,
    title: r.titulo,
    body: r.comentario,
    created_at: r.fecha,
    verified: r.compra_verificada,
  }
}

/** Parámetros del contrato (EP-02) → los del backend. `attr.brand` es la marca; los precios van en centavos. */
export async function productQuery(query: Record<string, string>) {
  const atributo: string[] = []
  let marca: string | undefined
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith('attr.') || !value) continue
    const attr = key.slice(5)
    if (attr === 'brand') marca = value
    else atributo.push(`${attr}:${value}`)
  }
  let category: string | undefined
  if (query.category) {
    category = findCategory(await categoryTree(), query.category)?.id
    // Una categoría que ya no existe no devuelve todo el catálogo.
    if (!category) return null
  }
  return {
    category,
    q: query.q,
    page: query.page,
    page_size: query.page_size,
    orden: query.sort,
    sucursal_id: query.store_id,
    disponible_hoy: query.pickup_today === 'true' ? true : undefined,
    min_price: query.price_min ? toPesos(query.price_min) : undefined,
    max_price: query.price_max ? toPesos(query.price_max) : undefined,
    marca,
    atributo,
  }
}

async function listProducts(query: Record<string, string>) {
  const params = await productQuery(query)
  const pageSize = Number(query.page_size ?? 24)
  if (!params) return { items: [], page: 1, page_size: pageSize, total: 0, facets: [], did_you_mean: null }
  const [data, storeName] = await Promise.all([
    bget<BProductPage>('/products', params),
    query.store_id ? branches().then((list) => list.find((b) => b.id === query.store_id)?.nombre) : undefined,
  ])
  return {
    items: data.items.filter((p) => p.variantes.length).map((p) => toSummary(p, storeName)),
    page: data.page,
    page_size: data.page_size,
    total: data.total,
    facets: data.facetas.map((f) => ({
      key: f.clave === 'marca' ? 'brand' : f.clave,
      title: f.titulo,
      options: f.opciones.map((o) => ({
        value: o.valor,
        label: o.valor,
        count: o.total,
        selected: o.seleccionada,
      })),
    })),
    did_you_mean: null,
  }
}

async function productDetail(sku: string, storeId: string | null) {
  return bget<BProduct>(`/products/${encodeURIComponent(sku)}`, { sucursal_id: storeId ?? undefined })
}

/** EP-04: el backend no tiene sugerencias; se arman con la búsqueda y el árbol de categorías. */
async function suggest(q: string) {
  const term = normalize(q.trim())
  const [data, tree] = await Promise.all([
    bget<BProductPage>('/products', { q, page_size: 5 }),
    categoryTree(),
  ])
  const flat = tree.flatMap(function walk(c): { slug: string; name: string }[] {
    return [{ slug: c.slug, name: c.name }, ...c.children.flatMap(walk)]
  })
  return {
    queries: [],
    products: data.items
      .slice(0, 3)
      .map((p) => ({ sku: p.variantes[0].sku, name: p.nombre, image: productImage(p) })),
    categories: flat.filter((c) => normalize(c.name).includes(term)).slice(0, 3),
  }
}

/** EP-07: el backend no tiene comparador; se arma con la ficha de cada producto. */
export function buildComparison(
  products: ProductDetail[],
  summaries: ProductSummary[],
  storeId: string | null,
): Comparison {
  const keys: string[] = []
  for (const p of products)
    for (const s of p.specs) if (s.k !== 'Marca' && !keys.includes(s.k)) keys.push(s.k)
  const row = (key: string, label: string, values: string[]) => ({
    key,
    label,
    values,
    differs: new Set(values).size > 1,
  })
  return {
    products: summaries,
    rows: [
      row(
        'brand',
        'Marca',
        products.map((p) => p.brand || '—'),
      ),
      ...keys.map((k) =>
        row(
          k,
          k,
          products.map((p) => p.specs.find((s) => s.k === k)?.v ?? '—'),
        ),
      ),
      row(
        'rating',
        'Calificación',
        products.map((p) => (p.rating.count ? `${p.rating.avg.toFixed(1)} de 5` : 'Sin reseñas')),
      ),
      ...(storeId
        ? [
            row(
              'today',
              'Recoger hoy',
              products.map((p) => (p.variants.some((v) => v.stock.qty > 0) ? 'Sí' : 'No')),
            ),
          ]
        : []),
    ],
  }
}

async function compare(query: Record<string, string>) {
  const skus = (query.skus ?? '').split(',').filter(Boolean).slice(0, 4)
  const storeId = query.store_id ?? null
  const storeName = storeId ? (await branches()).find((b) => b.id === storeId)?.nombre : undefined
  const raw = await Promise.all(skus.map((sku) => productDetail(sku, storeId).catch(() => null)))
  const found = raw.filter((p): p is BProduct => p !== null)
  return buildComparison(
    found.map((p) => toDetail(p, storeId)),
    found.map((p) => toSummary(p, storeName)),
    storeId,
  )
}

// ---------- Sucursales (EP-08) ----------

export function toStore(b: BStore): Store {
  return {
    id: b.id,
    name: b.nombre,
    address: [b.calle, b.ciudad].filter(Boolean).join(', '),
    zip: b.codigo_postal ?? '',
    hours: b.horario ?? '',
    phone: b.telefono ?? '',
    lat: b.latitud ?? 0,
    lng: b.longitud ?? 0,
    services: b.servicios,
  }
}

/** Stock de cada SKU por sucursal: { sku: { sucursal_id: piezas } } */
async function stockBySku(skus: string[]): Promise<Record<string, Record<string, number>>> {
  const rows = await Promise.all(
    skus.map((sku) => bget<BBranchStock[]>(`/inventory/${encodeURIComponent(sku)}`).catch(() => [])),
  )
  return Object.fromEntries(
    skus.map((sku, i) => [
      sku,
      Object.fromEntries(rows[i].map((r) => [r.sucursal_id, r.cantidad_disponible])),
    ]),
  )
}

async function listStores(query: Record<string, string>) {
  const q = query.q?.trim() ?? ''
  const zip = /^\d{5}$/.test(q) ? q : query.zip
  const text = q && !/^\d+$/.test(q) ? normalize(q) : ''
  const wanted = (query.skus ?? '')
    .split(',')
    .filter(Boolean)
    .map((pair) => {
      const [sku, n] = pair.split(':')
      return { sku, qty: Number(n) || 1 }
    })
  const skus = [...new Set([...(query.sku ? [query.sku] : []), ...wanted.map((w) => w.sku)])]
  const [list, stock] = await Promise.all([branches(), stockBySku(skus)])

  const stores = list
    .map(toStore)
    .filter((s) => !text || normalize(`${s.name} ${s.address}`).includes(text))
    .map((s) => {
      const qty = query.sku ? (stock[query.sku]?.[s.id] ?? 0) : undefined
      const available = wanted.filter((w) => (stock[w.sku]?.[s.id] ?? 0) >= w.qty).length
      return {
        ...s,
        stock: qty === undefined ? undefined : { qty, status: stockStatus(qty) },
        all_available: wanted.length ? available === wanted.length : undefined,
        available_count: wanted.length ? available : undefined,
      }
    })
  // Sin geolocalización en el backend: primero las del mismo código postal o el más cercano.
  if (zip)
    stores.sort((a, b) => Math.abs(Number(a.zip) - Number(zip)) - Math.abs(Number(b.zip) - Number(zip)))
  return stores
}

interface BQuote {
  codigo_postal: string
  costo_domicilio: string
  dias_estimados_entrega: number
}

export function toShippingQuote(q: BQuote): ShippingQuote {
  return {
    zip: q.codigo_postal,
    available: true,
    cost: toCents(q.costo_domicilio),
    eta_min_days: Math.max(1, q.dias_estimados_entrega - 1),
    eta_max_days: q.dias_estimados_entrega,
  }
}

export const catalogRoutes: Route[] = [
  {
    method: 'get',
    path: '/categories',
    handle: async () => (await bget<Parameters<typeof toCategory>[0][]>('/categories')).map(toCategory),
  },
  { method: 'get', path: '/products', handle: ({ query }) => listProducts(query) },
  { method: 'get', path: '/products/compare', handle: ({ query }) => compare(query) },
  { method: 'get', path: '/search/suggest', handle: ({ query }) => suggest(query.q ?? '') },
  {
    method: 'get',
    path: '/products/:sku/reviews',
    handle: async ({ params, query }) => {
      const data = await bget<BReviewPage>(`/products/${encodeURIComponent(params.sku)}/resenas`, {
        page: query.page,
        page_size: query.page_size,
      })
      return {
        items: data.items.map(toReview),
        page: data.page,
        page_size: data.page_size,
        total: data.total,
        summary: {
          avg: data.resumen.promedio,
          count: data.resumen.total,
          by_star: data.resumen.por_estrellas,
        },
      }
    },
  },
  {
    method: 'post',
    path: '/products/:sku/reviews',
    handle: async ({ params, body }) => {
      const input = body as { rating: number; title: string; body: string }
      const review = await bsend<BReview>('post', `/products/${encodeURIComponent(params.sku)}/resenas`, {
        calificacion: input.rating,
        titulo: input.title,
        comentario: input.body,
      })
      return { id: review.id, status: 'publicada' }
    },
  },
  {
    method: 'get',
    path: '/products/:sku',
    handle: async ({ params, query }) =>
      toDetail(await productDetail(params.sku, query.store_id ?? null), query.store_id ?? null),
  },
  { method: 'get', path: '/stores', handle: ({ query }) => listStores(query) },
  {
    method: 'get',
    path: '/shipping/quote',
    handle: async ({ query }) => toShippingQuote(await bget<BQuote>('/shipping/quote', { zip: query.zip })),
  },
]
