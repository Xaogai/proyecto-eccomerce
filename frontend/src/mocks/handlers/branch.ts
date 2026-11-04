// Sucursal: EP-48 a EP-52. Staff de su sucursal; el admin elige la sucursal con store_id.
import { http, HttpResponse } from 'msw'
import { normalize } from '@/lib/text'
import { canTransition, type OrderStatus } from '@/lib/orderStatus'
import { serializeOrder } from '../db/orders'
import type { DbOrder, DbProduct, DbUser } from '../db/seed'
import { categoryPath, db } from '../db/store'
import { applyScenario } from '../scenarios'
import { API, businessError, requireUser, validationError } from './utils'

const LOW = 3
const LATE_MS = 60 * 60_000

const ADJUST_REASONS = ['recepcion', 'conteo', 'danado', 'devolucion'] as const

async function guard(request: Request) {
  const hijack = await applyScenario()
  if (hijack) return { response: hijack }
  const auth = requireUser(request, ['staff', 'admin'])
  if ('response' in auth) return auth
  return { user: auth.user, storeId: branchOf(auth.user, request) }
}

function branchOf(user: DbUser, request: Request) {
  if (user.role === 'staff' && user.branch_id) return user.branch_id
  return new URL(request.url).searchParams.get('store_id') ?? db.stores[0].id
}

// ---------- Inventario ----------

/** Pasillo de ejemplo: un bloque por departamento y una letra por categoría. */
function aisleOf(p: DbProduct) {
  const path = categoryPath(p.category)
  const dept = db.categories.findIndex((c) => c.slug === path[0]?.slug)
  const letter = 'ABCD'[[...p.category].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 4]
  return `${10 + Math.max(0, dept) * 3 + (path.length > 2 ? 1 : 0)}-${letter}`
}

const inProgressPickup = (o: DbOrder, storeId: string) =>
  o.fulfillment.type === 'pickup' &&
  o.fulfillment.store_id === storeId &&
  ['pagado', 'en_preparacion', 'listo_para_recoger'].includes(o.status)

/** Piezas apartadas: pedidos pagados de recolección en la sucursal que aún no se entregan. */
function reservedFor(sku: string, storeId: string) {
  return db.orders
    .filter((o) => inProgressPickup(o, storeId))
    .reduce((n, o) => n + o.items.filter((i) => i.sku === sku).reduce((m, i) => m + i.qty, 0), 0)
}

function inventoryRows(storeId: string) {
  return db.products
    .filter((p) => p.status === 'publicado')
    .flatMap((p) =>
      p.variants.map((v) => {
        const qty = v.stock[storeId] ?? 0
        return {
          sku: v.sku,
          name:
            p.variants.length > 1
              ? `${p.name}, ${v.label.charAt(0).toLowerCase()}${v.label.slice(1)}`
              : p.name,
          variant_label: v.label,
          aisle: aisleOf(p),
          qty,
          reserved: Math.min(qty, reservedFor(v.sku, storeId)),
          min_qty: LOW,
          status: qty === 0 ? 'out' : qty <= LOW ? 'low' : 'ok',
        }
      }),
    )
}

// ---------- Recolección ----------

function shelfOf(o: DbOrder) {
  return `R-0${(Number(o.id) % 9) + 1}`
}

