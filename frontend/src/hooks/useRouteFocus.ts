import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Al cambiar de ruta (no en la primera carga) lleva el foco al h1 de <main>,
 * para que el lector de pantalla anuncie la página nueva (sec. 28).
 */
export function useRouteFocus() {
  const { pathname } = useLocation()
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    // Espera un cuadro a que la página nueva pinte su h1.
    const id = requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main')
      if (!target) return
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [pathname])
}
