// EP-08, EP-09 y EP-33
import { http, HttpResponse } from 'msw'
import { db, findVariant } from '../db/store'
import { applyScenario } from '../scenarios'
import { shippingQuote } from '../db/orders'
import { API, validationError } from './utils'

/** Distancia aproximada por diferencia de CP (suficiente para ordenar en el mock). */
function fakeDistance(fromZip: string, toZip: string) {
  return Math.round(Math.abs(Number(fromZip) - Number(toZip)) / 100) / 2 + 1.2
}

export const storeHandlers = [
  http.get(`${API}/stores`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const url = new URL(request.url)
    const zip = url.searchParams.get('zip')
    const sku = url.searchParams.get('sku')
    const variant = sku ? findVariant(sku)?.variant : null
    // skus=100245-1:1,300077-0:2 → ¿la sucursal tiene todo el pedido? (checkout, recoger en tienda)
    const wanted = (url.searchParams.get('skus') ?? '')
      .split(',')
      .filter(Boolean)
      .map((pair) => {
        const [s, q] = pair.split(':')
        return { variant: findVariant(s)?.variant, qty: Number(q) || 1 }
      })

    const list = db.stores.map((s) => {
      const qty = variant?.stock[s.id]
      return {
        ...s,
        distance_km: zip && /^\d{5}$/.test(zip) ? fakeDistance(zip, s.zip) : undefined,
        stock: qty === undefined ? undefined : { qty, status: qty === 0 ? 'out' : qty <= 5 ? 'low' : 'ok' },
        all_available: wanted.length
          ? wanted.every((w) => (w.variant?.stock[s.id] ?? 0) >= w.qty)
          : undefined,
      }
    })
    if (zip) list.sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0))
    return HttpResponse.json(list)
  }),

  http.get(`${API}/shipping/quote`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const zip = new URL(request.url).searchParams.get('zip') ?? ''
    if (!/^\d{5}$/.test(zip)) return validationError({ zip: 'El código postal tiene 5 dígitos.' })
    return HttpResponse.json(shippingQuote(zip))
  }),

  http.get(`${API}/feature-flags`, async () => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    return HttpResponse.json(db.featureFlags)
  }),
]
