// EP-28 (lista de deseos). El resto de Mi cuenta llega en la fase 3.
import { http, HttpResponse } from 'msw'
import { toSummary } from '../db/catalog'
import { db, findProduct } from '../db/store'
import { applyScenario } from '../scenarios'
import { API, businessError, requireUser } from './utils'

function wishlistOf(userId: string) {
  let set = db.wishlists.get(userId)
  if (!set) {
    set = new Set()
    db.wishlists.set(userId, set)
  }
  return set
}

const serialize = (userId: string) =>
  [...wishlistOf(userId)].flatMap((sku) => {
    const p = findProduct(sku)
    return p ? [toSummary(p, null)] : []
  })

export const accountHandlers = [
  // EP-27 (solo lectura en esta fase; el CRUD llega en la fase 3)
  http.get(`${API}/me/addresses`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    return HttpResponse.json(
      db.addresses.filter((a) => a.user_id === auth.user.id).map(({ user_id: _owner, ...a }) => a),
    )
  }),

  http.get(`${API}/me/wishlist`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    return HttpResponse.json(serialize(auth.user.id))
  }),

  http.post(`${API}/me/wishlist`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const { sku } = (await request.json()) as { sku?: string }
    const product = sku ? findProduct(sku) : null
    if (!product) return businessError(404, 'not_found', 'No encontramos este producto.')
    wishlistOf(auth.user.id).add(product.sku)
    return HttpResponse.json(serialize(auth.user.id))
  }),

  http.delete(`${API}/me/wishlist/:sku`, async ({ request, params }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    wishlistOf(auth.user.id).delete(String(params.sku))
    return HttpResponse.json(serialize(auth.user.id))
  }),
]
