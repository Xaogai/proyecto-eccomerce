// Pedidos simulados: forma de EP-16 y EP-18, y confirmación del pago "por webhook" unos segundos después.
import type { Order } from '@/api/schemas/order'
import type { DbOrder } from './seed'
import { db, findVariant } from './store'

/** Tiempo que tarda la pasarela simulada en confirmar el pago (el frontend hace polling). */
export const PAYMENT_CONFIRM_MS = import.meta.env.MODE === 'test' ? 30 : 3000

const RETURN_DAYS = 30

export function shippingQuote(zip: string) {
  // Zona metropolitana de Toluca (50xxx–52xxx): tarifa local. El resto del país: tarifa nacional.
  const local = /^5[0-2]/.test(zip)
  return {
    zip,
    available: !zip.startsWith('00'),
    cost: local ? 14900 : 24900,
    eta_min_days: local ? 3 : 5,
    eta_max_days: local ? 5 : 8,
  }
}

/** Aplica el resultado del pago si la pasarela ya "confirmó". */
function settle(order: DbOrder) {
  if (!order.payment || Date.now() < order.payment.confirms_at || order.payment_status !== 'pendiente') return
  const at = new Date(order.payment.confirms_at).toISOString()
  if (order.payment.outcome === 'pagado') {
    order.payment_status = 'pagado'
    order.status = 'pagado'
    order.timeline.push({ status: 'pagado', at })
  } else {
    order.payment_status = 'rechazado'
  }
}

/** 30 días después de entregado; null si no se ha entregado, ya venció o ya se reembolsó. */
export function returnDeadline(order: DbOrder): string | null {
  const delivered = order.timeline.find((t) => t.status === 'entregado')
  if (!delivered || order.status !== 'entregado') return null
  const deadline = new Date(new Date(delivered.at).getTime() + RETURN_DAYS * 86_400_000)
  return deadline.getTime() > Date.now() ? deadline.toISOString() : null
}

export function serializeOrder(order: DbOrder): Order {
  settle(order)
  const subtotal = order.items.reduce((n, i) => n + i.unit_price * i.qty, 0)
  const f = order.fulfillment
  const store = f.type === 'pickup' ? db.stores.find((s) => s.id === f.store_id) : null
  return {
    id: order.id,
    folio: order.folio,
    status: order.status,
    payment_status: order.payment_status,
    created_at: order.created_at,
    contact: order.contact,
    items: order.items.map((i) => ({
      ...i,
      product_sku: findVariant(i.sku)?.product.sku ?? i.sku.split('-')[0],
      image: { url: '/mock/producto.svg', alt: `Foto de ${i.name}` },
    })),
    totals: { subtotal, shipping: order.shipping, total: subtotal + order.shipping },
    fulfillment:
      f.type === 'ship' ? f : { type: 'pickup', store_id: f.store_id, store_name: store?.name ?? f.store_id },
    timeline: order.timeline,
    pickup_code: order.pickup_code,
    payment_label: order.payment_status === 'pagado' ? 'tarjeta terminación 4821' : undefined,
    return_deadline: returnDeadline(order),
    returns: (order.returns ?? []).map(({ folio, status, created_at }) => ({ folio, status, created_at })),
  }
}

const IN_PROGRESS = new Set([
  'creado',
  'pendiente_pago',
  'pagado',
  'en_preparacion',
  'listo_para_recoger',
  'enviado',
  'incidencia',
])

export const isInProgress = (order: DbOrder) => IN_PROGRESS.has(order.status)

/** Fila de "Mis pedidos" (EP-18). */
export function orderSummary(order: DbOrder) {
  const o = serializeOrder(order)
  const how =
    o.fulfillment.type === 'pickup'
      ? `Recoger en ${o.fulfillment.store_name}`
      : `Envío a ${o.fulfillment.address_label}${o.fulfillment.tracking ? ` · guía ${o.fulfillment.tracking}` : ''}`
  const lastReturn = order.returns?.at(-1)
  return {
    id: o.id,
    folio: o.folio,
    created_at: o.created_at,
    item_count: o.items.length,
    fulfillment_label: lastReturn ? `Devolución ${lastReturn.folio}: ${lastReturn.status}` : how,
    total: o.totals.total,
    status: o.status,
  }
}

export function nextFolio(): string {
  return String(Math.max(10482, ...db.orders.map((o) => Number(o.folio) || 0)) + 1)
}
