import { HttpResponse } from 'msw'
import type { Role, User } from '@/api/schemas/auth'
import { db } from '../db/store'
import type { DbUser } from '../db/seed'

/** Patrón de ruta que funciona en navegador y en Node (cualquier origen). */
export const API = '*/api/v1'

/** Vida del access token simulado: corta a propósito para probar el refresh (sec. 4.3). */
export const ACCESS_TTL_S = 60

export function businessError(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return HttpResponse.json({ detail: { code, message, ...extra } }, { status })
}

/** 422 con el formato de FastAPI: detail[] con loc y msg. */
export function validationError(fields: Record<string, string>) {
  return HttpResponse.json(
    {
      detail: Object.entries(fields).map(([field, msg]) => ({
        loc: ['body', ...field.split('.')],
        msg,
        type: 'value_error',
      })),
    },
    { status: 422 },
  )
}

// ---------- Tokens simulados: "mock.<userId>.<expiraMs>" ----------

export function issueAccessToken(userId: string) {
  return `mock.${userId}.${Date.now() + ACCESS_TTL_S * 1000}`
}

export function issueRefreshToken(userId: string) {
  const token = `rt.${userId}.${crypto.randomUUID()}`
  db.refreshTokens.set(token, userId)
  return token
}

export function toPublicUser(u: DbUser): User {
  const branch = u.branch_id ? db.stores.find((s) => s.id === u.branch_id) : null
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    branch_id: u.branch_id,
    branch_name: branch?.name ?? null,
  }
}

/** Usuario del encabezado Authorization, o null si no hay o venció. */
export function currentUser(request: Request): DbUser | null {
  const header = request.headers.get('Authorization')
  const match = header?.match(/^Bearer mock\.(.+)\.(\d+)$/)
  if (!match) return null
  const [, userId, exp] = match
  if (Number(exp) < Date.now()) return null
  return db.users.find((u) => u.id === userId) ?? null
}

/** Exige sesión (y rol). Devuelve el usuario o la respuesta 401/403 lista para regresar. */
export function requireUser(request: Request, roles?: Role[]): { user: DbUser } | { response: Response } {
  const user = currentUser(request)
  if (!user) return { response: businessError(401, 'not_authenticated', 'Inicia sesión para continuar.') }
  if (roles && !roles.includes(user.role)) {
    return { response: businessError(403, 'forbidden', 'No tienes permiso para hacer esto.') }
  }
  return { user }
}
