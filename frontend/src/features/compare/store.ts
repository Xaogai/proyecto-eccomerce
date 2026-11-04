import { useSyncExternalStore } from 'react'
import { readJson, writeJson } from '@/lib/storage'

// Productos elegidos para comparar (hasta 4). Se guardan en el navegador para que sobrevivan
// a la navegación entre listado, ficha y comparador.

export const MAX_COMPARE = 4
const KEY = 'taller.comparar'

export interface CompareItem {
  sku: string
  name: string
}

let items: CompareItem[] = readJson<CompareItem[]>(KEY, [])
const listeners = new Set<() => void>()

function set(next: CompareItem[]) {
  items = next
  writeJson(KEY, next.length ? next : null)
  listeners.forEach((l) => l())
}

export const compareStore = {
  add(item: CompareItem): boolean {
    if (items.some((i) => i.sku === item.sku)) return true
    if (items.length >= MAX_COMPARE) return false
    set([...items, item])
    return true
  },
  remove(sku: string) {
    set(items.filter((i) => i.sku !== sku))
  },
  clear() {
    set([])
  },
  /** Para pruebas: vuelve a leer del almacenamiento. */
  reload() {
    items = readJson<CompareItem[]>(KEY, [])
    listeners.forEach((l) => l())
  },
}

export function useCompareList(): CompareItem[] {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => items,
    () => items,
  )
}
