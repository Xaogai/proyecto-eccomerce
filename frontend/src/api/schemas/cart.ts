// EP-10 a EP-14
import { z } from 'zod'
import { imageSchema, isoDate, money } from './common'
import { stockStatusSchema } from './catalog'

export const cartItemSchema = z.object({
  id: z.string(),
  sku: z.string(),
  product_sku: z.string(),
  name: z.string(),
  variant_label: z.string(),
  image: imageSchema,
  unit_price: money,
  price_valid_until: isoDate,
  qty: z.number().int().min(1),
  max_qty: z.number().int(),
  stock_status: stockStatusSchema,
  /** Stock en la sucursal pedida con ?store_id= (null si no se pidió) */
  store_stock: z.object({ qty: z.number().int(), status: stockStatusSchema }).nullable().optional(),
})
export type CartItem = z.infer<typeof cartItemSchema>

export const cartSchema = z.object({
  id: z.string(),
  items: z.array(cartItemSchema),
  subtotal: money,
  shipping: money.nullable(),
  total: money,
  warnings: z.array(z.object({ item_id: z.string(), code: z.string() })),
})
export type Cart = z.infer<typeof cartSchema>
