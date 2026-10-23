import { useEffect } from 'react'

export const SITE_NAME = 'Ferremarket'

/** Cambia document.title al entrar a la página: "Taladros · Ferremarket". */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME
  }, [title])
}
