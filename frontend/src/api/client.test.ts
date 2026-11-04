import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { server } from '@/mocks/server'
import { API } from '@/mocks/handlers/utils'
import { get, refreshAccessToken, send, setAccessToken } from './client'
import { ApiError } from './errors'
import { loginResponseSchema, userSchema } from './schemas/auth'
import { tokenStorage } from './tokenStorage'

async function login() {
  const res = await send('post', '/auth/login', loginResponseSchema, {
    email: 'cliente@ejemplo.com',
    password: 'Taller123',
  })
  setAccessToken(res.access_token)
  tokenStorage.set(res.refresh_token)
  return res
}

describe('cliente de API y JWT', () => {
  it('manda el access token y lee /me', async () => {
    await login()
    const me = await get('/me', userSchema)
    expect(me.email).toBe('cliente@ejemplo.com')
  })

  it('ante un 401 renueva el token una sola vez y repite la petición', async () => {
    await login()
    setAccessToken('mock.u-cliente.1') // token vencido
    let refreshCalls = 0
    server.events.on('request:start', ({ request }) => {
      if (request.url.endsWith('/auth/refresh')) refreshCalls++
    })
    const [a, b] = await Promise.all([get('/me', userSchema), get('/me', userSchema)])
    expect(a.id).toBe('u-cliente')
    expect(b.id).toBe('u-cliente')
    expect(refreshCalls).toBe(1)
    server.events.removeAllListeners()
  })

  it('si el refresh falla, borra el token guardado y devuelve el 401', async () => {
    tokenStorage.set('rt.invalido')
    setAccessToken('mock.u-cliente.1')
    await expect(get('/me', userSchema)).rejects.toMatchObject({ status: 401 })
    expect(tokenStorage.get()).toBeNull()
    expect(await refreshAccessToken()).toBeNull()
  })

  it('convierte el 422 de FastAPI en errores por campo', async () => {
    const error = (await send('post', '/auth/register', z.unknown(), {
      name: '',
      email: 'x',
      password: '1234567',
    }).catch((e) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(422)
    expect(error.fieldErrors.password).toBe('Tu contraseña tiene 7 caracteres. Usa al menos 8.')
    expect(error.fieldErrors.privacy_accepted).toBeTruthy()
  })

  it('expone el código de negocio de la cuenta bloqueada (B4)', async () => {
    const error = (await send('post', '/auth/login', z.unknown(), {
      email: 'bloqueada@ejemplo.com',
      password: 'Taller123',
    }).catch((e) => e)) as ApiError
    expect(error).toMatchObject({ status: 423, code: 'account_locked' })
    expect(error.data.retry_after_s).toBeGreaterThan(0)
  })

  it('detecta respuestas fuera del contrato', async () => {
    server.use(http.get(`${API}/me`, () => HttpResponse.json({ id: 1 })))
    await expect(get('/me', userSchema)).rejects.toThrow()
  })
})
