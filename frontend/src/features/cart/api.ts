import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CART_ID_KEY, get, send } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { ApiError } from '@/api/errors'
import { cartSchema } from '@/api/schemas/cart'
import { useAuth } from '@/app/providers/authContext'
import { useToast } from '@/components/feedback/toastContext'
import { plural } from '@/lib/format'
import { writeJson } from '@/lib/storage'

export const cartKeys = { cart: ['cart'] as const }

/** EP-10. El invitado guarda el id de su carrito para mandarlo en X-Cart-Id (T-01). */
export function useCart() {
  const { status } = useAuth()
  return useQuery({
    queryKey: cartKeys.cart,
    queryFn: async () => {
      const cart = await get(endpoints.cart, cartSchema)
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

/** EP-11. Actualiza el contador del encabezado y avisa con un toast (se lee en voz alta). */
export function useAddToCart() {
  const queryClient = useQueryClient()
  const { status } = useAuth()
  const { toast } = useToast()
  return useMutation({
    mutationFn: (input: { sku: string; qty: number; name: string }) =>
      send('post', endpoints.cartItems, cartSchema, { sku: input.sku, qty: input.qty }),
    onSuccess: (cart, input) => {
      if (status === 'anonimo') writeJson(CART_ID_KEY, cart.id)
      queryClient.setQueryData(cartKeys.cart, cart)
      toast(`Agregaste ${plural(input.qty, 'pieza')} de ${input.name} al carrito`, 'ok')
    },
    onError: (error) => {
      toast(
        error instanceof ApiError ? error.message : 'No pudimos agregar el producto. Intenta de nuevo.',
        'error',
      )
    },
  })
}
