import type { ReactNode } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import type { Role } from '@/api/schemas/auth'
import { PageSkeleton } from '@/components/feedback/States'
import { CHANGE_PASSWORD_PATH, safeNext } from '@/features/account/session'
import { ActiveSessionNotice } from '@/pages/account/ActiveSessionNotice'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import { useAuth } from './providers/authContext'

/**
 * Pide sesión. Mientras se renueva el token muestra un skeleton (no redirige antes de saber).
 * Una cuenta con contraseña temporal solo puede ir a crear la suya (`allowTemporaryPassword`).
 */
export function RequireAuth({
  children,
  roles,
  allowTemporaryPassword = false,
}: {
  children: ReactNode
  roles?: Role[]
  allowTemporaryPassword?: boolean
}) {
  const { status, user, hasRole } = useAuth()
  const location = useLocation()

  if (status === 'cargando') return <PageSkeleton label="Verificando tu sesión" />
  if (status === 'anonimo') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/cuenta/login?next=${next}`} replace />
  }
  if (user?.must_change_password && !allowTemporaryPassword)
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />
  // Solo UX: la autorización real la hace el backend.
  if (roles && !hasRole(...roles)) return <ForbiddenPage />
  return children
}

/**
 * Login y registro. Si el navegador ya tiene una sesión abierta (por ejemplo, con "Mantener mi sesión"),
 * lo dice y deja elegir entre seguir con esa cuenta o cerrarla para entrar con otra.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()
  const [params] = useSearchParams()
  if (status === 'cargando') return <PageSkeleton label="Verificando tu sesión" />
  if (status === 'autenticado' && user)
    return <ActiveSessionNotice user={user} next={safeNext(params.get('next'))} />
  return children
}
