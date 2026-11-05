// Único lugar que sabe dónde vive el refresh token (tema T-02 del contrato de API).
//
// Backend real: el servidor lo manda en una cookie HttpOnly (el JavaScript no puede leerlo). Aquí solo
// queda una marca de que hay sesión, para no intentar renovarla en cada visita de un invitado.
// Datos simulados: sessionStorage, o localStorage si se marcó "Mantener mi sesión en este dispositivo".

import { readJson, writeJson } from '@/lib/storage'

const KEY = 'taller.rt'
const MARK = 'cookie'

export const USES_COOKIE =
  import.meta.env.MODE !== 'mock' && import.meta.env.MODE !== 'test' && import.meta.env.VITE_MOCKS !== 'true'

const read = (area: 'session' | 'local') => readJson<string | null>(KEY, null, area)

const where = (): 'session' | 'local' | null => (read('session') ? 'session' : read('local') ? 'local' : null)

export const tokenStorage = {
  get(): string | null {
    if (USES_COOKIE) return null
    return read('session') ?? read('local')
  },
  /**
   * Guarda el token (o la marca de sesión). `remember` solo se indica al iniciar sesión; al renovar
   * el valor nuevo se guarda donde estaba el anterior.
   */
  set(token: string | undefined, remember?: boolean): void {
    if (!token && !USES_COOKIE) return
    const area = remember === undefined ? (where() ?? 'session') : remember ? 'local' : 'session'
    this.clear()
    writeJson(KEY, USES_COOKIE ? MARK : token, area)
  },
  clear(): void {
    writeJson(KEY, null, 'session')
    writeJson(KEY, null, 'local')
  },
  /** ¿Vale la pena intentar un refresh al cargar la app? */
  hasSession(): boolean {
    return where() !== null
  },
}
