import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api, get, send, sendForm, usesRealBackend } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { toApiError } from '@/api/errors'
import {
  adminCategorySchema,
  adminOrderPageSchema,
  adminOrderSchema,
  adminProductPageSchema,
  adminProductSchema,
  adminUserPageSchema,
  dashboardSchema,
  reportSchema,
  type Settings,
  settingsSchema,
} from '@/api/schemas/admin'
import { imageSchema } from '@/api/schemas/common'
import { storeSchema } from '@/api/schemas/store'
import type { OrderStatus } from '@/lib/orderStatus'

export const adminKeys = {
  all: ['admin'] as const,
  dashboard: ['admin', 'dashboard'] as const,
  products: (params: object) => ['admin', 'products', params] as const,
  product: (id: string) => ['admin', 'product', id] as const,
  categories: ['admin', 'categories'] as const,
  orders: (params: object) => ['admin', 'orders', params] as const,
  order: (id: string) => ['admin', 'order', id] as const,
  users: (params: object) => ['admin', 'users', params] as const,
  report: (period: string) => ['admin', 'report', period] as const,
  settings: ['admin', 'settings'] as const,
}

const ok = z.object({ id: z.string() })

/** Quita filtros vacíos para que la llave de la consulta y la URL coincidan. */
const clean = (params: Record<string, string | number | undefined>) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))

// ---------- EP-34 ----------

export function useDashboard() {
  return useQuery({
    queryKey: adminKeys.dashboard,
    queryFn: () => get(endpoints.adminDashboard, dashboardSchema),
  })
}

// ---------- EP-35 a EP-39 ----------

export interface ProductFilters {
  q?: string
  category?: string
  status?: string
  page?: number
}

export function useAdminProducts(filters: ProductFilters) {
  const params = clean({ ...filters })
  return useQuery({
    queryKey: adminKeys.products(params),
    queryFn: () => get(endpoints.adminProducts, adminProductPageSchema, params),
    placeholderData: keepPreviousData,
  })
}

export function useAdminProduct(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.product(id ?? ''),
    queryFn: () => get(endpoints.adminProduct(id!), adminProductSchema),
    enabled: !!id,
  })
}

export interface ProductInput {
  name: string
  brand: string
  category: string
  description: string
  attrs: Record<string, string>
  variants: Array<{ sku?: string; label: string; price: number; stock_total: number }>
}

export function useSaveProduct(id: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ProductInput) =>
      id
        ? send('patch', endpoints.adminProduct(id), adminProductSchema, input)
        : send('post', endpoints.adminProducts, adminProductSchema, input),
    onSuccess: (product) => {
      queryClient.setQueryData(adminKeys.product(product.id), product)
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
    },
  })
}

export function usePublishProduct(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (publish: boolean) =>
      send(
        'post',
        publish ? endpoints.adminProductPublish(id) : endpoints.adminProductUnpublish(id),
        adminProductSchema,
      ),
    onSuccess: (product) => {
      queryClient.setQueryData(adminKeys.product(product.id), product)
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
      queryClient.invalidateQueries({ queryKey: adminKeys.dashboard })
    },
  })
}

/** EP-39 en multipart: "file" y "alt" (obligatorio, F4). */
export function useUploadImage(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, alt }: { file: File; alt: string }) => {
      const form = new FormData()
      form.append('file', file)
      form.append('alt', alt)
      return sendForm(endpoints.adminProductImages(id), imageSchema, form)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.product(id) }),
  })
}

// ---------- EP-40 ----------

export function useAdminCategories() {
  return useQuery({
    queryKey: adminKeys.categories,
    queryFn: () => get(endpoints.adminCategories, z.array(adminCategorySchema)),
  })
}

const categoryOk = z.object({ id: z.string(), slug: z.string(), name: z.string() })

