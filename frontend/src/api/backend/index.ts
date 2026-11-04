// Rutas del contrato que se resuelven contra el backend real. Cada archivo cubre un grupo de EP.
import { catalogRoutes } from './catalog'
import { bget } from './http'
import { register } from './router'

register(catalogRoutes)
register([{ method: 'get', path: '/feature-flags', handle: () => bget('/funciones') }])

export { translate } from './router'
