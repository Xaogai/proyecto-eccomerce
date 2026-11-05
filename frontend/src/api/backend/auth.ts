// EP-20 a EP-26 y EP-53: sesión. El backend regresa solo tokens; el usuario se pide aparte a /users/me.
import type { LoginResponse, User } from '../schemas/auth'
import { ApiError, toApiError } from '../errors'
import { bget, bsend } from './http'
import type { Route } from './router'

interface BTokens {
  access_token: string
  refresh_token: string
  expires_in_minutes: number
}

export interface BUser {
  id: string
  nombre: string
  email: string
  tipo_usuario: 'cliente' | 'staff' | 'admin'
  telefono: string | null
  acepta_marketing: boolean
  acepta_personalizacion: boolean
  sucursal_id: string | null
  sucursal_nombre: string | null
}

export function toUser(u: BUser): User {
  return {
    id: u.id,
    name: u.nombre,
    email: u.email,
    role: u.tipo_usuario,
    branch_id: u.sucursal_id,
    branch_name: u.sucursal_nombre,
  }
}

// El refresh token no se pasa a la app: el navegador lo guarda en la cookie HttpOnly que pone el backend.
export const toRefreshResponse = (t: BTokens) => ({
  access_token: t.access_token,
  expires_in: t.expires_in_minutes * 60,
})

/** Errores del backend con los nombres del contrato (attempts_left, retry_after_s). */
function renameErrorData(error: unknown): never {
  const e = toApiError(error)
  const data = { ...e.data }
  if ('intentos_restantes' in data) data.attempts_left = data.intentos_restantes
  if ('reintentar_en_s' in data) data.retry_after_s = data.reintentar_en_s
  // 429 del backend es la cuenta bloqueada; el frontend la espera como 423.
  const status = e.code === 'account_locked' ? 423 : e.status
  throw new ApiError(status, e.message, e.code, e.fieldErrors, data)
}

/** Nombres de campo del backend → los del formulario, para marcar el error junto al campo. */
function renameFields(error: unknown, map: Record<string, string>): never {
  const e = toApiError(error)
  const fieldErrors = Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [map[k] ?? k, v]))
  throw new ApiError(e.status, e.message, e.code, fieldErrors, e.data)
}

async function session(tokens: BTokens): Promise<LoginResponse> {
  const me = await bget<BUser>('/users/me', undefined, { Authorization: `Bearer ${tokens.access_token}` })
  return { ...toRefreshResponse(tokens), user: toUser(me) }
}

async function login(body: { email: string; password: string; remember?: boolean }): Promise<LoginResponse> {
  const tokens = await bsend<BTokens>('post', '/auth/login', {
    email: body.email,
    password: body.password,
    recordar: body.remember ?? false,
  }).catch(renameErrorData)
  return session(tokens)
}

export const authRoutes: Route[] = [
  {
    method: 'post',
    path: '/auth/login',
    handle: ({ body }) => login(body as { email: string; password: string }),
  },
  {
    method: 'post',
    path: '/auth/register',
    handle: async ({ body }) => {
      const input = body as {
        name: string
        email: string
        password: string
        privacy_accepted: boolean
        marketing_opt_in?: boolean
      }
      await bsend('post', '/auth/register', {
        nombre: input.name,
        email: input.email,
        password: input.password,
        acepta_aviso_privacidad: input.privacy_accepted,
        acepta_marketing: input.marketing_opt_in ?? false,
      }).catch((e: unknown) =>
        renameFields(e, { nombre: 'name', acepta_aviso_privacidad: 'privacy_accepted' }),
      )
      return login({ email: input.email, password: input.password })
    },
  },
  {
    method: 'post',
    path: '/auth/refresh',
    handle: async ({ body }) => toRefreshResponse(await bsend<BTokens>('post', '/auth/refresh', body)),
  },
  {
    method: 'post',
    path: '/auth/logout',
    handle: async ({ body }) => {
      await bsend('post', '/auth/logout', body ?? {})
      return null
    },
  },
  {
    method: 'post',
    path: '/auth/password/forgot',
    handle: async ({ body }) => {
      await bsend('post', '/auth/password-reset/request', body)
      return null
    },
  },
  {
    method: 'post',
    path: '/auth/password/reset',
    handle: async ({ body }) => {
      const { token, password } = body as { token: string; password: string }
      try {
        await bsend('post', '/auth/password-reset/confirm', { reset_token: token, new_password: password })
      } catch (error) {
        const e = toApiError(error)
        // Token vencido o ya usado: el backend responde 401; la página lo espera como enlace vencido.
        if (e.status === 401) throw new ApiError(410, 'El enlace ya venció. Pide uno nuevo.', 'token_expired')
        renameFields(e, { new_password: 'password' })
      }
      return null
    },
  },
  { method: 'get', path: '/me', handle: async () => toUser(await bget<BUser>('/users/me')) },
  {
    method: 'post',
    path: '/me/password',
    handle: async ({ body }) => {
      const { current, password } = body as { current: string; password: string }
      await bsend('post', '/users/me/password', { password_actual: current, password_nueva: password }).catch(
        (e: unknown) => {
          const err = toApiError(e)
          // Contraseña actual incorrecta: el formulario la marca en su campo.
          if (err.code === 'wrong_password')
            throw new ApiError(422, err.message, 'validation_error', { current: err.message })
          return renameFields(err, { password_actual: 'current', password_nueva: 'password' })
        },
      )
      return null
    },
  },
]