export function useCategoryActions() {
  const queryClient = useQueryClient()
  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.categories })
    // El menú de la tienda también usa el árbol (EP-01)
    queryClient.invalidateQueries({ queryKey: ['catalog'] })
  }
  return {
    create: useMutation({
      mutationFn: (input: { name: string; slug?: string; parent_id: string | null }) =>
        send('post', endpoints.adminCategories, categoryOk, input),
      onSuccess,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) =>
        send('patch', endpoints.adminCategory(id), categoryOk, { name }),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: (id: string) => send('delete', endpoints.adminCategory(id), z.unknown()),
      onSuccess,
    }),
  }
}

// ---------- EP-41 a EP-43 ----------

/** Sucursales para los filtros y la asignación de staff (EP-08 sin filtros). */
export function useAllStores() {
  return useQuery({
    queryKey: ['admin', 'stores'],
    queryFn: () => get(endpoints.stores, z.array(storeSchema)),
    staleTime: 10 * 60_000,
  })
}

export interface OrderFilters {
  q?: string
  store_id?: string
  days?: number
  status_group?: string
  page?: number
}

export function useAdminOrders(filters: OrderFilters) {
  const params = clean({ ...filters })
  return useQuery({
    queryKey: adminKeys.orders(params),
    queryFn: () => get(endpoints.adminOrders, adminOrderPageSchema, params),
    placeholderData: keepPreviousData,
  })
}

export function useAdminOrder(id: string) {
  return useQuery({
    queryKey: adminKeys.order(id),
    queryFn: () => get(endpoints.adminOrder(id), adminOrderSchema),
  })
}

export function useChangeOrderStatus(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { to: OrderStatus; note?: string }) =>
      send('post', endpoints.adminOrderStatus(id), adminOrderSchema, input),
    onSuccess: (order) => {
      queryClient.setQueryData(adminKeys.order(id), order)
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
      queryClient.invalidateQueries({ queryKey: adminKeys.dashboard })
    },
  })
}

// ---------- EP-44 y EP-45 ----------

export function useAdminUsers(filters: { q?: string; role?: string; page?: number }) {
  const params = clean({ ...filters })
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn: () => get(endpoints.adminUsers, adminUserPageSchema, params),
    placeholderData: keepPreviousData,
  })
}

export function useUserActions() {
  const queryClient = useQueryClient()
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
  return {
    update: useMutation({
      mutationFn: ({ id, ...input }: { id: string; role: string; branch_id?: string | null }) =>
        send('patch', endpoints.adminUser(id), ok, input),
      onSuccess,
    }),
    unlock: useMutation({
      mutationFn: (id: string) => send('post', endpoints.adminUserUnlock(id), ok),
      onSuccess,
    }),
  }
}

// ---------- EP-46 ----------

export function useReport(period: string) {
  return useQuery({
    queryKey: adminKeys.report(period),
    queryFn: () => get(endpoints.adminReports, reportSchema, { period }),
    placeholderData: keepPreviousData,
  })
}

/** Descarga el CSV con el token de la sesión (un enlace normal no lleva el encabezado Authorization). */
export async function downloadReportCsv(period: string) {
  try {
    // El backend real llama "periodo" al parámetro.
    const params = usesRealBackend ? { periodo: period } : { period }
    const res = await api.get(endpoints.adminReportsCsv, { params, responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte-${period}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    throw toApiError(error)
  }
}

// ---------- EP-47 ----------

export function useSettings() {
  return useQuery({
    queryKey: adminKeys.settings,
    queryFn: () => get(endpoints.adminSettings, settingsSchema),
  })
}

export type SettingsPatch = {
  flags?: Partial<Settings['flags']>
  shipping?: { free_from?: number }
  security?: Partial<Settings['security']>
}

export function useSaveSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: SettingsPatch) => send('patch', endpoints.adminSettings, settingsSchema, patch),
    onSuccess: (settings) => {
      queryClient.setQueryData(adminKeys.settings, settings)
      // Las banderas también las lee la tienda (EP-33)
      queryClient.invalidateQueries({ queryKey: ['catalog', 'feature-flags'] })
    },
  })
}
