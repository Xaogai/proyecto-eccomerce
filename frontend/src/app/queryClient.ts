import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/errors'

/**
 * Crea el cliente de React Query de la app (uno por app y uno nuevo por prueba).
 * @returns cliente con datos frescos 1 min y sin reintentos en errores 4xx
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        // Un reintento para fallas de red o 5xx; nunca para 4xx.
        retry: (count, error) =>
          count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
      mutations: { retry: false },
    },
  })
}
