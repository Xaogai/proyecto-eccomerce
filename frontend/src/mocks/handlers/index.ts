import { authHandlers } from './auth'
import { cartHandlers } from './cart'
import { catalogHandlers } from './catalog'
import { storeHandlers } from './stores'

export const handlers = [...authHandlers, ...catalogHandlers, ...storeHandlers, ...cartHandlers]
