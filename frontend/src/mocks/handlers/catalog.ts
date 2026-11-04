// EP-01 a EP-05
import { http, HttpResponse } from 'msw'
import { listProducts, parseQuery, reviewsFor, stockFor, suggest, toDetail, toSummary } from '../db/catalog'
import { db, findProduct } from '../db/store'
import { applyScenario, getScenario } from '../scenarios'
import { API, businessError, requireUser, validationError } from './utils'

export const catalogHandlers = [
  http.get(`${API}/categories`, async () => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    return HttpResponse.json(db.categories)
  }),

  http.get(`${API}/products`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const query = parseQuery(new URL(request.url))
    if (getScenario() === 'empty') {
      return HttpResponse.json({
        items: [],
        page: 1,
        page_size: query.pageSize,
        total: 0,
        facets: [],
        did_you_mean: null,
      })
    }
    return HttpResponse.json(listProducts(query))
  }),

  // EP-07: hasta 4 productos; filas con la unión de especificaciones y si sus valores difieren.
  // Va antes de /products/:sku para que "compare" no se tome como SKU.
  http.get(`${API}/products/compare`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const url = new URL(request.url)
    const skus = (url.searchParams.get('skus') ?? '').split(',').filter(Boolean)
    if (skus.length < 1 || skus.length > 4) return validationError({ skus: 'Compara de 1 a 4 productos.' })
    const products = skus.map((sku) => findProduct(sku)).filter((p) => p !== null)
    const storeId = url.searchParams.get('store_id')
    const keys: string[] = []
    for (const p of products) for (const s of p.specs) if (!keys.includes(s.k)) keys.push(s.k)
    const row = (key: string, label: string, values: string[]) => ({
      key,
      label,
      values,
      differs: new Set(values).size > 1,
    })
    const rows = [
      row(
        'brand',
        'Marca',
        products.map((p) => p.brand),
      ),
      ...keys
        .filter((k) => k !== 'Marca')
        .map((k) =>
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
              products.map((p) => (stockFor(p.variants, storeId).qty > 0 ? 'Sí' : 'No')),
            ),
          ]
        : []),
    ]
    return HttpResponse.json({ products: products.map((p) => toSummary(p, storeId)), rows })
  }),

  http.get(`${API}/products/:sku`, async ({ params, request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const product = findProduct(String(params.sku))
    if (!product || product.status !== 'publicado')
      return businessError(404, 'not_found', 'No encontramos este producto.')
    const storeId = new URL(request.url).searchParams.get('store_id')
    return HttpResponse.json(toDetail(product, storeId))
  }),

  http.get(`${API}/products/:sku/reviews`, async ({ params, request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const product = findProduct(String(params.sku))
    if (!product) return businessError(404, 'not_found', 'No encontramos este producto.')
    const url = new URL(request.url)
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
    const pageSize = Math.min(20, Math.max(1, Number(url.searchParams.get('page_size') ?? 5)))
    const all = reviewsFor(product)
    const byStar = [1, 2, 3, 4, 5].map((n) => all.filter((r) => r.rating === n).length)
    return HttpResponse.json({
      items: all.slice((page - 1) * pageSize, page * pageSize),
      page,
      page_size: pageSize,
      total: all.length,
      summary: { avg: product.rating.avg, count: all.length, by_star: byStar },
    })
  }),

  // EP-06: la reseña queda en moderación (no aparece de inmediato).
  http.post(`${API}/products/:sku/reviews`, async ({ params, request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const product = findProduct(String(params.sku))
    if (!product) return businessError(404, 'not_found', 'No encontramos este producto.')
    const body = (await request.json()) as {
      rating?: number
      title?: string
      body?: string
      recommend?: boolean
    }
    const errors: Record<string, string> = {}
    if (!body.rating || body.rating < 1 || body.rating > 5) errors.rating = 'Elige de 1 a 5 estrellas.'
    if (!body.title?.trim()) errors.title = 'Escribe un título.'
    if (!body.body || body.body.trim().length < 20) {
      errors.body = `Tu opinión tiene ${body.body?.trim().length ?? 0} caracteres. Escribe al menos 20.`
    }
    if (Object.keys(errors).length) return validationError(errors)
    const id = crypto.randomUUID()
    db.pendingReviews.push({
      id,
      sku: product.sku,
      user_id: auth.user.id,
      rating: body.rating!,
      title: body.title!.trim(),
      body: body.body!.trim(),
    })
    return HttpResponse.json({ id, status: 'en_moderacion' }, { status: 201 })
  }),

  http.get(`${API}/search/suggest`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
    if (q.length < 2) return HttpResponse.json({ queries: [], products: [], categories: [] })
    return HttpResponse.json(suggest(q))
  }),
]
