// Único lugar que sabe dónde vive el refresh token (T-02 en docs/api/endpoints-propuestos.md).
//
// AHORA (datos simulados): sessionStorage. Dura lo que la pestaña.
// FASE 7 (backend real): el servidor lo manda en una cookie HttpOnly; Secure; SameSite=Strict.
//   Entonces: USES_COOKIE = true, get() devuelve null y set()/clear() no hacen nada.
//   El resto del código no cambia.

import { readJson, writeJson } from '@/lib/storage'

const KEY = 'taller.rt'

/** Cambiar a true al conectar con el backend real (fase 7). */
export const USES_COOKIE = false

export const tokenStorage = {
  get(): string | null {
    return USES_COOKIE ? null : readJson<string | null>(KEY, null, 'session')
  },
  set(token: string | undefined): void {
    if (!USES_COOKIE && token) writeJson(KEY, token, 'session')
  },
  clear(): void {
    if (!USES_COOKIE) writeJson(KEY, null, 'session')
  },
  /** ¿Vale la pena intentar un refresh al cargar la app? */
  hasSession(): boolean {
    return USES_COOKIE || this.get() !== null
  },
}
