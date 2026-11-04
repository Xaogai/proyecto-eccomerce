import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api, get, send } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { toApiError } from '@/api/errors'
import {
  type Address,
  addressSchema,
  arcoResultSchema,
  type Consents,
  consentsSchema,
  profileSchema,
} from '@/api/schemas/auth'
import { orderPageSchema, orderSchema, returnResultSchema } from '@/api/schemas/order'
import { useAuth } from '@/app/providers/authContext'

export const accountKeys = {
  orders: (group: string, page: number) => ['me', 'orders', group, page] as const,
  order: (id: string) => ['me', 'order', id] as const,
  addresses: ['me', 'addresses'] as const,
  profile: ['me', 'profile'] as const,
  consents: ['me', 'consents'] as const,
}

// ---------- Pedidos (EP-16, EP-18, EP-19) ----------

export type OrderGroup = 'todos' | 'curso' | 'fin'

export function useMyOrders(group: OrderGroup, page = 1, pageSize = 10) {
  return useQuery({
    queryKey: accountKeys.orders(group, page),
    queryFn: () =>
      get(endpoints.orders, orderPageSchema, {
        page,
        page_size: pageSize,
        ...(group === 'todos' ? {} : { status_group: group }),
      }),
  })
}

export function useMyOrder(id: string) {
  return useQuery({ queryKey: accountKeys.order(id), queryFn: () => get(endpoints.order(id), orderSchema) })
}

export interface ReturnInput {
  items: Array<{ item_id: string; qty: number }>
  reason: string
  comment?: string
  method: 'tienda' | 'recoleccion'
  photo?: File
}

/** EP-19 en multipart: los datos van en "data" (JSON) y la foto en "photo". */
export function useCreateReturn(orderId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ photo, ...data }: ReturnInput) => {
      const form = new FormData()
      form.append('data', JSON.stringify(data))
      if (photo) form.append('photo', photo)
      try {
        const res = await api.post(endpoints.orderReturns(orderId), form)
        return returnResultSchema.parse(res.data)
      } catch (error) {
        throw toApiError(error)
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  })
}

// ---------- Reseñas (EP-06) ----------

export function useCreateReview(sku: string) {
  return useMutation({
    mutationFn: (input: { rating: number; title: string; body: string; recommend: boolean }) =>
      send('post', endpoints.reviews(sku), z.object({ id: z.string(), status: z.string() }), input),
  })
}

// ---------- Direcciones (EP-27) ----------

export function useAddressBook() {
  const { status } = useAuth()
  return useQuery({
    queryKey: accountKeys.addresses,
    queryFn: () => get(endpoints.addresses, z.array(addressSchema)),
    enabled: status === 'autenticado',
  })
}

export type AddressInput = Omit<Address, 'id'>

export function useSaveAddress() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<AddressInput> & { id?: string }) =>
      id
        ? send('patch', endpoints.address(id), addressSchema, input)
        : send('post', endpoints.addresses, addressSchema, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.addresses }),
  })
}

export function useDeleteAddress() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => send('delete', endpoints.address(id), z.unknown()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accountKeys.addresses }),
  })
}

// ---------- Datos y privacidad (EP-29 a EP-32, EP-53) ----------

export function useProfile() {
  return useQuery({ queryKey: accountKeys.profile, queryFn: () => get(endpoints.profile, profileSchema) })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  const { updateUser } = useAuth()
  return useMutation({
    mutationFn: (input: { name: string; phone: string }) =>
      send('patch', endpoints.profile, profileSchema, input),
    onSuccess: (profile) => {
      queryClient.setQueryData(accountKeys.profile, profile)
      updateUser({ name: profile.name })
    },
  })
}

export function useConsents() {
  return useQuery({ queryKey: accountKeys.consents, queryFn: () => get(endpoints.consents, consentsSchema) })
}

export function useUpdateConsents() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Consents>) => send('patch', endpoints.consents, consentsSchema, patch),
    onSuccess: (consents) => queryClient.setQueryData(accountKeys.consents, consents),
  })
}

export function useArcoRequest() {
  return useMutation({
    mutationFn: (input: {
      type: 'acceso' | 'rectificacion' | 'cancelacion' | 'oposicion'
      detail?: string
    }) => send('post', endpoints.arco, arcoResultSchema, input),
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { current: string; password: string }) =>
      send('post', endpoints.password, z.unknown(), input),
  })
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: (password: string) =>
      send('delete', endpoints.me, z.object({ effective_date: z.string() }), { password }),
  })
}
