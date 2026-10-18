// EP-10 (fase 0, para el contador del encabezado). Agregar, cambiar y quitar llegan en la fase 2.
import { http, HttpResponse } from 'msw'
import { db, findVariant } from '../db/store'
import { applyScenario } from '../scenarios'
import { API, currentUser } from './utils'

/** Carrito del usuario con sesión, o el del encabezado X-Cart-Id (T-01). Lo crea si no existe. */
export function resolveCartId(request: Request): string {
  const user = currentUser(request)
  if (user) {
    let id = db.userCarts.get(user.id)
    if (!id) {
      id = `c-${user.id}`
      db.userCarts.set(user.id, id)
    }
    if (!db.carts.has(id)) db.carts.set(id, [])
    return id
  }
  const header = request.headers.get('X-Cart-Id')
  if (header && db.carts.has(header)) return header
  const id = `c-${crypto.randomUUID().slice(0, 8)}`
  db.carts.set(id, [])
  return id
}

const VALID_DAYS = 7

export function serializeCart(id: string) {
  const items = (db.carts.get(id) ?? []).flatMap((item) => {
    const found = findVariant(item.sku)
    if (!found) return []
    const { product, variant } = found
    const total = Object.values(variant.stock).reduce((a, b) => a + b, 0)
    return [
      {
        id: item.id,
        sku: variant.sku,
        product_sku: product.sku,
        name: product.name,
        variant_label: variant.label,
        image: { url: '/mock/producto.svg', alt: `Foto de ${product.name}` },
        unit_price: variant.price,
        price_valid_until: new Date(Date.now() + VALID_DAYS * 86_400_000).toISOString(),
        qty: item.qty,
        max_qty: Math.max(1, Math.min(99, total)),
        stock_status: total === 0 ? ('out' as const) : total <= 5 ? ('low' as const) : ('ok' as const),
      },
    ]
  })
  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.qty, 0)
  return {
    id,
    items,
    subtotal,
    shipping: null,
    total: subtotal,
    warnings: items.filter((i) => i.stock_status === 'out').map((i) => ({ item_id: i.id, code: 'out_of_stock' })),
  }
}

export const cartHandlers = [
  http.get(`${API}/cart`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    return HttpResponse.json(serializeCart(resolveCartId(request)))
  }),
]
