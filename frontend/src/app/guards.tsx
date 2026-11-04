import type { ReactNode } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import type { Role } from '@/api/schemas/auth'
import { PageSkeleton } from '@/components/feedback/States'
import { homeFor, safeNext } from '@/features/account/session'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import { useAuth } from './providers/authContext'

/** Pide sesión. Mientras se renueva el token muestra un skeleton (no redirige antes de saber). */
export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { status, hasRole } = useAuth()
  const location = useLocation()

  if (status === 'cargando') return <PageSkeleton label="Verificando tu sesión" />
  if (status === 'anonimo') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/cuenta/login?next=${next}`} replace />
  }
  // Solo UX: la autorización real la hace el backend.
  if (roles && !hasRole(...roles)) return <ForbiddenPage />
  return children
}

/** Login y registro: si ya hay sesión, a Mi cuenta. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()
  const [params] = useSearchParams()
  if (status === 'cargando') return <PageSkeleton />
  if (status === 'autenticado' && user)
    return <Navigate to={safeNext(params.get('next')) ?? homeFor(user)} replace />
  return children
}
