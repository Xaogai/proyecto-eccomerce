import { accountHandlers } from './account'
import { adminHandlers } from './admin'
import { branchHandlers } from './branch'
import { authHandlers } from './auth'
import { cartHandlers } from './cart'
import { catalogHandlers } from './catalog'
import { checkoutHandlers } from './checkout'
import { storeHandlers } from './stores'

export const handlers = [
  ...authHandlers,
  ...catalogHandlers,
  ...storeHandlers,
  ...cartHandlers,
  ...checkoutHandlers,
  ...accountHandlers,
  ...adminHandlers,
  ...branchHandlers,
]
