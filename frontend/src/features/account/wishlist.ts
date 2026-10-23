import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { get, send } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { productSummarySchema } from '@/api/schemas/catalog'
import { useAuth } from '@/app/providers/authContext'
import { useToast } from '@/components/feedback/toastContext'

export const wishlistKeys = { list: ['wishlist'] as const }
const listSchema = z.array(productSummarySchema)

/** EP-28. Solo con sesión. */
export function useWishlist() {
  const { status } = useAuth()
  return useQuery({
    queryKey: wishlistKeys.list,
    queryFn: () => get(endpoints.wishlist, listSchema),
    enabled: status === 'autenticado',
  })
}

/**
 * Guarda o quita un producto de la lista de deseos. Sin sesión, manda a iniciar sesión
 * y regresa a la misma página.
 */
export function useToggleWishlist() {
  const { status } = useAuth()
  const { data } = useWishlist()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()

  const mutation = useMutation({
    mutationFn: ({ sku, saved }: { sku: string; saved: boolean }) =>
      saved
        ? send('delete', endpoints.wishlistItem(sku), listSchema)
        : send('post', endpoints.wishlist, listSchema, { sku }),
    onSuccess: (list, { saved }) => {
      queryClient.setQueryData(wishlistKeys.list, list)
      toast(
        saved ? 'Quitaste el producto de tu lista de deseos' : 'Guardaste el producto en tu lista de deseos',
        'ok',
      )
    },
    onError: () => toast('No pudimos actualizar tu lista de deseos. Intenta de nuevo.', 'error'),
  })

  return {
    isSaved: (sku: string) => !!data?.some((p) => p.sku === sku),
    isPending: mutation.isPending,
    toggle: (sku: string) => {
      if (status !== 'autenticado') {
        navigate(`/cuenta/login?next=${encodeURIComponent(location.pathname + location.search)}`)
        return
      }
      mutation.mutate({ sku, saved: !!data?.some((p) => p.sku === sku) })
    },
  }
}
