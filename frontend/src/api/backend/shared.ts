// Conversión de unidades, nombres y datos de referencia (categorías y sucursales) que usan varias rutas.
import type { Category } from '../schemas/catalog'
import { normalize } from '@/lib/text'
import { bget } from './http'
import type { BCategory, BStore } from './types'

/** El backend maneja pesos con decimales ("2499.00"); el contrato, centavos enteros. */
export const toCents = (pesos: string | number | null | undefined): number =>
  Math.round(Number(pesos ?? 0) * 100)

export const toPesos = (cents: number | string): string => (Number(cents) / 100).toFixed(2)

/** "Herramientas Eléctricas" → "herramientas-electricas" (el backend no guarda slug). */
export function slugify(name: string): string {
  return normalize(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Imagen que el backend dibuja para cada SKU cuando el producto no tiene foto. */
export const skuImage = (sku: string) => `/api/v1/product-image/${encodeURIComponent(sku)}.svg`

/** "rojo · 20V · 4.0Ah" a partir de los atributos de la variante. */
export function variantLabel(atributos: Record<string, unknown>, fallback: string): string {
  const values = Object.values(atributos ?? {})
    .map((v) => String(v))
    .filter(Boolean)
  return values.length ? values.map((v) => v.charAt(0).toUpperCase() + v.slice(1)).join(' · ') : fallback
}

// ---------- Datos de referencia con caché corta ----------

const TTL_MS = 5 * 60_000
const cache = new Map<string, { at: number; value: Promise<unknown> }>()

export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>
  const value = load().catch((error: unknown) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, { at: Date.now(), value })
  return value
}

export function invalidate(key: string) {
  cache.delete(key)
}

export function toCategory(c: BCategory): Category {
  return { id: c.id, slug: slugify(c.nombre), name: c.nombre, children: c.subcategorias.map(toCategory) }
}

export const categoryTree = () =>
  cached('categories', async () => (await bget<BCategory[]>('/categories')).map(toCategory))

export const branches = () => cached('branches', () => bget<BStore[]>('/branches'))

/** Busca la categoría por slug (o por id) en el árbol. */
export function findCategory(tree: Category[], slugOrId: string): Category | undefined {
  for (const c of tree) {
    if (c.slug === slugOrId || c.id === slugOrId) return c
    const found = findCategory(c.children, slugOrId)
    if (found) return found
  }
  return undefined
}

export async function branchName(id: string | null | undefined): Promise<string | undefined> {
  if (!id) return undefined
  return (await branches()).find((b) => b.id === id)?.nombre
}
