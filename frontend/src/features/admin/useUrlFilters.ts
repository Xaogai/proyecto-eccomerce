import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDebounce } from '@/hooks/useDebounce'

/**
 * Filtros de las tablas del admin en la URL (se pueden compartir y sobreviven a "Atrás").
 * Cambiar un filtro regresa a la página 1. El texto de búsqueda se aplica al dejar de escribir.
 */
export function useUrlFilters() {
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const debounced = useDebounce(text.trim(), 300)

  const applied = useRef(debounced)

  const set = useCallback(
    (key: string, value: string | null) =>
      setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        next.delete('page')
        return next
      },
      { replace: true, flushSync: true },
      ),
    [setParams],
  )

  // Solo cuando cambia lo escrito (no al volver atrás en el historial).
  useEffect(() => {
    if (debounced === applied.current) return
    applied.current = debounced
    set('q', debounced || null)
  }, [debounced, set])

  return {
    get: (key: string) => params.get(key) ?? '',
    page: Math.max(1, Number(params.get('page')) || 1),
    set,
    text,
    setText,
  }
}
