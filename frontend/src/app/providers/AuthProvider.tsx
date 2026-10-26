import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { CART_ID_KEY, get, onSessionExpired, refreshAccessToken, send, setAccessToken } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { type LoginResponse, loginResponseSchema, type Role, type User, userSchema } from '@/api/schemas/auth'
import { tokenStorage } from '@/api/tokenStorage'
import { readJson, writeJson } from '@/lib/storage'
import { z } from 'zod'
import { AuthContext, type AuthContextValue, type RegisterInput } from './authContext'

type State = { status: AuthContextValue['status']; user: User | null }

/**
 * Sesión de la persona: iniciar y cerrar sesión, registro y renovación silenciosa del JWT al cargar
 * (sec. 18.1). Si el refresh falla en cualquier petición, cierra la sesión y borra los datos privados
 * de la caché. Se lee con el hook de `authContext`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<State>(() =>
    tokenStorage.hasSession() ? { status: 'cargando', user: null } : { status: 'anonimo', user: null },
  )

  const endSession = useCallback(() => {
    setAccessToken(null)
    tokenStorage.clear()
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'catalog' })
    setState({ status: 'anonimo', user: null })
  }, [queryClient])

  // Al cargar: refresh silencioso si había sesión (paso 5 de la sec. 4.3 del plan).
  useEffect(() => {
    if (!tokenStorage.hasSession()) return
    let cancelled = false
    refreshAccessToken()
      .then((token) => (token ? get(endpoints.me, userSchema) : null))
      .then((user) => {
        if (!cancelled) setState(user ? { status: 'autenticado', user } : { status: 'anonimo', user: null })
      })
      .catch(() => !cancelled && setState({ status: 'anonimo', user: null }))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => onSessionExpired(endSession), [endSession])

  const startSession = useCallback(
    async (res: LoginResponse, remember = false) => {
      setAccessToken(res.access_token)
      tokenStorage.set(res.refresh_token, remember)
      // EP-14: lo que el invitado puso en su carrito pasa al carrito de la cuenta.
      const guestCart = readJson<string | null>(CART_ID_KEY, null)
      if (guestCart) {
        try {
          await send('post', endpoints.cartMerge, z.unknown(), { guest_cart_id: guestCart })
        } catch {
          // si falla, el carrito de la cuenta sigue intacto
        }
        writeJson(CART_ID_KEY, null)
      }
      setState({ status: 'autenticado', user: res.user })
      // El carrito y los datos de cuenta cambian al entrar.
      void queryClient.invalidateQueries({ queryKey: ['cart'] })
      return res.user
    },
    [queryClient],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login: async (email, password, remember) =>
        startSession(await send('post', endpoints.login, loginResponseSchema, { email, password }), remember),
      register: async (input: RegisterInput) =>
        startSession(await send('post', endpoints.register, loginResponseSchema, input)),
      logout: async () => {
        try {
          await send('post', endpoints.logout, z.unknown(), { refresh_token: tokenStorage.get() })
        } catch {
          // aunque falle, la sesión se cierra en el cliente
        }
        endSession()
      },
      updateUser: (patch) => setState((s) => (s.user ? { ...s, user: { ...s.user, ...patch } } : s)),
      hasRole: (...roles: Role[]) => state.user !== null && roles.includes(state.user.role),
    }),
    [state, startSession, endSession],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