function pickupRow(o: DbOrder) {
  const at = (s: OrderStatus) => o.timeline.findLast((t) => t.status === s)?.at
  const paidAt = at('pagado') ?? o.created_at
  const aisles = [
    ...new Set(
      o.items
        .map((i) => db.products.find((p) => p.variants.some((v) => v.sku === i.sku)))
        .filter(Boolean)
        .map((p) => aisleOf(p!).split('-')[0]),
    ),
  ]
  const pieces = o.items.reduce((n, i) => n + i.qty, 0)
  return {
    id: o.id,
    folio: o.folio,
    customer: o.contact.name.replace(/^(\S+)\s+(\S).*$/, '$1 $2.'),
    status: o.status,
    item_count: pieces,
    location:
      o.status === 'listo_para_recoger' || o.status === 'entregado'
        ? `Estante ${shelfOf(o)}`
        : aisles.length
          ? `${aisles.length > 1 ? 'Pasillos' : 'Pasillo'} ${aisles.join(' y ')}`
          : '',
    paid_at: paidAt,
    ready_at: at('listo_para_recoger') ?? null,
    delivered_at: at('entregado') ?? null,
    late:
      (o.status === 'pagado' || o.status === 'en_preparacion') &&
      Date.now() - new Date(paidAt).getTime() > LATE_MS,
    allowed_transitions: (['en_preparacion', 'listo_para_recoger'] as const).filter((to) =>
      canTransition(o.status, to),
    ),
  }
}

function changeStatus(o: DbOrder, to: OrderStatus, actor: string, note?: string) {
  const audit =
    o.audit ??
    o.timeline.map((t, i) => ({
      at: t.at,
      from: i ? o.timeline[i - 1].status : null,
      to: t.status,
      actor: 'Sistema',
    }))
  const now = new Date().toISOString()
  o.audit = [...audit, { at: now, from: o.status, to, actor, note }]
  o.timeline.push({ status: to, at: now })
  o.status = to
}

function findForStore(id: string, storeId: string) {
  const o = db.orders.find((x) => x.id === id)
  return o && o.fulfillment.type === 'pickup' && o.fulfillment.store_id === storeId ? o : null
}

function handoverSummary(o: DbOrder) {
  const s = serializeOrder(o)
  return {
    id: o.id,
    folio: o.folio,
    customer: o.contact.name,
    email: o.contact.email,
    shelf: shelfOf(o),
    payment_label: s.payment_label ?? null,
    items: s.items.map((i) => ({ name: i.name, variant_label: i.variant_label, qty: i.qty })),
    status: o.status,
  }
}

