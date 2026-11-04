import type { User } from '@/api/schemas/auth'

/** A dónde va cada rol al entrar, si no venía de otra página. */
export function homeFor(user: User) {
  return user.role === 'admin' ? '/admin' : user.role === 'staff' ? '/sucursal/inventario' : '/cuenta'
}

/** Solo rutas internas en ?next= (evita redirecciones abiertas a otros sitios). */
export function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}
