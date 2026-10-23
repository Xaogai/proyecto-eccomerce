// Único lugar que sabe dónde vive el refresh token (T-02 en docs/api/endpoints-propuestos.md).
//
// AHORA (datos simulados): sessionStorage (dura lo que la pestaña) o localStorage si la persona
// marcó "Mantener mi sesión en este dispositivo".
// FASE 7 (backend real): el servidor lo manda en una cookie HttpOnly; Secure; SameSite=Strict
//   (con Max-Age largo si se pidió mantener la sesión). Entonces: USES_COOKIE = true, get()
//   devuelve null y set()/clear() no hacen nada. El resto del código no cambia.

import { readJson, writeJson } from '@/lib/storage'

const KEY = 'taller.rt'

/** Cambiar a true al conectar con el backend real (fase 7). */
export const USES_COOKIE = false

const where = (): 'session' | 'local' | null =>
  readJson<string | null>(KEY, null, 'session')
    ? 'session'
    : readJson<string | null>(KEY, null, 'local')
      ? 'local'
      : null

export const tokenStorage = {
  get(): string | null {
    if (USES_COOKIE) return null
    return readJson<string | null>(KEY, null, 'session') ?? readJson<string | null>(KEY, null, 'local')
  },
  /**
   * Guarda el token. `remember` solo se indica al iniciar sesión; al renovar (rotación)
   * el token nuevo se guarda donde estaba el anterior.
   */
  set(token: string | undefined, remember?: boolean): void {
    if (USES_COOKIE || !token) return
    const area = remember === undefined ? (where() ?? 'session') : remember ? 'local' : 'session'
    this.clear()
    writeJson(KEY, token, area)
  },
  clear(): void {
    if (USES_COOKIE) return
    writeJson(KEY, null, 'session')
    writeJson(KEY, null, 'local')
  },
  /** ¿Vale la pena intentar un refresh al cargar la app? */
  hasSession(): boolean {
    return USES_COOKIE || this.get() !== null
  },
}
