import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/** Tiempo máximo que se espera a que la página nueva pinte su h1 (p. ej. si primero muestra un esqueleto). */
const WAIT_MS = 2000

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

    const focus = (target: HTMLElement) => {
      // Si la página ya puso el foco en un campo (p. ej. el buscador con autoFocus), se respeta.
      const focused = document.activeElement
      if (focused && focused !== document.body && document.querySelector('main')?.contains(focused)) return
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus()
    }
    const heading = () => document.querySelector<HTMLElement>('main h1')

    let observer: MutationObserver | null = null
    let timeout: number | undefined
    // Espera un cuadro a que la página nueva pinte; si aún carga, espera a que aparezca su h1.
    const frame = requestAnimationFrame(() => {
      const h1 = heading()
      if (h1) return focus(h1)
      observer = new MutationObserver(() => {
        const found = heading()
        if (!found) return
        observer?.disconnect()
        window.clearTimeout(timeout)
        focus(found)
      })
      observer.observe(document.body, { childList: true, subtree: true })
      timeout = window.setTimeout(() => {
        observer?.disconnect()
        const main = document.querySelector<HTMLElement>('main')
        if (main) focus(main)
      }, WAIT_MS)
    })
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.clearTimeout(timeout)
    }
  }, [pathname])
}
