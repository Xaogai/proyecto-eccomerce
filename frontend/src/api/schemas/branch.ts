// EP-48 a EP-52 (sucursal)
import { z } from 'zod'
import { isoDate, page } from './common'
import { orderStatusSchema } from './order'

const branchStoreSchema = z.object({ id: z.string(), name: z.string() })

export const inventoryRowSchema = z.object({
  sku: z.string(),
  name: z.string(),
  variant_label: z.string(),
  aisle: z.string(),
  /** Piezas en la sucursal */
  qty: z.number().int(),
  /** Apartadas por pedidos pagados que aún no se entregan; no se pueden vender */
  reserved: z.number().int(),
  min_qty: z.number().int(),
  status: z.enum(['ok', 'low', 'out']),
})
export type InventoryRow = z.infer<typeof inventoryRowSchema>

export const inventoryPageSchema = page(inventoryRowSchema).extend({
  counts: z.record(z.string(), z.number().int()),
  store: branchStoreSchema,
})

export const pickupSchema = z.object({
  id: z.string(),
  folio: z.string(),
  customer: z.string(),
  status: orderStatusSchema,
  item_count: z.number().int(),
  /** "Pasillos 14 y 22" mientras se prepara; "Estante R-03" cuando está listo */
  location: z.string(),
  paid_at: isoDate,
  ready_at: isoDate.nullable(),
  delivered_at: isoDate.nullable(),
  /** Pagado hace más de 1 hora y todavía sin preparar */
  late: z.boolean(),
  allowed_transitions: z.array(z.enum(['en_preparacion', 'listo_para_recoger'])),
})
export type Pickup = z.infer<typeof pickupSchema>

export const pickupBoardSchema = z.object({
  store: branchStoreSchema,
  to_prepare: z.array(pickupSchema),
  ready: z.array(pickupSchema),
  delivered_today: z.array(pickupSchema),
})
export type PickupBoard = z.infer<typeof pickupBoardSchema>

export const handoverSchema = z.object({
  id: z.string(),
  folio: z.string(),
  customer: z.string(),
  email: z.string(),
  shelf: z.string(),
  payment_label: z.string().nullable(),
  items: z.array(z.object({ name: z.string(), variant_label: z.string(), qty: z.number().int() })),
  status: orderStatusSchema,
})
export type Handover = z.infer<typeof handoverSchema>
