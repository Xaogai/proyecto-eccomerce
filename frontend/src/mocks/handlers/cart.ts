// EP-10 a EP-14
import { http, HttpResponse } from 'msw'
import { db, findVariant } from '../db/store'
import { applyScenario } from '../scenarios'
import { API, businessError, currentUser, requireUser, validationError } from './utils'

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
const MAX_QTY = 99
const LOW = 5

export const totalAvailable = (sku: string) => {
  const found = findVariant(sku)
  return found ? Object.values(found.variant.stock).reduce((a, b) => a + b, 0) : 0
}

const status = (qty: number) =>
  qty === 0 ? ('out' as const) : qty <= LOW ? ('low' as const) : ('ok' as const)

/** `storeId`: agrega el stock de cada producto en esa sucursal (para "Agotado en Toluca Centro"). */
export function serializeCart(id: string, storeId: string | null = null) {
  const items = (db.carts.get(id) ?? []).flatMap((item) => {
    const found = findVariant(item.sku)
    if (!found) return []
    const { product, variant } = found
    const total = totalAvailable(variant.sku)
    const atStore = storeId ? (variant.stock[storeId] ?? 0) : null
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
        max_qty: Math.max(1, Math.min(MAX_QTY, total)),
        stock_status: status(total),
        store_stock: atStore === null ? null : { qty: atStore, status: status(atStore) },
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
    warnings: items
      .filter((i) => i.stock_status === 'out')
      .map((i) => ({ item_id: i.id, code: 'out_of_stock' })),
  }
}

const storeParam = (request: Request) => new URL(request.url).searchParams.get('store_id')

export const cartHandlers = [
  http.get(`${API}/cart`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    return HttpResponse.json(serializeCart(resolveCartId(request), storeParam(request)))
  }),

  http.post(`${API}/cart/items`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const { sku, qty } = (await request.json()) as { sku?: string; qty?: number }
    if (!sku || !findVariant(sku)) return validationError({ sku: 'Elige una variante válida.' })
    if (!Number.isInteger(qty) || qty! < 1) return validationError({ qty: 'La cantidad mínima es 1.' })

    const id = resolveCartId(request)
    const items = db.carts.get(id)!
    const existing = items.find((i) => i.sku === sku)
    const nextQty = (existing?.qty ?? 0) + qty!
    const max = Math.min(MAX_QTY, totalAvailable(sku))
    if (max === 0 && !findVariant(sku)!.variant.ship) {
      return businessError(409, 'out_of_stock', 'Este producto está agotado.')
    }
    if (max > 0 && nextQty > max) {
      return businessError(409, 'out_of_stock', `Solo hay ${max} disponibles.`, { available: max })
    }
    if (existing) existing.qty = nextQty
    else items.push({ id: `i-${crypto.randomUUID().slice(0, 8)}`, sku, qty: qty! })
    return HttpResponse.json(serializeCart(id, storeParam(request)))
  }),

  http.patch(`${API}/cart/items/:itemId`, async ({ request, params }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const { qty } = (await request.json()) as { qty?: number }
    const id = resolveCartId(request)
    const item = db.carts.get(id)!.find((i) => i.id === params.itemId)
    if (!item) return businessError(404, 'not_found', 'Ese producto ya no está en tu carrito.')
    if (!Number.isInteger(qty) || qty! < 1) return validationError({ qty: 'La cantidad mínima es 1.' })
    const max = Math.min(MAX_QTY, totalAvailable(item.sku))
    if (max > 0 && qty! > max)
      return businessError(409, 'out_of_stock', `Solo hay ${max} disponibles.`, { available: max })
    item.qty = qty!
    return HttpResponse.json(serializeCart(id, storeParam(request)))
  }),

  http.delete(`${API}/cart/items/:itemId`, async ({ request, params }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const id = resolveCartId(request)
    db.carts.set(
      id,
      db.carts.get(id)!.filter((i) => i.id !== params.itemId),
    )
    return HttpResponse.json(serializeCart(id, storeParam(request)))
  }),

  http.post(`${API}/cart/merge`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    const { guest_cart_id } = (await request.json()) as { guest_cart_id?: string }
    const id = resolveCartId(request)
    const mine = db.carts.get(id)!
    for (const guestItem of (guest_cart_id && db.carts.get(guest_cart_id)) || []) {
      const same = mine.find((i) => i.sku === guestItem.sku)
      if (same) same.qty = Math.min(MAX_QTY, same.qty + guestItem.qty)
      else mine.push({ ...guestItem })
    }
    if (guest_cart_id) db.carts.delete(guest_cart_id)
    return HttpResponse.json(serializeCart(id))
  }),
]
