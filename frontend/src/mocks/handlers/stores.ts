// EP-08, EP-09 y EP-33
import { http, HttpResponse } from 'msw'
import { normalize } from '@/lib/text'
import { shippingQuote } from '../db/orders'
import { db, findVariant } from '../db/store'
import { applyScenario } from '../scenarios'
import { API, validationError } from './utils'

/** Distancia aproximada por diferencia de CP (suficiente para ordenar en el mock). */
function fakeDistance(fromZip: string, toZip: string) {
  return Math.round(Math.abs(Number(fromZip) - Number(toZip)) / 100) / 2 + 1.2
}

const stockStatus = (qty: number) => (qty === 0 ? 'out' : qty <= 5 ? 'low' : 'ok')

export const storeHandlers = [
  http.get(`${API}/stores`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const url = new URL(request.url)
    // q: CP de 5 dígitos o texto (ciudad, colonia o nombre de la sucursal). zip: CP del visitante.
    const q = url.searchParams.get('q')?.trim() ?? ''
    const zip = /^\d{5}$/.test(q) ? q : url.searchParams.get('zip')
    const text = q && !/^\d+$/.test(q) ? normalize(q) : ''
    const sku = url.searchParams.get('sku')
    const variant = sku ? findVariant(sku)?.variant : null
    // skus=100245-1:1,300077-0:2 → ¿la sucursal tiene todo el pedido? (checkout, sucursales)
    const wanted = (url.searchParams.get('skus') ?? '')
      .split(',')
      .filter(Boolean)
      .map((pair) => {
        const [s, n] = pair.split(':')
        return { variant: findVariant(s)?.variant, qty: Number(n) || 1 }
      })

    const list = db.stores
      .filter((s) => !text || normalize(`${s.name} ${s.address}`).includes(text))
      .map((s) => {
        const qty = variant?.stock[s.id]
        const available = wanted.filter((w) => (w.variant?.stock[s.id] ?? 0) >= w.qty).length
        return {
          ...s,
          distance_km: zip && /^\d{5}$/.test(zip) ? fakeDistance(zip, s.zip) : undefined,
          stock: qty === undefined ? undefined : { qty, status: stockStatus(qty) },
          all_available: wanted.length ? available === wanted.length : undefined,
          available_count: wanted.length ? available : undefined,
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
