// EP-08, EP-09 y EP-33
import { http, HttpResponse } from 'msw'
import { db, findVariant } from '../db/store'
import { applyScenario } from '../scenarios'
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

  http.get(`${API}/shipping/quote`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const zip = new URL(request.url).searchParams.get('zip') ?? ''
    if (!/^\d{5}$/.test(zip)) return validationError({ zip: 'El código postal tiene 5 dígitos.' })
    // Zona metropolitana de Toluca (50xxx–52xxx): tarifa local. El resto del país: tarifa nacional.
    const local = /^5[0-2]/.test(zip)
    return HttpResponse.json({
      zip,
      available: !zip.startsWith('00'),
      cost: local ? 14900 : 24900,
      eta_min_days: local ? 3 : 5,
      eta_max_days: local ? 5 : 8,
    })
  }),

  http.get(`${API}/feature-flags`, async () => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    return HttpResponse.json(db.featureFlags)
  }),
]
