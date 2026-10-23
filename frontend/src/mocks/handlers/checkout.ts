// EP-15 a EP-17, más el webhook de la pasarela (Doc 13.1) que en el mock llama la "pasarela simulada".
import { http, HttpResponse } from 'msw'
import { nextFolio, PAYMENT_CONFIRM_MS, serializeOrder, shippingQuote } from '../db/orders'
import { db, findVariant } from '../db/store'
import { applyScenario, getScenario } from '../scenarios'
import { resolveCartId, totalAvailable } from './cart'
import { API, businessError, currentUser, validationError } from './utils'

interface CheckoutBody {
  contact?: { name?: string; email?: string; phone?: string }
  fulfillment?: 'ship' | 'pickup'
  store_id?: string
  address_id?: string
  address?: {
    street?: string
    ext?: string
    int?: string
    colony?: string
    zip?: string
    city?: string
    state?: string
    references?: string
  }
}

/** URL de la pasarela. En el mock es una página de la app que simula la pasarela hospedada. */
const paymentUrl = (orderId: string, token: string | null) =>
  `/_pasarela/${orderId}${token ? `?token=${encodeURIComponent(token)}` : ''}`

function validate(body: CheckoutBody): Record<string, string> {
  const e: Record<string, string> = {}
  const c = body.contact ?? {}
  if (!c.name?.trim()) e['contact.name'] = 'Escribe tu nombre completo.'
  if (!c.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))
    e['contact.email'] = 'Escribe un correo válido, por ejemplo nombre@correo.com.'
  if (!c.phone || c.phone.replace(/\D/g, '').length !== 10)
    e['contact.phone'] = 'El teléfono tiene 10 dígitos.'
  if (body.fulfillment === 'pickup' && !body.store_id) e.store_id = 'Elige una sucursal.'
  if (body.fulfillment === 'ship' && !body.address_id) {
    const a = body.address ?? {}
    if (!a.street?.trim()) e['address.street'] = 'Escribe la calle.'
    if (!a.ext?.trim()) e['address.ext'] = 'Escribe el número exterior.'
    if (!a.colony?.trim()) e['address.colony'] = 'Escribe la colonia.'
    if (!a.zip || !/^\d{5}$/.test(a.zip)) e['address.zip'] = 'El código postal tiene 5 dígitos.'
    if (!a.city?.trim()) e['address.city'] = 'Escribe la ciudad o municipio.'
    if (!a.state?.trim()) e['address.state'] = 'Escribe el estado.'
  }
  if (body.fulfillment !== 'ship' && body.fulfillment !== 'pickup')
    e.fulfillment = 'Elige cómo quieres recibir tu pedido.'
  return e
}

function findOrder(request: Request, id: string) {
  const order = db.orders.find((o) => o.id === id)
  if (!order) return { response: businessError(404, 'not_found', 'No encontramos este pedido.') }
  const user = currentUser(request)
  const token = new URL(request.url).searchParams.get('token')
  const allowed =
    (user && (order.user_id === user.id || user.role === 'admin')) || (token && token === order.guest_token)
  if (!allowed)
    return { response: businessError(user ? 403 : 401, 'forbidden', 'No tienes acceso a este pedido.') }
  return { order }
}