export const branchHandlers = [
  // EP-48
  http.get(`${API}/branch/inventory`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const url = new URL(request.url)
    const q = normalize(url.searchParams.get('q') ?? '')
    const status = url.searchParams.get('status')
    const all = inventoryRows(auth.storeId).filter(
      (r) => !q || normalize(`${r.name} ${r.sku} ${r.aisle}`).includes(q),
    )
    const counts = {
      todos: all.length,
      low: all.filter((r) => r.status === 'low').length,
      out: all.filter((r) => r.status === 'out').length,
    }
    const list = all
      .filter((r) => !status || r.status === status)
      .sort((a, b) => a.aisle.localeCompare(b.aisle) || a.name.localeCompare(b.name))
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
    const size = 25
    return HttpResponse.json({
      items: list.slice((page - 1) * size, page * size),
      page,
      page_size: size,
      total: list.length,
      counts,
      store: { id: auth.storeId, name: db.stores.find((s) => s.id === auth.storeId)?.name ?? auth.storeId },
    })
  }),

  // EP-49: el motivo es obligatorio y no se puede quedar con menos piezas que las apartadas.
  http.post(`${API}/branch/inventory/:sku/adjust`, async ({ request, params }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const sku = String(params.sku)
    const product = db.products.find((p) => p.variants.some((v) => v.sku === sku))
    const variant = product?.variants.find((v) => v.sku === sku)
    if (!product || !variant) return businessError(404, 'not_found', 'No encontramos ese producto.')
    const { delta, reason } = (await request.json()) as { delta?: number; reason?: string }
    if (!reason || !(ADJUST_REASONS as readonly string[]).includes(reason))
      return validationError({ reason: 'Elige el motivo del ajuste.' })
    if (!Number.isInteger(delta) || delta === 0)
      return validationError({ delta: 'El ajuste debe ser de al menos una pieza.' })
    const qty = variant.stock[auth.storeId] ?? 0
    const reserved = reservedFor(sku, auth.storeId)
    if (qty + delta! < reserved) {
      return businessError(
        409,
        'below_reserved',
        `No puedes dejar menos de ${reserved} piezas: están apartadas por pedidos.`,
        { reserved },
      )
    }
    variant.stock[auth.storeId] = qty + delta!
    return HttpResponse.json(inventoryRows(auth.storeId).find((r) => r.sku === sku))
  }),

  // EP-50
  http.get(`${API}/branch/pickups`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const mine = db.orders.filter(
      (o) => o.fulfillment.type === 'pickup' && o.fulfillment.store_id === auth.storeId,
    )
    const byPaid = (a: DbOrder, b: DbOrder) => a.created_at.localeCompare(b.created_at)
    return HttpResponse.json({
      store: { id: auth.storeId, name: db.stores.find((s) => s.id === auth.storeId)?.name ?? auth.storeId },
      to_prepare: mine
        .filter((o) => o.status === 'pagado' || o.status === 'en_preparacion')
        .sort(byPaid)
        .map(pickupRow),
      ready: mine
        .filter((o) => o.status === 'listo_para_recoger')
        .sort(byPaid)
        .map(pickupRow),
      delivered_today: mine
        .filter(
          (o) =>
            o.status === 'entregado' &&
            new Date(o.timeline.findLast((t) => t.status === 'entregado')!.at) >= startOfDay,
        )
        .map(pickupRow),
    })
  }),

  // EP-51: solo hacia adelante (pagado → en preparación → listo), I3.
  http.post(`${API}/branch/pickups/:id/status`, async ({ request, params }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const o = findForStore(String(params.id), auth.storeId)
    if (!o) return businessError(404, 'not_found', 'No encontramos ese pedido en esta sucursal.')
    const { to } = (await request.json()) as { to?: OrderStatus }
    if ((to !== 'en_preparacion' && to !== 'listo_para_recoger') || !canTransition(o.status, to)) {
      return businessError(
        409,
        'invalid_transition',
        'Otra persona ya cambió este pedido. Actualizamos la lista.',
      )
    }
    changeStatus(o, to, auth.user.name)
    return HttpResponse.json(pickupRow(o))
  }),

  // EP-52: el código lo dicta el cliente; sin él no hay entrega.
  http.post(`${API}/branch/pickups/verify`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const { pickup_code, order_id } = (await request.json()) as { pickup_code?: string; order_id?: string }
    const code = (pickup_code ?? '').trim()
    if (!/^\d{4}$/.test(code)) return validationError({ pickup_code: 'El código tiene 4 dígitos.' })
    const o = db.orders.find(
      (x) =>
        x.pickup_code === code &&
        x.status === 'listo_para_recoger' &&
        x.fulfillment.type === 'pickup' &&
        x.fulfillment.store_id === auth.storeId &&
        (!order_id || x.id === order_id),
    )
    if (!o)
      return businessError(
        404,
        'not_found',
        'No hay pedidos listos con ese código en esta sucursal. Revisa los 4 dígitos.',
      )
    return HttpResponse.json(handoverSummary(o))
  }),

  http.post(`${API}/branch/pickups/:id/handover`, async ({ request, params }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const o = findForStore(String(params.id), auth.storeId)
    const body = (await request.json()) as {
      pickup_code?: string
      id_checked?: boolean
      items_checked?: boolean
    }
    if (!o || o.pickup_code !== body.pickup_code?.trim())
      return businessError(404, 'not_found', 'El código no corresponde a este pedido.')
    if (!body.id_checked || !body.items_checked)
      return validationError({ checks: 'Confirma la identificación y los productos antes de entregar.' })
    if (!canTransition(o.status, 'entregado'))
      return businessError(409, 'invalid_transition', 'Este pedido ya no está listo para entregar.')
    changeStatus(o, 'entregado', auth.user.name, 'Entregado en mostrador con identificación')
    return HttpResponse.json(handoverSummary(o))
  }),
]
