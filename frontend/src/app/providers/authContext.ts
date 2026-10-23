import { createContext, useContext } from 'react'
import type { Role, User } from '@/api/schemas/auth'

export interface RegisterInput {
  name: string
  email: string
  password: string
  privacy_accepted: boolean
  marketing_opt_in: boolean
}

export interface AuthContextValue {
  status: 'cargando' | 'anonimo' | 'autenticado'
  user: User | null
  /** remember: "Mantener mi sesión en este dispositivo" */
  login: (email: string, password: string, remember?: boolean) => Promise<User>
  register: (input: RegisterInput) => Promise<User>
  logout: () => Promise<void>
  /** Refleja cambios del perfil (nombre) sin volver a pedir /me */
  updateUser: (patch: Partial<User>) => void
  hasRole: (...roles: Role[]) => boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
