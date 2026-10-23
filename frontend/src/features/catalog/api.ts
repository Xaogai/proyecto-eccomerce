import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { get } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import {
  type Category,
  categorySchema,
  productDetailSchema,
  productPageSchema,
  reviewPageSchema,
  searchSuggestSchema,
} from '@/api/schemas/catalog'
import { shippingQuoteSchema } from '@/api/schemas/store'

// Las claves de datos públicos empiezan con "catalog": no se borran al cerrar sesión.
export const catalogKeys = {
  categories: ['catalog', 'categories'] as const,
  products: (params: object) => ['catalog', 'products', params] as const,
  product: (sku: string, storeId: string | null) => ['catalog', 'product', sku, storeId] as const,
  reviews: (sku: string, pageSize: number) => ['catalog', 'reviews', sku, pageSize] as const,
  suggest: (q: string) => ['catalog', 'suggest', q] as const,
  shipping: (zip: string) => ['catalog', 'shipping', zip] as const,
}

/** EP-01: árbol de categorías (3 niveles). Cambia poco: 10 min de vigencia. */
export function useCategories() {
  return useQuery({
    queryKey: catalogKeys.categories,
    queryFn: () => get(endpoints.categories, z.array(categorySchema)),
    staleTime: 10 * 60_000,
  })
}

/** EP-02. Mientras carga la página nueva se sigue viendo la anterior (no parpadea al filtrar). */
export function useProducts(params: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: catalogKeys.products(params),
    queryFn: () => get(endpoints.products, productPageSchema, params),
    placeholderData: keepPreviousData,
    enabled,
  })
}

/** EP-03 */
export function useProduct(sku: string, storeId: string | null) {
  return useQuery({
    queryKey: catalogKeys.product(sku, storeId),
    queryFn: () =>
      get(endpoints.product(sku), productDetailSchema, storeId ? { store_id: storeId } : undefined),
    placeholderData: keepPreviousData,
  })
}

/** EP-05 */
export function useReviews(sku: string, pageSize: number, enabled: boolean) {
  return useQuery({
    queryKey: catalogKeys.reviews(sku, pageSize),
    queryFn: () => get(endpoints.reviews(sku), reviewPageSchema, { page: 1, page_size: pageSize }),
    placeholderData: keepPreviousData,
    enabled,
  })
}

/** EP-04: a partir de 2 caracteres. */
export function useSuggest(q: string) {
  const term = q.trim()
  return useQuery({
    queryKey: catalogKeys.suggest(term),
    queryFn: () => get(endpoints.searchSuggest, searchSuggestSchema, { q: term }),
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })
}

/** EP-09 */
export function useShippingQuote(zip: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.shipping(zip ?? ''),
    queryFn: () => get(endpoints.shippingQuote, shippingQuoteSchema, { zip }),
    enabled: !!zip && /^\d{5}$/.test(zip),
    staleTime: 30 * 60_000,
  })
}

/** Departamento (nivel 1) que contiene la categoría, para marcarlo como activo en el menú. */
export function findDepartment(tree: Category[], slug: string): Category | undefined {
  const contains = (c: Category): boolean => c.slug === slug || c.children.some(contains)
  return tree.find(contains)
}

/** Ruta desde el departamento hasta la categoría: [Herramientas, Herramientas eléctricas, Taladros]. */
export function findCategoryPath(tree: Category[], slug: string): Category[] {
  for (const c of tree) {
    if (c.slug === slug) return [c]
    const sub = findCategoryPath(c.children, slug)
    if (sub.length) return [c, ...sub]
  }
  return []
}
