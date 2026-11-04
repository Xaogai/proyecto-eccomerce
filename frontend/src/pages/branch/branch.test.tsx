import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { tokenStorage } from '@/api/tokenStorage'
import { db } from '@/mocks/db/store'
import { issueRefreshToken } from '@/mocks/handlers/utils'
import { renderRoute } from '@/test/render'

const asStaff = () => tokenStorage.set(issueRefreshToken('u-staff'))
const stockOf = (sku: string) =>
  db.products.flatMap((p) => p.variants).find((v) => v.sku === sku)!.stock['toluca-centro']

describe('Inventario (pantalla 57)', () => {
  it('el ajuste pide motivo y suma al stock de la sucursal', async () => {
    asStaff()
    const before = stockOf('100245-0')
    renderRoute('/sucursal/inventario?q=100245-0')
    const row = await screen.findByRole('row', { name: /100245-0/ }, { timeout: 5000 })
    fireEvent.click(within(row).getByRole('button', { name: 'Sumar una pieza' }))
    expect(within(row).getByText('+1')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: /^Guardar ajuste/ }))
    expect(within(row).getByRole('alert')).toHaveTextContent('Elige el motivo.')
    fireEvent.change(within(row).getByRole('combobox', { name: /^Motivo del ajuste/ }), {
      target: { value: 'conteo' },
    })
    fireEvent.click(within(row).getByRole('button', { name: /^Guardar ajuste/ }))
    await waitFor(() => expect(stockOf('100245-0')).toBe(before + 1))
    expect(await screen.findByText(/Guardamos el ajuste de .*: \+1 pieza\./)).toBeInTheDocument()
  })

  it('no deja restar por debajo de lo apartado', async () => {
    asStaff()
    // 100245-1 está apartado por el pedido 10482 (listo para recoger)
    const variant = db.products.flatMap((p) => p.variants).find((v) => v.sku === '100245-1')!
    variant.stock['toluca-centro'] = 1
    renderRoute('/sucursal/inventario?q=100245-1')
    const row = await screen.findByRole('row', { name: /100245-1/ }, { timeout: 5000 })
    expect(within(row).getByRole('button', { name: 'Restar una pieza' })).toBeDisabled()
  })
})

describe('Pedidos para recoger (pantalla 58)', () => {
  it('marca el atrasado con texto, no solo con color', async () => {
    asStaff()
    renderRoute('/sucursal/recoleccion')
    const late = (
      await screen.findByRole('heading', { level: 3, name: 'Pedido 10380' }, { timeout: 5000 })
    ).closest('article')!
    expect(within(late).getByText('Atrasado')).toBeInTheDocument()
    expect(within(late).getByText(/Pagado hace 1 h/)).toBeInTheDocument()
  })

  it('solo avanza: pagado → en preparación → listo', async () => {
    asStaff()
    renderRoute('/sucursal/recoleccion')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Empezar a preparar el pedido 10381' }, { timeout: 5000 }),
    )
    await waitFor(() => expect(db.orders.find((o) => o.id === '10381')!.status).toBe('en_preparacion'))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Marcar listo y avisar al cliente, pedido 10381' }),
    )
    await waitFor(() => expect(db.orders.find((o) => o.id === '10381')!.status).toBe('listo_para_recoger'))
    expect(await screen.findByText(/^Pedido 10381 listo. Enviamos aviso a /)).toBeInTheDocument()
  })
})

describe('Entregar pedido (pantalla 59)', () => {
  it('sin el código correcto no hay entrega; con él y la revisión, se entrega', async () => {
    asStaff()
    renderRoute('/sucursal/entrega')
    const code = await screen.findByLabelText('Código de entrega del cliente', {}, { timeout: 5000 })
    fireEvent.change(code, { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar pedido' }))
    expect(await screen.findByText('Escribe los 4 dígitos del código.')).toBeInTheDocument()

    fireEvent.change(code, { target: { value: '4821' } })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar pedido' }))
    const heading = await screen.findByRole('heading', { level: 2, name: 'Pedido 10482 · Ana López' })
    await waitFor(() => expect(heading).toHaveFocus())

    fireEvent.click(screen.getByLabelText(/El nombre coincide/))
    fireEvent.click(screen.getByLabelText('El cliente revisó los productos'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }))
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Pedido 10482 entregado' }),
    ).toBeInTheDocument()
    expect(db.orders.find((o) => o.id === '10482')!.status).toBe('entregado')
  })

  it('el staff de otra sucursal no encuentra el pedido', async () => {
    tokenStorage.set(issueRefreshToken('u-staff2'))
    renderRoute('/sucursal/entrega')
    fireEvent.change(await screen.findByLabelText('Código de entrega del cliente', {}, { timeout: 5000 }), {
      target: { value: '4821' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar pedido' }))
    expect(
      await screen.findByText(/No hay pedidos listos con ese código en esta sucursal/),
    ).toBeInTheDocument()
  })
})
