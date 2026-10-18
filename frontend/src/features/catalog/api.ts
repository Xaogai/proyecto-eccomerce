import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { get } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { type Category, categorySchema } from '@/api/schemas/catalog'

// Las claves de datos públicos empiezan con "catalog": no se borran al cerrar sesión.
export const catalogKeys = {
  categories: ['catalog', 'categories'] as const,
}

/** EP-01: árbol de categorías (3 niveles). Cambia poco: 10 min de vigencia. */
export function useCategories() {
  return useQuery({
    queryKey: catalogKeys.categories,
    queryFn: () => get(endpoints.categories, z.array(categorySchema)),
    staleTime: 10 * 60_000,
  })
}

/** Departamento (nivel 1) que contiene la categoría, para marcarlo como activo en el menú. */
export function findDepartment(tree: Category[], slug: string): Category | undefined {
  const contains = (c: Category): boolean => c.slug === slug || c.children.some(contains)
  return tree.find(contains)
}
