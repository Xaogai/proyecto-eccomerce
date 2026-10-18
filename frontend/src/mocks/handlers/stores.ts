// EP-08 y EP-33
import { http, HttpResponse } from 'msw'
import { db, findVariant } from '../db/store'
import { applyScenario } from '../scenarios'
import { API } from './utils'

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

    const list = db.stores.map((s) => {
      const qty = variant?.stock[s.id]
      return {
        ...s,
        distance_km: zip && /^\d{5}$/.test(zip) ? fakeDistance(zip, s.zip) : undefined,
        stock: qty === undefined ? undefined : { qty, status: qty === 0 ? 'out' : qty <= 5 ? 'low' : 'ok' },
      }
    })
    if (zip) list.sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0))
    return HttpResponse.json(list)
  }),

  http.get(`${API}/feature-flags`, async () => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    return HttpResponse.json(db.featureFlags)
  }),
]
