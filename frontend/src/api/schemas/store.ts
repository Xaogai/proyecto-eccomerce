// EP-08 y EP-09
import { z } from 'zod'
import { money } from './common'
import { stockStatusSchema } from './catalog'

export const storeSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  zip: z.string(),
  hours: z.string(),
  phone: z.string(),
  lat: z.number(),
  lng: z.number(),
  distance_km: z.number().optional(),
  stock: z.object({ qty: z.number().int(), status: stockStatusSchema }).optional(),
  /** Con ?skus=: la sucursal tiene todo el pedido (checkout, recoger en tienda) */
  all_available: z.boolean().optional(),
})
export type Store = z.infer<typeof storeSchema>

export const shippingQuoteSchema = z.object({
  zip: z.string(),
  available: z.boolean(),
  cost: money,
  eta_min_days: z.number().int(),
  eta_max_days: z.number().int(),
})
export type ShippingQuote = z.infer<typeof shippingQuoteSchema>
