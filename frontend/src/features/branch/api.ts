import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { get, send } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import {
  handoverSchema,
  inventoryPageSchema,
  inventoryRowSchema,
  pickupSchema,
  pickupBoardSchema,
} from '@/api/schemas/branch'
import { useAuth } from '@/app/providers/authContext'
import { readJson, writeJson } from '@/lib/storage'

// ---------- Sucursal de trabajo ----------
// El staff trabaja en la suya (la API la toma del usuario). El admin elige una y se recuerda en la pestaña.

const KEY = 'taller.sucursal-admin'
let adminStore: string | null = readJson<string | null>(KEY, null, 'session')
const listeners = new Set<() => void>()

export function setAdminBranch(id: string) {
  adminStore = id
  writeJson(KEY, id, 'session')
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** `store_id` que se manda a la API: solo para el admin (el staff no puede elegir otra sucursal). */
export function useBranchParam(): { store_id?: string } {
  const { user } = useAuth()
  const chosen = useSyncExternalStore(subscribe, () => adminStore)
  return user?.role === 'admin' && chosen ? { store_id: chosen } : {}
}

export const branchKeys = {
  all: ['branch'] as const,
  inventory: (params: object) => ['branch', 'inventory', params] as const,
  pickups: (params: object) => ['branch', 'pickups', params] as const,
}

// ---------- EP-48 y EP-49 ----------

export function useInventory(filters: { q?: string; status?: string; page?: number }) {
  const branch = useBranchParam()
  const params = Object.fromEntries(
    Object.entries({ ...filters, ...branch }).filter(([, v]) => v !== undefined && v !== ''),
  )
  return useQuery({
    queryKey: branchKeys.inventory(params),
    queryFn: () => get(endpoints.branchInventory, inventoryPageSchema, params),
    placeholderData: keepPreviousData,
  })
}

export const ADJUST_REASONS = [
  { value: 'recepcion', label: 'Recepción de mercancía' },
  { value: 'conteo', label: 'Conteo físico' },
  { value: 'danado', label: 'Producto dañado' },
  { value: 'devolucion', label: 'Devolución de cliente' },
] as const

export function useAdjustStock() {
  const queryClient = useQueryClient()
  const branch = useBranchParam()
  return useMutation({
    mutationFn: ({ sku, delta, reason }: { sku: string; delta: number; reason: string }) =>
      send('post', withParams(endpoints.branchAdjust(sku), branch), inventoryRowSchema, { delta, reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branch', 'inventory'] }),
  })
}

// ---------- EP-50 y EP-51 ----------

/** Tablero de recolección. Se actualiza solo cada 30 s: llegan pedidos pagados mientras se trabaja. */
export function usePickups() {
  const branch = useBranchParam()
  return useQuery({
    queryKey: branchKeys.pickups(branch),
    queryFn: () => get(endpoints.branchPickups, pickupBoardSchema, branch),
    refetchInterval: 30_000,
  })
}

export function usePickupStatus() {
  const queryClient = useQueryClient()
  const branch = useBranchParam()
  return useMutation({
    mutationFn: ({ id, to }: { id: string; to: 'en_preparacion' | 'listo_para_recoger' }) =>
      send('post', withParams(endpoints.branchPickupStatus(id), branch), pickupSchema, { to }),
    // También si falla (409): otra persona lo movió y hay que ver el estado real.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['branch', 'pickups'] }),
  })
}

// ---------- EP-52 ----------

export function useVerifyPickup() {
  const branch = useBranchParam()
  return useMutation({
    mutationFn: (input: { pickup_code: string; order_id?: string }) =>
      send('post', withParams(endpoints.branchVerify, branch), handoverSchema, input),
  })
}

export function useHandover() {
  const queryClient = useQueryClient()
  const branch = useBranchParam()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string
      pickup_code: string
      id_checked: boolean
      items_checked: boolean
    }) => send('post', withParams(endpoints.branchHandover(id), branch), handoverSchema, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branch'] }),
  })
}

/** send() no recibe query string: el store_id del admin va en la URL. */
function withParams(url: string, params: { store_id?: string }) {
  return params.store_id ? `${url}?store_id=${encodeURIComponent(params.store_id)}` : url
}
