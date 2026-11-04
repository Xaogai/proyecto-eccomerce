import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { tokenStorage } from '@/api/tokenStorage'
import { db } from '@/mocks/db/store'
import { issueRefreshToken } from '@/mocks/handlers/utils'
import { renderRoute } from '@/test/render'

const asAdmin = () => tokenStorage.set(issueRefreshToken('u-admin'))

describe('acceso al panel', () => {
  it('el cliente no ve el admin', async () => {
    tokenStorage.set(issueRefreshToken('u-cliente'))
    renderRoute('/admin')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'No tienes acceso a esta sección' }),
    ).toBeInTheDocument()
  })
})

describe('Resumen (pantalla 48)', () => {
  it('indicadores con enlace y gráfica con resumen y vista de tabla', async () => {
    asAdmin()
    renderRoute('/admin')
    const kpi = await screen.findByRole('link', { name: /Por preparar/ })
    expect(kpi).toHaveAttribute('href', '/admin/pedidos?estado=prep')
    expect(screen.getByRole('img', { name: /^Ventas por día: .*Hoy \$/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver como tabla' }))
    expect(screen.getByRole('button', { name: 'Ver como tabla' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('table', { name: 'Ventas por día' })).getAllByRole('row')).toHaveLength(8)
  })
})

describe('Productos (pantallas 49 y 50)', () => {
  it('filtra por estado desde la URL', async () => {
    asAdmin()
    renderRoute('/admin/productos?estado=borrador')
    expect(await screen.findByRole('link', { name: 'Taladro magnético 1,100 W' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Borradores/ })).toHaveAttribute('aria-pressed', 'true')
    const rows = within(screen.getByRole('table', { name: 'Productos' }))
      .getAllByRole('row')
      .slice(1)
    for (const row of rows) expect(row).toHaveTextContent('Borrador')
  })

  it('I2: avisa que no se puede publicar sin variante con precio y stock', async () => {
    asAdmin()
    renderRoute('/admin/productos/400118')
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No puedes publicar')
    expect(db.products.find((p) => p.sku === '400118')!.status).toBe('borrador')
  })

  it('valida los campos obligatorios', async () => {
    asAdmin()
    renderRoute('/admin/productos/nuevo')
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar borrador' }))
    expect(await screen.findByText('Escribe el nombre del producto.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Nombre del producto/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Elige una categoría.')).toBeInTheDocument()
  })
})

describe('Pedidos (pantallas 52 y 53)', () => {
  it('solo ofrece las transiciones permitidas y registra el cambio (I3)', async () => {
    asAdmin()
    renderRoute('/admin/pedidos/10482')
    const select = await screen.findByLabelText('Nuevo estado')
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['Elige un estado', 'Entregado', 'Cancelado', 'Incidencia'])
    fireEvent.change(select, { target: { value: 'entregado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(db.orders.find((o) => o.id === '10482')!.status).toBe('entregado'))
    // Desde "Entregado" solo queda reembolsar.
    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Nuevo estado'))
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Elige un estado', 'Reembolsado']),
    )
  })

  it('cancelar pide confirmación', async () => {
    asAdmin()
    renderRoute('/admin/pedidos/10482')
    fireEvent.change(await screen.findByLabelText('Nuevo estado'), { target: { value: 'cancelado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(await screen.findByText(/¿Pasar el pedido a "Cancelado"\?/)).toBeInTheDocument()
    expect(db.orders.find((o) => o.id === '10482')!.status).toBe('listo_para_recoger')
    fireEvent.click(screen.getByRole('button', { name: 'Sí, cambiar' }))
    await waitFor(() => expect(db.orders.find((o) => o.id === '10482')!.status).toBe('cancelado'))
  })
})

describe('Usuarios y Configuración (pantallas 54 y 56)', () => {
  it('no se puede cambiar el propio rol', async () => {
    asAdmin()
    renderRoute('/admin/usuarios')
    expect(await screen.findByLabelText('Rol de Luis Ramírez')).toBeDisabled()
    expect(screen.getByLabelText('Rol de Ana López')).toBeEnabled()
  })

  it('apagar una función actualiza las banderas', async () => {
    asAdmin()
    renderRoute('/admin/configuracion')
    const toggle = await screen.findByRole('switch', { name: 'Calculadora de materiales' })
    fireEvent.click(toggle)
    await waitFor(() => expect(db.featureFlags.calc).toBe(false))
    expect(screen.getByText(/pk_…1234/)).toBeInTheDocument()
  })
})
