// EP-15 a EP-19
import { z } from 'zod'
import { ORDER_STATUSES } from '@/lib/orderStatus'
import { imageSchema, isoDate, money, page } from './common'

export const orderStatusSchema = z.enum(ORDER_STATUSES)
export const paymentStatusSchema = z.enum(['pendiente', 'pagado', 'rechazado'])

export const fulfillmentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ship'), address_label: z.string(), tracking: z.string().optional() }),
  z.object({ type: z.literal('pickup'), store_id: z.string(), store_name: z.string() }),
])

export const orderItemSchema = z.object({
  id: z.string(),
  sku: z.string(),
  /** SKU del producto (para enlazar a la ficha y a "Escribir reseña") */
  product_sku: z.string(),
  name: z.string(),
  variant_label: z.string(),
  image: imageSchema,
  unit_price: money,
  qty: z.number().int(),
})

export const orderSchema = z.object({
  id: z.string(),
  folio: z.string(),
  status: orderStatusSchema,
  payment_status: paymentStatusSchema,
  created_at: isoDate,
  contact: z.object({ name: z.string(), email: z.string(), phone: z.string() }),
  items: z.array(orderItemSchema),
  totals: z.object({ subtotal: money, shipping: money, total: money }),
  fulfillment: fulfillmentSchema,
  timeline: z.array(z.object({ status: orderStatusSchema, at: isoDate })),
  pickup_code: z.string().optional(),
  /** "Tarjeta terminación 4821" (lo informa la pasarela; nunca el número completo) */
  payment_label: z.string().optional(),
  /** Fecha límite para devolver (30 días después de entregado); null si aún no se puede o ya pasó */
  return_deadline: isoDate.nullable(),
  returns: z.array(z.object({ folio: z.string(), status: z.string(), created_at: isoDate })),
})
export type Order = z.infer<typeof orderSchema>

export const orderSummarySchema = z.object({
  id: z.string(),
  folio: z.string(),
  created_at: isoDate,
  item_count: z.number().int(),
  fulfillment_label: z.string(),
  total: money,
  status: orderStatusSchema,
})
export type OrderSummary = z.infer<typeof orderSummarySchema>
export const orderPageSchema = page(orderSummarySchema)

export const checkoutResultSchema = z.object({
  order_id: z.string(),
  folio: z.string(),
  payment_url: z.string(),
  guest_token: z.string().optional(),
})
export type CheckoutResult = z.infer<typeof checkoutResultSchema>

// EP-19
export const returnResultSchema = z.object({
  id: z.string(),
  folio: z.string(),
  status: z.string(),
  instructions: z.string(),
  refund: money,
})
export type ReturnResult = z.infer<typeof returnResultSchema>
