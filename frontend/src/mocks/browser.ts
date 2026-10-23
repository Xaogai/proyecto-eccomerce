import { setupWorker } from 'msw/browser'
import { exportDb, importDb } from './db/store'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

const KEY = 'taller.mock-db'

export function startMocks() {
  try {
    const saved = sessionStorage.getItem(KEY)
    if (saved) importDb(saved)
  } catch {
    // datos guardados ilegibles: se empieza desde la semilla
  }
  // Guarda la "base de datos" después de cada respuesta simulada.
  worker.events.on('response:mocked', () => {
    try {
      sessionStorage.setItem(KEY, exportDb())
    } catch {
      // sin almacenamiento: los datos solo viven hasta recargar
    }
  })
  return worker.start({
    // Solo avisa de peticiones a la API sin handler; fuentes, imágenes y módulos de Vite pasan sin ruido.
    onUnhandledRequest(request, print) {
      if (new URL(request.url).pathname.startsWith('/api/')) print.warning()
    },
  })
}
