import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

export function startMocks() {
  return worker.start({
    // Solo avisa de peticiones a la API sin handler; fuentes, imágenes y módulos de Vite pasan sin ruido.
    onUnhandledRequest(request, print) {
      if (new URL(request.url).pathname.startsWith('/api/')) print.warning()
    },
  })
}
