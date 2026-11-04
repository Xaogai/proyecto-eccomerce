import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { setAccessToken } from '@/api/client'
import { resetDb } from '@/mocks/db/store'
import { setScenario } from '@/mocks/scenarios'
import { server } from '@/mocks/server'
import { setViewport } from './viewport'

// <dialog> no está completo en jsdom.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open')
}

setViewport('movil')

// Con la cobertura activa (npm run coverage, CI) todo corre más lento: 1 s de findBy no alcanza.
configure({ asyncUtilTimeout: 3000 })

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetDb()
  setScenario(null)
  setAccessToken(null)
  window.localStorage.clear()
  window.sessionStorage.clear()
  setViewport('movil')
})
afterAll(() => server.close())
