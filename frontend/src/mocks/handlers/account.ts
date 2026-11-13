// Mi cuenta: EP-27 a EP-32 y EP-53
import { http, HttpResponse } from 'msw'
import { toSummary } from '../db/catalog'
import { isInProgress } from '../db/orders'
import type { DbAddress } from '../db/seed'
import { db, findProduct } from '../db/store'
import { applyScenario } from '../scenarios'
import { API, businessError, requireUser, validationError } from './utils'

function wishlistOf(userId: string) {
  let set = db.wishlists.get(userId)
  if (!set) {
    set = new Set()
    db.wishlists.set(userId, set)
  }
  return set
}

const serializeWishlist = (userId: string) =>
  [...wishlistOf(userId)].flatMap((sku) => {
    const p = findProduct(sku)
    if (!p) return []
    const saved = db.wishlistPrices.get(`${userId}:${p.sku}`)
    return [{ ...toSummary(p, null), saved_price: saved }]
  })

const publicAddress = ({ user_id: _owner, ...a }: DbAddress) => a

type AddressInput = Partial<Omit<DbAddress, 'id' | 'user_id'>>

function validateAddress(a: AddressInput): Record<string, string> {
  const e: Record<string, string> = {}
  if (!a.alias?.trim()) e.alias = 'Ponle un nombre, por ejemplo Casa o Trabajo.'
  if (!a.street?.trim()) e.street = 'Escribe la calle.'
  if (!a.ext?.trim()) e.ext = 'Escribe el número exterior.'
  if (!a.colony?.trim()) e.colony = 'Escribe la colonia.'
  if (!a.zip || !/^\d{5}$/.test(a.zip)) e.zip = 'El código postal tiene 5 dígitos.'
  if (!a.city?.trim()) e.city = 'Escribe la ciudad o municipio.'
  if (!a.state?.trim()) e.state = 'Escribe el estado.'
  if (!a.phone || a.phone.replace(/\D/g, '').length !== 10) e.phone = 'El teléfono tiene 10 dígitos.'
  return e
}

/** Deja una sola dirección principal (la indicada, o la primera si se borró la principal). */
function normalizeDefault(userId: string, preferId?: string) {
  const mine = db.addresses.filter((a) => a.user_id === userId)
  if (preferId) mine.forEach((a) => (a.is_default = a.id === preferId))
  if (mine.length && !mine.some((a) => a.is_default)) mine[0].is_default = true
}

