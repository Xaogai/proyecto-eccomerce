import { useMutation, useQuery } from '@tanstack/react-query'
import { type NavigateFunction, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { get, send } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { addressSchema } from '@/api/schemas/auth'
import type { CartItem } from '@/api/schemas/cart'
import { checkoutResultSchema, orderSchema } from '@/api/schemas/order'
import { storeSchema } from '@/api/schemas/store'
import { useAuth } from '@/app/providers/authContext'
import { readJson, writeJson } from '@/lib/storage'

// ---------- Token del pedido de invitado (EP-16 ?token=) ----------

const TOKENS_KEY = 'taller.pedidos'

export function rememberGuestToken(orderId: string, token: string) {
  writeJson(
    TOKENS_KEY,
    { ...readJson<Record<string, string>>(TOKENS_KEY, {}, 'session'), [orderId]: token },
    'session',
  )
}

export function guestToken(orderId: string): string | undefined {
  return readJson<Record<string, string>>(TOKENS_KEY, {}, 'session')[orderId]
}

/**
 * Va a la pasarela. Una URL absoluta es la pasarela real (otro dominio); una ruta "/" es la
 * pasarela simulada de los datos de prueba, dentro de la app.
 */
export function goToPayment(url: string, navigate: NavigateFunction) {
  if (url.startsWith('/')) navigate(url)
  else window.location.assign(url)
}

// ---------- Checkout (EP-15) ----------

export interface CheckoutInput {
  contact: { name: string; email: string; phone: string }
  fulfillment: 'ship' | 'pickup'
  store_id?: string
  address_id?: string
  address?: {
    street: string
    ext: string
    int?: string
    colony: string
    zip: string
    city: string
    state: string
    references?: string
  }
}

export function useCheckout() {
  return useMutation({
    mutationFn: (input: CheckoutInput) => send('post', endpoints.checkout, checkoutResultSchema, input),
    onSuccess: (result) => {
      if (result.guest_token) rememberGuestToken(result.order_id, result.guest_token)
    },
  })
}

/** Sucursales cercanas con todo el pedido (EP-08 con ?skus=). */
export function useStoresForCart(items: CartItem[] | undefined, zip: string | undefined) {
  const skus = (items ?? []).map((i) => `${i.sku}:${i.qty}`).join(',')
  return useQuery({
    queryKey: ['catalog', 'stores-cart', skus, zip ?? null],
    queryFn: () => get(endpoints.stores, z.array(storeSchema), { skus, ...(zip ? { zip } : {}) }),
    enabled: skus.length > 0,
  })
}

/** EP-27: direcciones guardadas (solo con sesión). */
export function useAddresses() {
  const { status } = useAuth()
  return useQuery({
    queryKey: ['me', 'addresses'],
    queryFn: () => get(endpoints.addresses, z.array(addressSchema)),
    enabled: status === 'autenticado',
  })
}

// ---------- Pedido y pago (EP-16, EP-17) ----------

const POLL_MS = 2000
const MAX_POLL_MS = 90_000

/**
 * EP-16. Mientras el pago está "pendiente" consulta cada 2 s (la confirmación llega por webhook a backend).
 * Deja de consultar a los 90 s; la página ofrece entonces revisar más tarde.
 */
export function useOrder(id: string, token: string | undefined, startedAt: number) {
  return useQuery({
    queryKey: ['order', id, token ?? null],
    queryFn: () => get(endpoints.order(id), orderSchema, token ? { token } : undefined),
    refetchInterval: (query) =>
      query.state.data?.payment_status === 'pendiente' && Date.now() - startedAt < MAX_POLL_MS
        ? POLL_MS
        : false,
    staleTime: 0,
  })
}

export function useRetryPayment(id: string, token: string | undefined) {
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () =>
      send(
        'post',
        `${endpoints.orderPaymentRetry(id)}${token ? `?token=${encodeURIComponent(token)}` : ''}`,
        z.object({ payment_url: z.string() }),
      ),
    onSuccess: ({ payment_url }) => goToPayment(payment_url, navigate),
  })
}
