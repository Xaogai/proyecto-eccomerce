import { useEffect, useState } from 'react'

/**
 * Devuelve `value` hasta que deja de cambiar durante `delayMs` (p. ej. lo escrito en un buscador).
 * @param value valor que cambia seguido
 * @param delayMs espera en milisegundos antes de aceptar el último valor
 * @returns el último valor estable
 */
export function useDebounce<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