export const accountHandlers = [
  // ---------- Direcciones (EP-27) ----------
  http.get(`${API}/me/addresses`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    return HttpResponse.json(db.addresses.filter((a) => a.user_id === auth.user.id).map(publicAddress))
  }),

  http.post(`${API}/me/addresses`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const body = (await request.json()) as AddressInput
    const errors = validateAddress(body)
    if (Object.keys(errors).length) return validationError(errors)
    const address: DbAddress = {
      id: `a-${crypto.randomUUID().slice(0, 8)}`,
      user_id: auth.user.id,
      alias: body.alias!.trim(),
      name: body.name?.trim() || auth.user.name,
      street: body.street!.trim(),
      ext: body.ext!.trim(),
      int: body.int?.trim() || undefined,
      colony: body.colony!.trim(),
      zip: body.zip!,
      city: body.city!.trim(),
      state: body.state!.trim(),
      phone: body.phone!.trim(),
      references: body.references?.trim() || undefined,
      is_default: !!body.is_default,
    }
    db.addresses.push(address)
    normalizeDefault(auth.user.id, address.is_default ? address.id : undefined)
    return HttpResponse.json(publicAddress(address), { status: 201 })
  }),

  http.patch(`${API}/me/addresses/:id`, async ({ request, params }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const address = db.addresses.find((a) => a.id === params.id && a.user_id === auth.user.id)
    if (!address) return businessError(404, 'not_found', 'No encontramos esa dirección.')
    const body = (await request.json()) as AddressInput
    const merged = { ...address, ...body }
    const errors = validateAddress(merged)
    if (Object.keys(errors).length) return validationError(errors)
    Object.assign(address, merged)
    normalizeDefault(auth.user.id, body.is_default ? address.id : undefined)
    return HttpResponse.json(publicAddress(address))
  }),

  http.delete(`${API}/me/addresses/:id`, async ({ request, params }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    db.addresses = db.addresses.filter((a) => !(a.id === params.id && a.user_id === auth.user.id))
    normalizeDefault(auth.user.id)
    return new HttpResponse(null, { status: 204 })
  }),

  // ---------- Lista de deseos (EP-28) ----------
  http.get(`${API}/me/wishlist`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    return HttpResponse.json(serializeWishlist(auth.user.id))
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
    db.wishlistPrices.set(`${auth.user.id}:${product.sku}`, toSummary(product, null).price)
    return HttpResponse.json(serializeWishlist(auth.user.id))
  }),

  http.delete(`${API}/me/wishlist/:sku`, async ({ request, params }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    wishlistOf(auth.user.id).delete(String(params.sku))
    return HttpResponse.json(serializeWishlist(auth.user.id))
  }),

  // ---------- Perfil y privacidad (EP-29 a EP-32) ----------
  http.get(`${API}/me/profile`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const { name, email, phone = '' } = auth.user
    return HttpResponse.json({ name, email, phone })
  }),

  http.patch(`${API}/me/profile`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const body = (await request.json()) as { name?: string; phone?: string }
    const errors: Record<string, string> = {}
    if (!body.name?.trim()) errors.name = 'Escribe tu nombre completo.'
    if (body.phone && body.phone.replace(/\D/g, '').length !== 10)
      errors.phone = 'El teléfono tiene 10 dígitos.'
    if (Object.keys(errors).length) return validationError(errors)
    auth.user.name = body.name!.trim()
    auth.user.phone = body.phone?.trim() ?? ''
    return HttpResponse.json({ name: auth.user.name, email: auth.user.email, phone: auth.user.phone })
  }),

  http.get(`${API}/me/consents`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    return HttpResponse.json(auth.user.consents ?? { marketing: false, personalization: false })
  }),

  http.patch(`${API}/me/consents`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const body = (await request.json()) as { marketing?: boolean; personalization?: boolean }
    auth.user.consents = { ...(auth.user.consents ?? { marketing: false, personalization: false }), ...body }
    return HttpResponse.json(auth.user.consents)
  }),

  http.post(`${API}/me/arco`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    db.arcoCount += 1
    // Plazo legal de respuesta: 20 días hábiles (aprox. 28 naturales).
    return HttpResponse.json(
      { folio: `ARCO-${db.arcoCount}`, due_date: new Date(Date.now() + 28 * 86_400_000).toISOString() },
      { status: 201 },
    )
  }),

  http.post(`${API}/me/password`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const { current, password } = (await request.json()) as { current?: string; password?: string }
    if (current !== auth.user.password)
      return validationError({ current: 'La contraseña actual no es correcta.' })
    if (!password || password.length < 8) return validationError({ password: 'Usa al menos 8 caracteres.' })
    auth.user.password = password
    auth.user.must_change_password = false
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete(`${API}/me`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const active = db.orders.filter((o) => o.user_id === auth.user.id && isInProgress(o))
    if (active.length) {
      return businessError(409, 'active_orders', 'Tienes pedidos en curso.', {
        orders: active.map((o) => ({ id: o.id, folio: o.folio, status: o.status })),
      })
    }
    const { password } = (await request.json().catch(() => ({}))) as { password?: string }
    if (password !== auth.user.password) return validationError({ password: 'La contraseña no es correcta.' })
    db.users = db.users.filter((u) => u.id !== auth.user.id)
    return HttpResponse.json(
      { effective_date: new Date(Date.now() + 30 * 86_400_000).toISOString() },
      { status: 202 },
    )
  }),
]