export const checkoutHandlers = [
  http.post(`${API}/checkout`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack

    // Degradación controlada (24.3): con mucha demanda se entra por turnos.
    if (getScenario() === 'queue' && db.featureFlags.queue && db.queueAttempts < 2) {
      db.queueAttempts += 1
      return businessError(429, 'queue', 'Hay muchas personas comprando ahora.', {
        position: 42 - db.queueAttempts * 20,
        progress: db.queueAttempts * 45,
        retry_after_s: 2,
      })
    }

    const body = (await request.json()) as CheckoutBody
    const errors = validate(body)
    if (Object.keys(errors).length) return validationError(errors)

    const cartId = resolveCartId(request)
    const items = db.carts.get(cartId) ?? []
    if (!items.length) return businessError(409, 'cart_empty', 'Tu carrito está vacío.')

    const missing = items.filter((i) => {
      const found = findVariant(i.sku)
      if (!found) return true
      if (body.fulfillment === 'pickup') return (found.variant.stock[body.store_id!] ?? 0) < i.qty
      return totalAvailable(i.sku) < i.qty && !found.variant.ship
    })
    if (missing.length) {
      return businessError(409, 'out_of_stock', 'Algunos productos ya no tienen stock suficiente.', {
        item_ids: missing.map((i) => i.id),
      })
    }

    const user = currentUser(request)
    const address = body.address_id
      ? db.addresses.find((a) => a.id === body.address_id && a.user_id === user?.id)
      : null
    if (body.fulfillment === 'ship' && body.address_id && !address)
      return validationError({ address_id: 'Elige una dirección válida.' })
    const zip = address?.zip ?? body.address?.zip ?? ''
    const shipping = body.fulfillment === 'ship' ? shippingQuote(zip).cost : 0
    const label = address
      ? `${address.street} ${address.ext}, ${address.colony}, ${address.city}`
      : `${body.address?.street} ${body.address?.ext}, ${body.address?.colony}, ${body.address?.city}`

    const id = nextFolio()
    const token = user ? null : crypto.randomUUID()
    const now = new Date().toISOString()
    db.orders.unshift({
      id,
      folio: id,
      user_id: user?.id ?? null,
      guest_token: token,
      status: 'pendiente_pago',
      payment_status: 'pendiente',
      created_at: now,
      contact: {
        name: body.contact!.name!.trim(),
        email: body.contact!.email!.trim(),
        phone: body.contact!.phone!.trim(),
      },
      items: items.map((i) => {
        const { product, variant } = findVariant(i.sku)!
        return {
          id: i.id,
          sku: i.sku,
          name: product.name,
          variant_label: variant.label,
          unit_price: variant.price,
          qty: i.qty,
        }
      }),
      shipping,
      fulfillment:
        body.fulfillment === 'ship'
          ? { type: 'ship', address_label: label }
          : { type: 'pickup', store_id: body.store_id! },
      timeline: [
        { status: 'creado', at: now },
        { status: 'pendiente_pago', at: now },
      ],
      pickup_code:
        body.fulfillment === 'pickup' ? String(1000 + Math.floor(Math.random() * 9000)) : undefined,
    })
    db.carts.set(cartId, [])

    return HttpResponse.json(
      { order_id: id, folio: id, payment_url: paymentUrl(id, token), guest_token: token ?? undefined },
      { status: 201 },
    )
  }),

  http.get(`${API}/orders/:id`, async ({ request, params }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const found = findOrder(request, String(params.id))
    if ('response' in found) return found.response
    return HttpResponse.json(serializeOrder(found.order!))
  }),

  http.post(`${API}/orders/:id/payment/retry`, async ({ request, params }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const found = findOrder(request, String(params.id))
    if ('response' in found) return found.response
    const order = found.order!
    serializeOrder(order)
    if (order.payment_status !== 'rechazado')
      return businessError(409, 'not_retryable', 'Este pedido no tiene un pago rechazado.')
    order.payment = undefined
    order.payment_status = 'pendiente'
    return HttpResponse.json({ payment_url: paymentUrl(order.id, order.guest_token) })
  }),

  // Lo llama la pasarela (aquí, la página /_pasarela del mock). Confirma unos segundos después.
  http.post(`${API}/webhooks/payment`, async ({ request }) => {
    const { order_id, result } = (await request.json()) as {
      order_id?: string
      result?: 'aprobado' | 'rechazado'
    }
    const order = db.orders.find((o) => o.id === order_id)
    if (!order) return businessError(404, 'not_found', 'Pedido inexistente.')
    const outcome = result === 'rechazado' || getScenario() === 'pago-rechazado' ? 'rechazado' : 'pagado'
    order.payment = { outcome, confirms_at: Date.now() + PAYMENT_CONFIRM_MS }
    return new HttpResponse(null, { status: 204 })
  }),
]
