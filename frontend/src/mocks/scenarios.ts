// Escenarios forzados (sustituyen los "Tweaks" de los prototipos).
// En el navegador: ?mock=error en la URL o el MockPanel (se guarda en localStorage).
// En pruebas: setScenario('error').
import { delay, HttpResponse } from 'msw'

export const SCENARIOS = {
  normal: 'Normal',
  slow: 'Lento (2 s, para ver los skeletons)',
  empty: 'Sin resultados',
  error: 'Error del servidor (500)',
  offline: 'Sin conexión',
  queue: 'Fila de espera en checkout',
  'pago-rechazado': 'Pago rechazado',
} as const

export type Scenario = keyof typeof SCENARIOS

const KEY = 'taller.mock'
let override: Scenario | null = null

export function setScenario(s: Scenario | null) {
  override = s
}

export function getScenario(): Scenario {
  if (override) return override
  if (typeof window === 'undefined') return 'normal'
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('mock')
    if (fromUrl && fromUrl in SCENARIOS) {
      window.localStorage.setItem(KEY, fromUrl)
      return fromUrl as Scenario
    }
    const stored = window.localStorage.getItem(KEY)
    return stored && stored in SCENARIOS ? (stored as Scenario) : 'normal'
  } catch {
    return 'normal'
  }
}

export function storeScenario(s: Scenario) {
  try {
    if (s === 'normal') window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, s)
  } catch {
    // sin almacenamiento
  }
}

/**
 * Aplica el escenario general a una petición. Devuelve una respuesta si el escenario
 * la "secuestra" (error, sin conexión) o undefined para seguir normal.
 * Los escenarios "empty", "queue" y "pago-rechazado" los revisa cada handler.
 */
export async function applyScenario(): Promise<Response | undefined> {
  const s = getScenario()
  // En el navegador se simula la latencia de red; en las pruebas no, para que corran rápido.
  const browser = typeof window !== 'undefined' && import.meta.env.MODE !== 'test'
  if (s === 'slow') await delay(2000)
  else if (browser) await delay(250)
  if (s === 'error') {
    return HttpResponse.json({ detail: { code: 'server_error', message: 'Error simulado del servidor.' } }, { status: 500 })
  }
  if (s === 'offline') return HttpResponse.error()
  return undefined
}
