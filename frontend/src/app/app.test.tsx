import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '@/test/render'
import { tokenStorage } from '@/api/tokenStorage'
import { issueRefreshToken } from '@/mocks/handlers/utils'

describe('app', () => {
  it('pinta encabezado, departamentos del API y pie (G1)', async () => {
    renderRoute('/')
    const nav = await screen.findByRole('navigation', { name: 'Categorías' })
    expect(await within(nav).findByRole('link', { name: 'Herramientas' })).toHaveAttribute('href', '/categoria/herramientas')
    expect(screen.getByRole('link', { name: 'Carrito, 0 productos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Aviso de privacidad' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#contenido')
  })

  it('marca el departamento de la categoría actual', async () => {
    renderRoute('/categoria/taladros')
    const nav = await screen.findByRole('navigation', { name: 'Categorías' })
    await waitFor(() => expect(within(nav).getByRole('link', { name: 'Herramientas' })).toHaveAttribute('aria-current', 'page'))
  })

  it('manda a login con ?next= si no hay sesión', async () => {
    const { router } = renderRoute('/cuenta/pedidos')
    await waitFor(() => expect(router.state.location.pathname).toBe('/cuenta/login'))
    expect(router.state.location.search).toBe('?next=%2Fcuenta%2Fpedidos')
  })

  it('recupera la sesión con el refresh token guardado', async () => {
    tokenStorage.set(issueRefreshToken('u-cliente'))
    renderRoute('/cuenta')
    expect(await screen.findByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Mi cuenta' })).toBeInTheDocument()
  })

  it('un cliente no entra al admin (403)', async () => {
    tokenStorage.set(issueRefreshToken('u-cliente'))
    renderRoute('/admin')
    expect(await screen.findByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeInTheDocument()
  })

  it('el admin ve su panel con navegación de 7 secciones', async () => {
    tokenStorage.set(issueRefreshToken('u-admin'))
    renderRoute('/admin')
    const nav = await screen.findByRole('navigation', { name: 'Administración' })
    expect(within(nav).getAllByRole('link')).toHaveLength(7)
    expect(screen.getByText('Luis Ramírez · Administrador')).toBeInTheDocument()
  })

  it('ruta desconocida muestra 404 dentro del layout', async () => {
    renderRoute('/no-existe')
    expect(await screen.findByRole('heading', { name: 'No encontramos esta página' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })
})
