// EP-20 a EP-26
import { http, HttpResponse } from 'msw'
import { db } from '../db/store'
import { applyScenario } from '../scenarios'
import {
  ACCESS_TTL_S,
  API,
  businessError,
  issueAccessToken,
  issueRefreshToken,
  requireUser,
  toPublicUser,
  validationError,
} from './utils'

const MAX_ATTEMPTS = 5
const LOCK_SECONDS = 15 * 60

function session(userId: string) {
  const user = db.users.find((u) => u.id === userId)!
  user.last_login = new Date().toISOString()
  return {
    access_token: issueAccessToken(userId),
    expires_in: ACCESS_TTL_S,
    refresh_token: issueRefreshToken(userId), // T-02: en fase 7 va en cookie HttpOnly
    user: toPublicUser(user),
  }
}

export const authHandlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const { email, password } = (await request.json()) as { email?: string; password?: string }
    const user = db.users.find(
      (u) =>
        u.email.toLowerCase() ===
        String(email ?? '')
          .trim()
          .toLowerCase(),
    )

    if (user?.locked) {
      return businessError(
        423,
        'account_locked',
        'Bloqueamos tu cuenta por seguridad tras varios intentos fallidos.',
        {
          retry_after_s: LOCK_SECONDS,
        },
      )
    }
    if (!user || user.password !== password) {
      if (user) {
        user.failed_attempts += 1
        if (user.failed_attempts >= MAX_ATTEMPTS) user.locked = true
      }
      return businessError(401, 'invalid_credentials', 'El correo o la contraseña no son correctos.', {
        attempts_left: user ? Math.max(0, MAX_ATTEMPTS - user.failed_attempts) : undefined,
      })
    }
    if (user.active === false)
      return businessError(
        403,
        'account_disabled',
        'Tu cuenta está desactivada. Pide a un administrador que la reactive.',
      )
    user.failed_attempts = 0
    return HttpResponse.json(session(user.id))
  }),

  http.post(`${API}/auth/register`, async ({ request }) => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    const body = (await request.json()) as {
      name?: string
      email?: string
      password?: string
      privacy_accepted?: boolean
    }
    const errors: Record<string, string> = {}
    if (!body.name?.trim()) errors.name = 'Escribe tu nombre.'
    if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))
      errors.email = 'Escribe un correo válido, por ejemplo nombre@correo.com.'
    if (!body.password || body.password.length < 8) {
      errors.password = `Tu contraseña tiene ${body.password?.length ?? 0} caracteres. Usa al menos 8.`
    }
    if (!body.privacy_accepted)
      errors.privacy_accepted = 'Para crear tu cuenta necesitas aceptar el aviso de privacidad.'
    if (Object.keys(errors).length) return validationError(errors)

    if (db.users.some((u) => u.email.toLowerCase() === body.email!.toLowerCase())) {
      return businessError(
        409,
        'email_taken',
        'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.',
      )
    }
    const id = `u-${crypto.randomUUID().slice(0, 8)}`
    db.users.push({
      id,
      name: body.name!.trim(),
      email: body.email!,
      password: body.password!,
      role: 'cliente',
      branch_id: null,
      locked: false,
      failed_attempts: 0,
      last_login: null,
    })
    return HttpResponse.json(session(id), { status: 201 })
  }),

  http.post(`${API}/auth/refresh`, async ({ request }) => {
    const { refresh_token } = (await request.json().catch(() => ({}))) as { refresh_token?: string }
    const userId = refresh_token ? db.refreshTokens.get(refresh_token) : undefined
    if (!refresh_token || !userId)
      return businessError(401, 'invalid_refresh', 'Tu sesión terminó. Inicia sesión de nuevo.')
    // Rotación: el token usado deja de servir.
    db.refreshTokens.delete(refresh_token)
    return HttpResponse.json({
      access_token: issueAccessToken(userId),
      expires_in: ACCESS_TTL_S,
      refresh_token: issueRefreshToken(userId),
    })
  }),

  http.post(`${API}/auth/logout`, async ({ request }) => {
    const { refresh_token } = (await request.json().catch(() => ({}))) as { refresh_token?: string }
    if (refresh_token) db.refreshTokens.delete(refresh_token)
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(`${API}/auth/password/forgot`, async () => {
    const hijack = await applyScenario()
    if (hijack) return hijack
    // Siempre 202: no revela si el correo existe.
    return new HttpResponse(null, { status: 202 })
  }),

  http.post(`${API}/auth/password/reset`, async ({ request }) => {
    const { token, password } = (await request.json()) as { token?: string; password?: string }
    if (token === 'vencido')
      return businessError(410, 'token_expired', 'El enlace ya venció. Pide uno nuevo.')
    if (!password || password.length < 8) return validationError({ password: 'Usa al menos 8 caracteres.' })
    return new HttpResponse(null, { status: 204 })
  }),

  http.get(`${API}/me`, async ({ request }) => {
    const auth = requireUser(request)
    if ('response' in auth) return auth.response
    return HttpResponse.json(toPublicUser(auth.user))
  }),
]
