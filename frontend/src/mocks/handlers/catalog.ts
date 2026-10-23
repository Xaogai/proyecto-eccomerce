// EP-01 a EP-05
import { http, HttpResponse } from 'msw'
import { listProducts, parseQuery, reviewsFor, suggest, toDetail } from '../db/catalog'
import { db, findProduct } from '../db/store'
import { applyScenario, getScenario } from '../scenarios'
import { API, businessError } from './utils'

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

  http.get(`${API}/search/suggest`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const q = new URL(request.url).searchParams.get('q')?.trim() ?? ''
    if (q.length < 2) return HttpResponse.json({ queries: [], products: [], categories: [] })
    return HttpResponse.json(suggest(q))
  }),
]
