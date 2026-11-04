// Rutas del contrato que se resuelven contra el backend real. Cada archivo cubre un grupo de EP.
import { accountRoutes } from './account'
import { authRoutes } from './auth'
import { catalogRoutes } from './catalog'
import { bget } from './http'
import { orderRoutes } from './orders'
import { register } from './router'

register(catalogRoutes)
register(authRoutes)
register(orderRoutes)
register(accountRoutes)
register([{ method: 'get', path: '/feature-flags', handle: () => bget('/funciones') }])

export { translate } from './router'
