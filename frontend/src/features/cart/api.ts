import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CART_ID_KEY, get, send } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { ApiError } from '@/api/errors'
import { type Cart, cartSchema } from '@/api/schemas/cart'
import { useAuth } from '@/app/providers/authContext'
import { useSelectedStore } from '@/app/providers/storeContext'
import { useToast } from '@/components/feedback/toastContext'
import { plural } from '@/lib/format'
import { readJson, writeJson } from '@/lib/storage'

export const cartKeys = {
  all: ['cart'] as const,
  cart: (storeId: string | null) => ['cart', storeId] as const,
}

/** EP-10, con el stock de cada producto en la sucursal elegida. El invitado guarda el id para X-Cart-Id (T-01). */
export function useCart() {
  const { status } = useAuth()
  const { store } = useSelectedStore()
  const storeId = store?.id ?? null
  return useQuery({
    queryKey: cartKeys.cart(storeId),
    queryFn: async () => {
      const cart = await get(endpoints.cart, cartSchema, storeId ? { store_id: storeId } : undefined)
      if (status === 'anonimo') writeJson(CART_ID_KEY, cart.id)
      return cart
    },
    staleTime: 0,
    enabled: status !== 'cargando',
  })
}

export function useCartCount(): number {
  const { data } = useCart()
  return data?.items.reduce((n, i) => n + i.qty, 0) ?? 0
}

/** Guarda el carrito que devuelve una mutación y refresca las otras vistas (con otra sucursal). */
function useStoreCart() {
  const queryClient = useQueryClient()
  const { status } = useAuth()
  const { store } = useSelectedStore()
  return (cart: Cart) => {
    if (status === 'anonimo') writeJson(CART_ID_KEY, cart.id)
    void queryClient.invalidateQueries({ queryKey: cartKeys.all })
    queryClient.setQueryData(cartKeys.cart(store?.id ?? null), cart)
  }
}

const withStore = (url: string, storeId?: string) =>
  storeId ? `${url}?store_id=${encodeURIComponent(storeId)}` : url

const errorText = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback)

/** EP-11. Actualiza el contador del encabezado y avisa con un toast (se lee en voz alta). */
export function useAddToCart() {
  const save = useStoreCart()
  const { store } = useSelectedStore()
  const { toast } = useToast()
  return useMutation({
    mutationFn: (input: { sku: string; qty: number; name: string }) =>
      send('post', withStore(endpoints.cartItems, store?.id), cartSchema, { sku: input.sku, qty: input.qty }),
    onSuccess: (cart, input) => {
      save(cart)
      toast(`Agregaste ${plural(input.qty, 'pieza')} de ${input.name} al carrito`, 'ok')
    },
    onError: (error) => toast(errorText(error, 'No pudimos agregar el producto. Intenta de nuevo.'), 'error'),
  })
}

/** EP-12 */
export function useUpdateCartItem() {
  const save = useStoreCart()
  const { store } = useSelectedStore()
  const { toast } = useToast()
  return useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) =>
      send('patch', withStore(endpoints.cartItem(id), store?.id), cartSchema, { qty }),
    onSuccess: save,
    onError: (error) => toast(errorText(error, 'No pudimos cambiar la cantidad. Intenta de nuevo.'), 'error'),
  })
}

/** EP-13 */
export function useRemoveCartItem() {
  const save = useStoreCart()
  const { store } = useSelectedStore()
  const { toast } = useToast()
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) =>
      send('delete', withStore(endpoints.cartItem(id), store?.id), cartSchema),
    onSuccess: (cart, { name }) => {
      save(cart)
      toast(`Quitaste ${name} del carrito`, 'neutro')
    },
    onError: (error) => toast(errorText(error, 'No pudimos quitar el producto. Intenta de nuevo.'), 'error'),
  })
}

// ---------- Modo de entrega elegido en el carrito (se usa como valor inicial en el checkout) ----------

export type DeliveryMode = 'recoger' | 'envio'
const MODE_KEY = 'taller.entrega'

export function useDeliveryMode(): [DeliveryMode, (mode: DeliveryMode) => void] {
  const [mode, setMode] = useState<DeliveryMode>(() => readJson<DeliveryMode>(MODE_KEY, 'recoger'))
  return [
    mode,
    (next) => {
      writeJson(MODE_KEY, next)
      setMode(next)
    },
  ]
}
