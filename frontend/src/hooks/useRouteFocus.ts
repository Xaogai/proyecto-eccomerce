import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Al cambiar de ruta (no en la primera carga) lleva el foco al h1 de <main>,
 * para que el lector de pantalla anuncie la página nueva (sec. 28).
 */
export function useRouteFocus() {
  const { pathname } = useLocation()
  // Ruta anterior (no un flag de "primera vez": en desarrollo StrictMode ejecuta el efecto dos veces).
  const previous = useRef(pathname)

  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    // Espera un cuadro a que la página nueva pinte su h1.
    const id = requestAnimationFrame(() => {
      // Si la página ya puso el foco en un campo (p. ej. el buscador con autoFocus), se respeta.
      const focused = document.activeElement
      if (focused && focused !== document.body && document.querySelector('main')?.contains(focused)) return
      const target =
        document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main')
      if (!target) return
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [pathname])
}
