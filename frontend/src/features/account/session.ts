import { z } from 'zod'
import type { Role, User } from '@/api/schemas/auth'

/** Pantalla donde una cuenta con contraseña temporal crea la suya antes de seguir. */
export const CHANGE_PASSWORD_PATH = '/cuenta/cambiar-contrasena'

export const ROLE_LABEL: Record<Role, string> = {
  cliente: 'Cliente',
  staff: 'Staff de sucursal',
  admin: 'Administrador',
}

/** A dónde va cada rol al entrar, si no venía de otra página. */
export function homeFor(user: User) {
  if (user.must_change_password) return CHANGE_PASSWORD_PATH
  return user.role === 'admin' ? '/admin' : user.role === 'staff' ? '/sucursal/inventario' : '/cuenta'
}

/** Solo rutas internas en ?next= (evita redirecciones abiertas a otros sitios). */
export function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

/** Destino después de entrar: la contraseña temporal va antes que cualquier ?next=. */
export function afterLogin(user: User, next: string | null) {
  return user.must_change_password ? CHANGE_PASSWORD_PATH : (next ?? homeFor(user))
}

export const passwordChangeSchema = z
  .object({
    current: z.string().min(1, 'Escribe tu contraseña actual.'),
    password: z.string().min(8, 'Usa al menos 8 caracteres.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden.' })
export type PasswordChange = z.infer<typeof passwordChangeSchema>
