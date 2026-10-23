import { readJson, writeJson } from '@/lib/storage'

const RECENT_KEY = 'taller.recientes'
const MAX_RECENT = 5

/** Guarda la búsqueda al inicio de la lista (sin repetir, máximo 5). */
export function rememberSearch(q: string) {
  const term = q.trim()
  if (!term) return
  const list = readJson<string[]>(RECENT_KEY, []).filter((t) => t.toLowerCase() !== term.toLowerCase())
  writeJson(RECENT_KEY, [term, ...list].slice(0, MAX_RECENT))
}

export const readRecentSearches = () => readJson<string[]>(RECENT_KEY, [])
