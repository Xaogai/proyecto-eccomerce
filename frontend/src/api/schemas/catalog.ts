// EP-01 a EP-07 de docs/api/endpoints-propuestos.md
import { z } from 'zod'
import { imageSchema, isoDate, money, page } from './common'

export interface Category {
  id: string
  slug: string
  name: string
  children: Category[]
}

export const categorySchema: z.ZodType<Category> = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  get children() {
    return z.array(categorySchema)
  },
})

export const stockStatusSchema = z.enum(['ok', 'low', 'out', 'ship_only'])

export const ratingSchema = z.object({ avg: z.number(), count: z.number().int() })

export const productSummarySchema = z.object({
  sku: z.string(),
  /** Variante que se agrega desde la tarjeta (la única, o la primera con stock) */
  variant_sku: z.string(),
  name: z.string(),
  brand: z.string(),
  image: imageSchema,
  price: money,
  price_from: money.optional(),
  variant_count: z.number().int(),
  stock: z.object({ status: stockStatusSchema, label: z.string() }),
  rating: ratingSchema,
})
export type ProductSummary = z.infer<typeof productSummarySchema>

export const facetSchema = z.object({
  key: z.string(),
  title: z.string(),
  options: z.array(
    z.object({ value: z.string(), label: z.string(), count: z.number().int(), selected: z.boolean() }),
  ),
})
export type Facet = z.infer<typeof facetSchema>

export const productPageSchema = page(productSummarySchema).extend({
  facets: z.array(facetSchema),
  /** Corrección sugerida cuando la búsqueda no tiene resultados ("¿Quisiste decir…?") */
  did_you_mean: z.string().nullable().optional(),
})
export type ProductPage = z.infer<typeof productPageSchema>

export const variantSchema = z.object({
  sku: z.string(),
  label: z.string(),
  price: money,
  stock: z.object({ store_id: z.string().nullable(), qty: z.number().int(), status: stockStatusSchema }),
})
export type Variant = z.infer<typeof variantSchema>

export const productDetailSchema = z.object({
  sku: z.string(),
  name: z.string(),
  brand: z.string(),
  description: z.string(),
  category_path: z.array(z.object({ slug: z.string(), name: z.string() })),
  images: z.array(imageSchema),
  images_360: z.array(z.string()).optional(),
  variants: z.array(variantSchema),
  specs: z.array(z.object({ k: z.string(), v: z.string() })),
  rating: ratingSchema,
})
export type ProductDetail = z.infer<typeof productDetailSchema>

export const reviewSchema = z.object({
  id: z.string(),
  author: z.string(),
  rating: z.number().int().min(1).max(5),
  title: z.string(),
  body: z.string(),
  created_at: isoDate,
  verified: z.boolean(),
})
export type Review = z.infer<typeof reviewSchema>

export const reviewPageSchema = page(reviewSchema).extend({
  summary: z.object({ avg: z.number(), count: z.number().int(), by_star: z.array(z.number().int()) }),
})

export const searchSuggestSchema = z.object({
  queries: z.array(z.string()),
  products: z.array(z.object({ sku: z.string(), name: z.string(), image: imageSchema })),
  categories: z.array(z.object({ slug: z.string(), name: z.string() })),
})
export type SearchSuggest = z.infer<typeof searchSuggestSchema>
