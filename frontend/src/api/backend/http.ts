// Llamadas al backend real con el mismo cliente de axios de la app (token, X-Cart-Id y renovación de sesión).
import { api } from '../client'

type QueryValue = string | number | boolean | null | undefined | Array<string | number>

/** Arma `?a=1&b=x&b=y` sin vacíos; los arreglos se repiten (`atributo=…&atributo=…`) como espera FastAPI. */
export function withQuery(url: string, query: Record<string, QueryValue> = {}): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((v) => search.append(key, String(v)))
    else if (value !== undefined && value !== null && value !== '') search.append(key, String(value))
  }
  const qs = search.toString()
  return qs ? `${url}?${qs}` : url
}

export async function bget<T>(
  url: string,
  query?: Record<string, QueryValue>,
  headers?: Record<string, string>,
): Promise<T> {
  const { data } = await api.get<T>(withQuery(url, query), { headers })
  return data
}

export async function bsend<T>(
  method: 'post' | 'patch' | 'put' | 'delete',
  url: string,
  body?: unknown,
  query?: Record<string, QueryValue>,
): Promise<T> {
  const { data } = await api.request<T>({ method, url: withQuery(url, query), data: body })
  return data
}
