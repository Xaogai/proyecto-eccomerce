import axios from 'axios'

/** Error normalizado de la API (convención de errores del contrato). */
export class ApiError extends Error {
  readonly status: number
  /** Código de negocio estable: account_locked, invalid_transition, out_of_stock… */
  readonly code: string | null
  /** Errores por campo de un 422 de FastAPI: { email: 'Correo no válido' } */
  readonly fieldErrors: Record<string, string>
  /** Datos extra del error (p. ej. retry_after_s de account_locked) */
  readonly data: Record<string, unknown>

  constructor(
    status: number,
    message: string,
    code: string | null = null,
    fieldErrors: Record<string, string> = {},
    data: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.data = data
  }

  get isNetwork() {
    return this.status === 0
  }
}

interface FastApiValidationItem {
  loc: Array<string | number>
  msg: string
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (!axios.isAxiosError(error)) return new ApiError(0, 'Ocurrió un error inesperado.')
  if (!error.response) return new ApiError(0, 'No pudimos conectar. Revisa tu conexión e intenta de nuevo.')

  const { status, data } = error.response
  const detail = (data as { detail?: unknown } | undefined)?.detail

  if (Array.isArray(detail)) {
    const fieldErrors: Record<string, string> = {}
    for (const item of detail as FastApiValidationItem[]) {
      // loc: ["body", "email"] → "email"; ["body", "address", "zip"] → "address.zip"
      const path = item.loc.filter((p) => p !== 'body' && p !== 'query').join('.')
      if (path && !fieldErrors[path]) fieldErrors[path] = item.msg
    }
    return new ApiError(status, 'Revisa los campos marcados.', 'validation_error', fieldErrors)
  }

  if (detail && typeof detail === 'object') {
    const { code, message, ...rest } = detail as { code?: string; message?: string }
    return new ApiError(status, message ?? defaultMessage(status), code ?? null, {}, rest)
  }

  return new ApiError(status, typeof detail === 'string' ? detail : defaultMessage(status))
}

function defaultMessage(status: number): string {
  if (status === 401) return 'Tu sesión terminó. Inicia sesión de nuevo.'
  if (status === 403) return 'No tienes permiso para hacer esto.'
  if (status === 404) return 'No encontramos lo que buscas.'
  if (status >= 500) return 'Tuvimos un problema de nuestro lado. Intenta de nuevo en un momento.'
  return 'No pudimos completar la acción.'
}
