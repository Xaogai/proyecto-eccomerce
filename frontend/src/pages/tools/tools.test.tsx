import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { compareStore } from '@/features/compare/store'
import { db } from '@/mocks/db/store'
import { renderRoute } from '@/test/render'
import { setViewport } from '@/test/viewport'

const chooseToluca = () =>
  window.localStorage.setItem(
    'taller.sucursal',
    JSON.stringify({ id: 'toluca-centro', name: 'Toluca Centro', zip: '50000' }),
  )

describe('comparador (A8)', () => {
  it('desde el listado: marcar 2 productos y comparar', async () => {
    compareStore.reload()
    setViewport('escritorio')
    const { router } = renderRoute('/categoria/taladros?sort=precio_asc')
    const cards = await screen.findAllByRole('article')
    fireEvent.click(within(cards[0]).getByRole('checkbox', { name: /^Comparar/ }))
    fireEvent.click(within(cards[1]).getByRole('checkbox', { name: /^Comparar/ }))
    const bar = await screen.findByRole('region', { name: 'Productos para comparar' })
    expect(bar).toHaveTextContent('Comparar 2 de 4')
    fireEvent.click(within(bar).getByRole('link', { name: 'Comparar ahora' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/comparar'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Comparar 2 productos' })).toBeInTheDocument()
    compareStore.clear()
  })

  it('tabla accesible con encabezados de fila y columna, y "solo diferencias"', async () => {
    chooseToluca()
    renderRoute('/comparar?skus=100245,200118,300077')
    const table = await screen.findByRole('table', { name: /Comparación de especificaciones de 3 productos/ })
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3)
    expect(within(table).getByRole('rowheader', { name: /^Marca/ })).toBeInTheDocument()
    const before = within(table).getAllByRole('row').length
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar solo diferencias' }))
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeLessThan(before))
    expect(
      within(table)
        .getAllByRole('rowheader')
        .every((th) => th.textContent?.includes('(diferente)')),
    ).toBe(true)
    compareStore.clear()
  })

  it('no deja agregar más de 4', async () => {
    compareStore.clear()
    ;['a', 'b', 'c', 'd'].forEach((sku) => compareStore.add({ sku, name: sku }))
    expect(compareStore.add({ sku: 'e', name: 'e' })).toBe(false)
    compareStore.clear()
  })
})

describe('vista 360° (A9)', () => {
  it('apagada por la bandera: no aparece el botón', async () => {
    renderRoute('/producto/100245')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('button', { name: 'Vista 360°' })).toBeNull()
  })

  it('encendida: gira con la barra y anuncia el ángulo', async () => {
    db.featureFlags.v360 = true
    renderRoute('/producto/100245')
    fireEvent.click(await screen.findByRole('button', { name: 'Vista 360°' }))
    const dialog = await screen.findByRole('dialog')
    const slider = within(dialog).getByRole('slider', { name: 'Ángulo de giro' })
    expect(slider).toHaveAttribute('aria-valuetext', '45 grados')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Girar a la derecha' }))
    expect(within(dialog).getByText('Vista a 60°')).toBeInTheDocument()
    fireEvent.change(slider, { target: { value: '180' } })
    expect(within(dialog).getByText('Vista a 180°')).toBeInTheDocument()
  })
})

describe('calculadora (A10)', () => {
  it('pintura con los valores del prototipo y errores accesibles', async () => {
    renderRoute('/calculadora')
    expect(await screen.findByText('2 galones de 4 L')).toBeInTheDocument()
    const width = screen.getByLabelText('Ancho de cada muro (m)')
    fireEvent.change(width, { target: { value: '' } })
    expect(width).toHaveAttribute('aria-invalid', 'true')
    expect(width).toHaveAccessibleDescription('Este campo es obligatorio.')
    expect(screen.getByText('Corrige los campos marcados para ver el resultado.')).toBeInTheDocument()
  })

  it('la pestaña vive en la URL', async () => {
    const { router } = renderRoute('/calculadora/piso')
    expect(await screen.findByRole('tab', { name: 'Piso y azulejo' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('10 cajas de piso y 3 sacos de pegazulejo de 20 kg')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Taquetes y tornillos' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/calculadora/taquetes'))
  })

  it('agrega la pintura sugerida al carrito', async () => {
    renderRoute('/calculadora')
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar pintura sugerida al carrito' }))
    expect(await screen.findByRole('link', { name: /^Carrito 2 productos/ })).toBeInTheDocument()
  })
})

describe('sucursales (A11)', () => {
  it('lista ordenada por distancia y elegir mi sucursal', async () => {
    renderRoute('/sucursales?q=50000')
    expect(
      await screen.findByRole('heading', { name: '4 sucursales cerca de CP 50000, ordenadas por distancia' }),
    ).toBeInTheDocument()
    const items = within(screen.getByRole('list', { name: 'Sucursales encontradas' })).getAllByRole(
      'listitem',
    )
    expect(within(items[0]).getByRole('heading')).toHaveTextContent('1. Toluca Centro')
    fireEvent.click(within(items[1]).getByRole('button', { name: 'Elegir como mi sucursal' }))
    expect(await within(items[1]).findByRole('button', { name: 'Es tu sucursal' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(JSON.parse(window.localStorage.getItem('taller.sucursal')!).name).not.toBe('Toluca Centro')
  })

  it('busca por ciudad y muestra el stock de un producto (?sku=)', async () => {
    renderRoute('/sucursales?q=metepec&sku=100402-0')
    expect(await screen.findByRole('heading', { name: '1 sucursal para "metepec"' })).toBeInTheDocument()
    expect(screen.getByText('5 disponibles de este producto')).toBeInTheDocument()
  })

  it('el mapa está oculto para lectores de pantalla', async () => {
    const { container } = renderRoute('/sucursales')
    await screen.findByRole('heading', { name: /sucursales/ })
    expect(container.querySelector('[aria-hidden="true"] span')).toBeTruthy()
  })
})
