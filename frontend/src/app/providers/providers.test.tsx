import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { get, refreshAccessToken, setAccessToken } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { userSchema } from '@/api/schemas/auth'
import { tokenStorage } from '@/api/tokenStorage'
import { readJson } from '@/lib/storage'
import { renderWithProviders } from '@/test/render'
import { useAuth } from './authContext'
import { useSelectedStore } from './storeContext'

function Session() {
  const auth = useAuth()
  return (
    <>
      <p>Estado: {auth.status}</p>
      <button onClick={() => void auth.login('cliente@ejemplo.com', 'Taller123')}>Entrar</button>
      <button onClick={() => void auth.logout()}>Salir</button>
      <button onClick={() => void get(endpoints.me, userSchema).catch(() => {})}>Pedir mis datos</button>
    </>
  )
}

function Store() {
  const { store, openPicker } = useSelectedStore()
  return (
    <>
      <p>Sucursal: {store?.name ?? 'ninguna'}</p>
      <button onClick={openPicker}>Cambiar sucursal</button>
    </>
  )
}

async function loggedIn() {
  renderWithProviders(<Session />)
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
  await screen.findByText('Estado: autenticado')
}

describe('sesión (sec. 18.1)', () => {
  it('cerrar sesión invalida el refresh token en el servidor y lo borra del navegador', async () => {
    await loggedIn()
    const refreshToken = tokenStorage.get()
    expect(refreshToken).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Salir' }))
    await screen.findByText('Estado: anonimo')
    expect(tokenStorage.get()).toBeNull()

    // Un token robado antes de salir ya no sirve.
    tokenStorage.set(refreshToken!)
    expect(await refreshAccessToken()).toBeNull()
  })

  it('si la sesión vence y no se puede renovar, la cierra', async () => {
    await loggedIn()
    setAccessToken('mock.u-cliente.1') // access token vencido
    tokenStorage.set('rt.invalido')
    fireEvent.click(screen.getByRole('button', { name: 'Pedir mis datos' }))
    await screen.findByText('Estado: anonimo')
  })
})

describe('sucursal elegida', () => {
  it('se elige en el diálogo y se recuerda en el navegador', async () => {
    renderWithProviders(<Store />)
    expect(screen.getByText('Sucursal: ninguna')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar sucursal' }))
    const dialog = await screen.findByRole('dialog', { name: 'Elige tu sucursal' })
    const [first] = await within(dialog).findAllByRole('radio')
    fireEvent.click(first)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(screen.queryByText('Sucursal: ninguna')).not.toBeInTheDocument())
    expect(readJson<{ id: string } | null>('taller.sucursal', null)?.id).toBe(first.getAttribute('value'))
  })
})
