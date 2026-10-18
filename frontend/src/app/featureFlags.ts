import { useQuery } from '@tanstack/react-query'
import { get } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { type FeatureFlag, featureFlagsSchema } from '@/api/schemas/auth'

/** EP-33. Mientras carga, o si falla, la función se considera apagada. */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  const { data } = useQuery({
    queryKey: ['catalog', 'feature-flags'],
    queryFn: () => get(endpoints.featureFlags, featureFlagsSchema),
    staleTime: 5 * 60_000,
  })
  return data?.[flag] ?? false
}
