// localStorage/sessionStorage pueden lanzar (modo privado, almacenamiento bloqueado): nunca rompen la app.

function safe(area: 'local' | 'session'): Storage | null {
  try {
    return area === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function readJson<T>(key: string, fallback: T, area: 'local' | 'session' = 'local'): T {
  try {
    const raw = safe(area)?.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown, area: 'local' | 'session' = 'local'): void {
  try {
    if (value === undefined || value === null) safe(area)?.removeItem(key)
    else safe(area)?.setItem(key, JSON.stringify(value))
  } catch {
    // sin almacenamiento: el valor solo vive en memoria
  }
}
