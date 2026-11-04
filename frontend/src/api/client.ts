import axios, { type InternalAxiosRequestConfig } from 'axios'
import type { ZodType } from 'zod'
import { readJson } from '@/lib/storage'
import { toApiError } from './errors'
import { refreshResponseSchema } from './schemas/auth'
import { tokenStorage } from './tokenStorage'

export const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

/** Clave del carrito de invitado (T-01: mientras no se acuerde cookie, va en el encabezado X-Cart-Id). */
export const CART_ID_KEY = 'taller.cart'

export const api = axios.create({ baseURL: API_BASE, withCredentials: true })
/** Sin interceptores: para /auth/refresh, así no entra en el ciclo del 401. */
const raw = axios.create({ baseURL: API_BASE, withCredentials: true })

// ---- Access token: solo en memoria ----
let accessToken: string | null = null
const expiredListeners = new Set<() => void>()

export function setAccessToken(token: string | null) {
  accessToken = token
}

/** Avisa cuando la sesión no se pudo renovar (el AuthProvider cierra sesión). */
export function onSessionExpired(cb: () => void): () => void {
  expiredListeners.add(cb)
  return () => expiredListeners.delete(cb)
}

// ---- Refresh: una sola llamada aunque fallen varias peticiones a la vez ----
let refreshing: Promise<string | null> | null = null

export function refreshAccessToken(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const rt = tokenStorage.get()
      const { data } = await raw.post('/auth/refresh', rt ? { refresh_token: rt } : {})
      const parsed = refreshResponseSchema.parse(data)
      accessToken = parsed.access_token
      tokenStorage.set(parsed.refresh_token)
      return accessToken
    } catch {
      accessToken = null
      tokenStorage.clear()
      return null
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  const cartId = readJson<string | null>(CART_ID_KEY, null)
  if (cartId) config.headers['X-Cart-Id'] = cartId
  return config
})

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean }

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const config = error.config as RetryConfig | undefined
    const isAuthCall = config?.url?.startsWith('/auth/')
    if (error.response?.status === 401 && config && !config._retry && !isAuthCall) {
      config._retry = true
      const token = await refreshAccessToken()
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
        return api(config)
      }
      expiredListeners.forEach((cb) => cb())
    }
    throw toApiError(error)
  },
)

/**
 * Con datos simulados (modo mock y pruebas) MSW contesta el contrato tal cual. Con el backend real,
 * cada llamada pasa por la capa de traducción de src/api/backend (rutas y nombres del backend).
 */
export const usesRealBackend =
  import.meta.env.MODE !== 'mock' && import.meta.env.MODE !== 'test' && import.meta.env.VITE_MOCKS !== 'true'

/**
 * GET/POST tipados. En desarrollo valida la respuesta con zod para detectar
 * enseguida si backend (o el mock) se salió del contrato.
 */
function check<T>(schema: ZodType<T>, data: unknown): T {
  return import.meta.env.DEV ? schema.parse(data) : (data as T)
}

export async function get<T>(url: string, schema: ZodType<T>, params?: object): Promise<T> {
  if (usesRealBackend) return check(schema, await translateCall('get', url, params))
  const { data } = await api.get(url, { params })
  return check(schema, data)
}

export async function send<T>(
  method: 'post' | 'patch' | 'put' | 'delete',
  url: string,
  schema: ZodType<T>,
  body?: unknown,
): Promise<T> {
  if (usesRealBackend) return check(schema, await translateCall(method, url, undefined, body))
  const { data } = await api.request({ method, url, data: body })
  return check(schema, data)
}

/** Carga la capa de traducción solo cuando hace falta (no entra al paquete de los datos simulados). */
async function translateCall(
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  url: string,
  params?: object,
  body?: unknown,
): Promise<unknown> {
  const { translate } = await import('./backend')
  try {
    return await translate(method, url, params, body)
  } catch (error) {
    throw toApiError(error)
  }
}
