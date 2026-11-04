// Capa de traducción entre el contrato del frontend (docs/api/endpoints-propuestos.md) y el backend real.
// Las pantallas y los datos simulados hablan el contrato; aquí cada ruta se convierte a la del backend
// (nombres en español, pesos en lugar de centavos, otras rutas) y la respuesta vuelve con la forma del contrato.
import { ApiError } from '../errors'

export type Method = 'get' | 'post' | 'patch' | 'put' | 'delete'

export interface RouteContext {
  /** Grupos del patrón: /products/:sku → { sku } */
  params: Record<string, string>
  /** Parámetros de la URL ya unidos (los de `?` en la ruta y los de axios) */
  query: Record<string, string>
  body: unknown
}

export interface Route {
  method: Method
  /** Ruta del contrato con `:nombre` para los segmentos variables */
  path: string
  handle: (ctx: RouteContext) => Promise<unknown>
}

interface CompiledRoute extends Route {
  regex: RegExp
  names: string[]
}

const routes: CompiledRoute[] = []

/** Registra rutas del contrato. Las más específicas van antes (/products/compare antes que /products/:sku). */
export function register(list: Route[]) {
  for (const route of list) {
    const names: string[] = []
    const pattern = route.path.replace(/:(\w+)/g, (_, name: string) => {
      names.push(name)
      return '([^/]+)'
    })
    routes.push({ ...route, regex: new RegExp(`^${pattern}$`), names })
  }
}

function toQuery(search: string, params?: object): Record<string, string> {
  const query: Record<string, string> = {}
  new URLSearchParams(search).forEach((value, key) => {
    query[key] = value
  })
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') query[key] = String(value)
  }
  return query
}

/** Resuelve una llamada del contrato contra el backend real. */
export async function translate(
  method: Method,
  url: string,
  params?: object,
  body?: unknown,
): Promise<unknown> {
  const [path, search = ''] = url.split('?')
  for (const route of routes) {
    if (route.method !== method) continue
    const match = route.regex.exec(path)
    if (!match) continue
    const named = Object.fromEntries(route.names.map((name, i) => [name, decodeURIComponent(match[i + 1])]))
    return route.handle({ params: named, query: toQuery(search, params), body })
  }
  throw new ApiError(501, 'Esta función todavía no está disponible.', 'not_implemented')
}
