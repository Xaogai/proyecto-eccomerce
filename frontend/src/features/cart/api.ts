import { useQuery } from '@tanstack/react-query'
import { CART_ID_KEY, get } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { cartSchema } from '@/api/schemas/cart'
import { useAuth } from '@/app/providers/authContext'
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
