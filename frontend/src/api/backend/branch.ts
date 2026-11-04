// EP-48 a EP-52: panel de sucursal.
import type { Handover, InventoryRow, Pickup } from '../schemas/branch'
import { ApiError, toApiError } from '../errors'
import { bget, bsend } from './http'
import { toStatus } from './orders'
import type { Route } from './router'

interface BInventoryRow {
  sku: string
  nombre: string
  etiqueta: string
  pasillo: string
  piezas: number
  apartadas: number
  minimo: number
  estado: InventoryRow['status']
}

interface BPickup {
  id: string
  folio: string
  cliente: string
  estado: string
  piezas: number
  ubicacion: string
  pagado_en: string
  listo_en: string | null
  entregado_en: string | null
  atrasado: boolean
  transiciones: string[]
}

interface BHandover {
  id: string
  folio: string
  cliente: string
  email: string
  estante: string
  pago: string | null
  productos: { nombre: string; etiqueta: string; cantidad: number }[]
  estado: string
}

const toStore = (s: { id: string; nombre: string }) => ({ id: s.id, name: s.nombre })

export const toInventoryRow = (r: BInventoryRow): InventoryRow => ({
  sku: r.sku,
  name: r.nombre,
  variant_label: r.etiqueta,
  aisle: r.pasillo,
  qty: r.piezas,
  reserved: r.apartadas,
  min_qty: r.minimo,
  status: r.estado,
})

const STEPS = ['en_preparacion', 'listo_para_recoger'] as const

export const toPickup = (p: BPickup): Pickup => ({
  id: p.id,
  folio: p.folio,
  customer: p.cliente,
  status: toStatus(p.estado),
  item_count: p.piezas,
  location: p.ubicacion,
  paid_at: p.pagado_en,
  ready_at: p.listo_en,
  delivered_at: p.entregado_en,
  late: p.atrasado,
  allowed_transitions: STEPS.filter((s) => p.transiciones.includes(s)),
})

export const toHandover = (h: BHandover): Handover => ({
  id: h.id,
  folio: h.folio,
  customer: h.cliente,
  email: h.email,
  shelf: h.estante,
  payment_label: h.pago,
  items: h.productos.map((i) => ({ name: i.nombre, variant_label: i.etiqueta, qty: i.cantidad })),
  status: toStatus(h.estado),
})

/** Campos y datos del error con los nombres del frontend. */
function branchError(fields: Record<string, string>) {
  return (error: unknown): never => {
    const e = toApiError(error)
    const fieldErrors = Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [fields[k] ?? k, v]))
    const data = 'apartadas' in e.data ? { ...e.data, reserved: e.data.apartadas } : e.data
    throw new ApiError(e.status, e.message, e.code, fieldErrors, data)
  }
}

const branch = (query: Record<string, string>) => ({ sucursal_id: query.store_id })

export const branchRoutes: Route[] = [
  {
    method: 'get',
    path: '/branch/inventory',
    handle: async ({ query }) => {
      const data = await bget<{
        sucursal: { id: string; nombre: string }
        page: number
        page_size: number
        total: number
        items: BInventoryRow[]
        conteos: Record<string, number>
      }>('/sucursal/inventario', { ...branch(query), q: query.q, estado: query.status, page: query.page })
      return {
        items: data.items.map(toInventoryRow),
        page: data.page,
        page_size: data.page_size,
        total: data.total,
        counts: data.conteos,
        store: toStore(data.sucursal),
      }
    },
  },
  {
    method: 'post',
    path: '/branch/inventory/:sku/adjust',
    handle: async ({ params, query, body }) => {
      const { delta, reason } = body as { delta: number; reason: string }
      return toInventoryRow(
        await bsend<BInventoryRow>(
          'post',
          `/sucursal/inventario/${encodeURIComponent(params.sku)}/ajuste`,
          { delta, motivo: reason },
          branch(query),
        ).catch(branchError({ motivo: 'reason' })),
      )
    },
  },
  {
    method: 'get',
    path: '/branch/pickups',
    handle: async ({ query }) => {
      const data = await bget<{
        sucursal: { id: string; nombre: string }
        por_preparar: BPickup[]
        listos: BPickup[]
        entregados_hoy: BPickup[]
      }>('/sucursal/recolecciones', branch(query))
      return {
        store: toStore(data.sucursal),
        to_prepare: data.por_preparar.map(toPickup),
        ready: data.listos.map(toPickup),
        delivered_today: data.entregados_hoy.map(toPickup),
      }
    },
  },
  {
    method: 'post',
    path: '/branch/pickups/verify',
    handle: async ({ query, body }) => {
      const { pickup_code, order_id } = body as { pickup_code: string; order_id?: string }
      return toHandover(
        await bsend<BHandover>(
          'post',
          '/sucursal/recolecciones/verificar',
          { codigo: pickup_code, pedido_id: order_id },
          branch(query),
        ).catch(branchError({ codigo: 'pickup_code' })),
      )
    },
  },
  {
    method: 'post',
    path: '/branch/pickups/:id/status',
    handle: async ({ params, query, body }) =>
      toPickup(
        await bsend<BPickup>(
          'post',
          `/sucursal/recolecciones/${params.id}/estado`,
          { estado: (body as { to: string }).to },
          branch(query),
        ),
      ),
  },
  {
    method: 'post',
    path: '/branch/pickups/:id/handover',
    handle: async ({ params, query, body }) => {
      const input = body as { pickup_code: string; id_checked: boolean; items_checked: boolean }
      return toHandover(
        await bsend<BHandover>(
          'post',
          `/sucursal/recolecciones/${params.id}/entregar`,
          {
            codigo: input.pickup_code,
            identificacion_revisada: input.id_checked,
            productos_revisados: input.items_checked,
          },
          branch(query),
        ).catch(branchError({ codigo: 'pickup_code' })),
      )
    },
  },
]
