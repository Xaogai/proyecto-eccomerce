// EP-34 a EP-47 (panel de administración)
import { z } from 'zod'
import { ORDER_STATUSES } from '@/lib/orderStatus'
import type { Category } from './catalog'
import { imageSchema, isoDate, money, page, toneSchema } from './common'
import { orderSchema, orderStatusSchema } from './order'

const unitSchema = z.enum(['money', 'count'])

// ---------- EP-34 ----------

export const dashboardSchema = z.object({
  kpis: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      value: z.number(),
      unit: unitSchema,
      note: z.string(),
      tone: toneSchema,
      link: z.string(),
    }),
  ),
  alerts: z.array(
    z.object({
      severity: z.enum(['alta', 'media', 'baja']),
      title: z.string(),
      detail: z.string(),
      link: z.string(),
    }),
  ),
  sales_by_day: z.array(z.object({ date: isoDate, total: money })),
})
export type Dashboard = z.infer<typeof dashboardSchema>

// ---------- EP-35 a EP-39 ----------

export const productStatusSchema = z.enum(['publicado', 'borrador', 'agotado'])

export const adminProductRowSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  category: z.string(),
  category_label: z.string(),
  variant_count: z.number().int(),
  price_from: money.nullable(),
  stock_total: z.number().int(),
  status: productStatusSchema,
})
export type AdminProductRow = z.infer<typeof adminProductRowSchema>

const countsSchema = z.record(z.string(), z.number().int())

export const adminProductPageSchema = page(adminProductRowSchema).extend({ counts: countsSchema })

export const adminVariantSchema = z.object({
  sku: z.string(),
  label: z.string(),
  price: money,
  stock_total: z.number().int(),
})

export const adminProductSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  brand: z.string(),
  category: z.string(),
  description: z.string(),
  attrs: z.record(z.string(), z.string()),
  images: z.array(imageSchema),
  variants: z.array(adminVariantSchema),
  status: productStatusSchema,
})
export type AdminProduct = z.infer<typeof adminProductSchema>

// ---------- EP-40 ----------

export interface AdminCategory extends Category {
  product_count: number
  children: AdminCategory[]
}
export const adminCategorySchema: z.ZodType<AdminCategory> = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  product_count: z.number().int(),
  children: z.lazy(() => z.array(adminCategorySchema)),
})

// ---------- EP-41 a EP-43 ----------

export const adminOrderRowSchema = z.object({
  id: z.string(),
  folio: z.string(),
  customer: z.string(),
  email: z.string(),
  fulfillment_label: z.string(),
  created_at: isoDate,
  total: money,
  status: orderStatusSchema,
})
export type AdminOrderRow = z.infer<typeof adminOrderRowSchema>

export const adminOrderPageSchema = page(adminOrderRowSchema).extend({ counts: countsSchema })

export const adminOrderSchema = orderSchema.extend({
  allowed_transitions: z.array(z.enum(ORDER_STATUSES)),
  webhook_log: z.array(z.object({ at: isoDate, event: z.string(), result: z.string() })),
  audit_log: z.array(
    z.object({
      at: isoDate,
      from: orderStatusSchema.nullable(),
      to: orderStatusSchema,
      actor: z.string(),
      note: z.string().optional(),
    }),
  ),
})
export type AdminOrder = z.infer<typeof adminOrderSchema>

// ---------- EP-44 y EP-45 ----------

export const roleSchema = z.enum(['cliente', 'staff', 'admin'])

export const adminUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  branch_id: z.string().nullable(),
  branch_name: z.string().nullable(),
  last_login: isoDate.nullable(),
  locked: z.boolean(),
  is_self: z.boolean(),
})
export type AdminUser = z.infer<typeof adminUserSchema>
export const adminUserPageSchema = page(adminUserSchema)

// ---------- EP-46 ----------

export const reportSchema = z.object({
  period: z.string(),
  from: isoDate,
  to: isoDate,
  kpis: z.array(
    z.object({ key: z.string(), label: z.string(), value: z.number(), unit: unitSchema, note: z.string() }),
  ),
  by_category: z.array(z.object({ name: z.string(), total: money })),
  branches: z.array(
    z.object({
      store: z.string(),
      pieces: z.number().int(),
      reserved: z.number().int(),
      out_of_stock: z.number().int(),
      pickup_orders: z.number().int(),
    }),
  ),
})
export type Report = z.infer<typeof reportSchema>

// ---------- EP-47 ----------

export const settingsSchema = z.object({
  flags: z.record(z.string(), z.boolean()),
  payment: z.object({ provider: z.string(), mode: z.enum(['sandbox', 'vivo']), key_hint: z.string() }),
  shipping: z.object({
    rates: z.array(z.object({ zone: z.string(), cost: money, days: z.string() })),
    free_from: money,
  }),
  security: z.object({
    max_attempts: z.number().int(),
    lock_minutes: z.number().int(),
    session_minutes: z.number().int(),
    reservation_minutes: z.number().int(),
  }),
})
export type Settings = z.infer<typeof settingsSchema>
