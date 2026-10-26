import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { describe, expect, it } from 'vitest'
import { ApiError, toApiError } from './errors'

/** Error de axios con la respuesta que mandaría el backend. */
function httpError(status: number, data?: unknown) {
  const config = { headers: new AxiosHeaders() }
  const response = { status, data, statusText: '', headers: {}, config } as AxiosResponse
  return new AxiosError('fallo', 'ERR_BAD_RESPONSE', config, null, response)
}

describe('errores de la API', () => {
  it('deja pasar un ApiError tal cual', () => {
    const e = new ApiError(409, 'Sin stock', 'out_of_stock')
    expect(toApiError(e)).toBe(e)
  })

  it('un error que no es de axios es un error inesperado de red', () => {
    const e = toApiError(new Error('x'))
    expect(e.status).toBe(0)
    expect(e.isNetwork).toBe(true)
  })

  it('sin respuesta del servidor pide revisar la conexión', () => {
    const e = toApiError(new AxiosError('Network Error', 'ERR_NETWORK'))
    expect(e.isNetwork).toBe(true)
    expect(e.message).toMatch(/Revisa tu conexión/)
  })

  it('un 422 anidado guarda el error del primer mensaje por campo', () => {
    const e = toApiError(
      httpError(422, {
        detail: [
          { loc: ['body', 'address', 'zip'], msg: 'CP inválido' },
          { loc: ['body', 'address', 'zip'], msg: 'otro mensaje' },
          { loc: ['query', 'page'], msg: 'Número' },
        ],
      }),
    )
    expect(e.code).toBe('validation_error')
    expect(e.fieldErrors).toEqual({ 'address.zip': 'CP inválido', page: 'Número' })
  })

  it('lee el código de negocio y los datos extra', () => {
    const e = toApiError(
      httpError(423, { detail: { code: 'account_locked', message: 'Cuenta bloqueada', retry_after_s: 900 } }),
    )
    expect(e).toMatchObject({ status: 423, code: 'account_locked', message: 'Cuenta bloqueada' })
    expect(e.data).toEqual({ retry_after_s: 900 })
  })

  it('usa el texto del backend o un mensaje según el estado', () => {
    expect(toApiError(httpError(400, { detail: 'Cupón vencido' })).message).toBe('Cupón vencido')
    expect(toApiError(httpError(401)).message).toMatch(/Inicia sesión/)
    expect(toApiError(httpError(403)).message).toMatch(/permiso/)
    expect(toApiError(httpError(404)).message).toMatch(/No encontramos/)
    expect(toApiError(httpError(503)).message).toMatch(/nuestro lado/)
    expect(toApiError(httpError(409, { detail: {} })).message).toBe('No pudimos completar la acción.')
  })
})
