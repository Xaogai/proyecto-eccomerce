import { useQuery } from '@tanstack/react-query'
import { get } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { type FeatureFlag, featureFlagsSchema } from '@/api/schemas/auth'

const useFlags = () =>
  useQuery({
    queryKey: ['catalog', 'feature-flags'],
    queryFn: () => get(endpoints.featureFlags, featureFlagsSchema),
    staleTime: 5 * 60_000,
  })

/** EP-33. Mientras carga, o si falla, la función se considera apagada. */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  return useFlags().data?.[flag] ?? false
}

/** Para reservar el espacio de una función mientras se sabe si está activa (evita saltos, CLS). */
export function useFeatureFlagsLoading(): boolean {
  return useFlags().isPending
}
