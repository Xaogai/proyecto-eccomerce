import type { Category } from '@/api/schemas/catalog'

export interface CategoryOption {
  slug: string
  /** "Herramientas › Eléctricas › Taladros" */
  label: string
  depth: number
}

/** Árbol de categorías como lista plana para un <select>, con la ruta completa en cada opción. */
export function flattenCategories(tree: Category[], path: string[] = [], depth = 1): CategoryOption[] {
  return tree.flatMap((c) => [
    { slug: c.slug, label: [...path, c.name].join(' › '), depth },
    ...flattenCategories(c.children, [...path, c.name], depth + 1),
  ])
}
