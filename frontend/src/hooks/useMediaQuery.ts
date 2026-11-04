import { useSyncExternalStore } from 'react'
import { type Breakpoint, mediaQuery } from '@/styles/breakpoints'

/** true si la pantalla mide al menos ese punto de quiebre. Solo para cambiar de patrón de interacción; el layout va en CSS. */
export function useMediaQuery(bp: Breakpoint): boolean {
  const query = mediaQuery(bp)
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
