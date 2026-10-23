import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { tokenStorage } from '@/api/tokenStorage'
import { db } from '@/mocks/db/store'
import { issueRefreshToken } from '@/mocks/handlers/utils'
import { setScenario } from '@/mocks/scenarios'
import { renderRoute } from '@/test/render'

const chooseToluca = () =>
  window.localStorage.setItem(
    'taller.sucursal',
    JSON.stringify({ id: 'toluca-centro', name: 'Toluca Centro', zip: '50000' }),
  )

/** Carrito de invitado con productos (lo mismo que haría "Agregar al carrito"). */
function guestCart(items: Array<{ sku: string; qty: number }>) {
  db.carts.set(
    'c-prueba',
    items.map((i, n) => ({ id: `i${n}`, ...i })),
  )
  window.localStorage.setItem('taller.cart', JSON.stringify('c-prueba'))
}

describe('carrito (HU-04)', () => {
  it('vacío invita a seguir comprando', async () => {
    renderRoute('/carrito')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tu carrito está vacío' }),
    ).toBeInTheDocument()
  })

  it('cambia cantidades, recalcula el total y quita productos', async () => {
    chooseToluca()
    guestCart([
      { sku: '100245-1', qty: 1 },
      { sku: '300077-0', qty: 2 },
    ])
    renderRoute('/carrito')
    expect(await screen.findByRole('heading', { level: 1, name: 'Carrito (3)' })).toBeInTheDocument()
    const summary = screen.getByRole('complementary', { name: 'Resumen' })
    expect(within(summary).getAllByText('$4,597')).toHaveLength(2) // subtotal y total: 2,899 + 2 × 849

    const stepper = screen.getByRole('group', { name: 'Cantidad de Taladro eléctrico 3/8 pulg 600 W' })
    fireEvent.click(within(stepper).getByRole('button', { name: 'Agregar uno' }))
    expect(await within(summary).findAllByText('$5,446')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Taladro eléctrico 3/8 pulg 600 W' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Carrito (1)' })).toBeInTheDocument()
    expect(await screen.findByText(/Quitaste Taladro eléctrico/)).toBeInTheDocument()
  })

  it('lo agotado en la sucursal no se suma; se puede cambiar a envío (Escritorio-3-Carrito)', async () => {
    chooseToluca()
    guestCart([
      { sku: '300077-0', qty: 1 },
      { sku: '100402-0', qty: 1 },
    ])
    renderRoute('/carrito')
    expect(await screen.findByText('Agotado en Toluca Centro. No se suma al total.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Carrito (1)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a envío a domicilio' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Carrito (2)' })).toBeInTheDocument()
  })
})

describe('checkout (HU-06, HU-07)', () => {
  it('nunca muestra campos de tarjeta (RQ-SEG-002)', async () => {
    chooseToluca()
    guestCart([{ sku: '300077-0', qty: 1 }])
    const { container } = renderRoute('/checkout')
    expect(await screen.findByRole('heading', { level: 1, name: 'Checkout' })).toBeInTheDocument()
    expect(container.querySelector('input[autocomplete^="cc-"]')).toBeNull()
    expect(screen.queryByLabelText(/tarjeta|cvv|vencimiento/i)).toBeNull()
    expect(screen.getByText(/no pide ni guarda los datos de tu tarjeta/)).toBeInTheDocument()
  })

  it('valida los datos y lleva el foco al resumen de errores', async () => {
    chooseToluca()
    guestCart([{ sku: '300077-0', qty: 1 }])
    renderRoute('/checkout')
    fireEvent.click(await screen.findByRole('button', { name: /^Pagar/ }))
    expect(await screen.findByText('Revisa 3 campos antes de continuar.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre completo')).toHaveAccessibleDescription(
      'Escribe tu nombre completo.',
    )
    expect(screen.getByLabelText(/Teléfono/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('invitado: recoger en tienda → pasarela → pago confirmado', async () => {
    chooseToluca()
    guestCart([{ sku: '300077-0', qty: 1 }])
    const { router } = renderRoute('/checkout')
    fireEvent.change(await screen.findByLabelText('Nombre completo'), { target: { value: 'Ana López' } })
    fireEvent.change(screen.getByLabelText(/Teléfono/), { target: { value: '722 123 4567' } })
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@ejemplo.com' } })
    expect(await screen.findByRole('radio', { name: /Toluca Centro/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Pagar $849' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pagar $849' }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/_pasarela\/\d+$/))
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar pago' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/pedido\/\d+\/confirmacion$/))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Estamos confirmando tu pago' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Gracias, tu pedido está pagado' },
        { timeout: 4000 },
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Toluca Centro')).toBeInTheDocument()
    expect(db.carts.get('c-prueba')).toEqual([]) // el carrito se vacía al crear el pedido
  })

  it('pago rechazado ofrece reintentar', async () => {
    chooseToluca()
    guestCart([{ sku: '300077-0', qty: 1 }])
    setScenario('pago-rechazado')
    renderRoute('/checkout')
    fireEvent.change(await screen.findByLabelText('Nombre completo'), { target: { value: 'Ana López' } })
    fireEvent.change(screen.getByLabelText(/Teléfono/), { target: { value: '7221234567' } })
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@ejemplo.com' } })
    await screen.findByRole('radio', { name: /Toluca Centro/ })
    fireEvent.click(screen.getByRole('button', { name: /^Pagar/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar pago' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tu banco no aprobó el pago' }, { timeout: 4000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar el pago' })).toBeInTheDocument()
  })

  it('con sesión: datos y dirección guardada ya puestos; envío con costo por CP', async () => {
    tokenStorage.set(issueRefreshToken('u-cliente'))
    db.carts.set('c-u-cliente', [{ id: 'i1', sku: '300077-0', qty: 1 }])
    db.userCarts.set('u-cliente', 'c-u-cliente')
    renderRoute('/checkout')
    expect(await screen.findByDisplayValue('Ana López')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Envío a domicilio/ }))
    expect(await screen.findByRole('radio', { name: /Casa/ })).toBeChecked()
    expect(await screen.findByRole('button', { name: 'Pagar $998' })).toBeInTheDocument() // 849 + 149
  })

  it('con mucha demanda muestra la fila de espera y entra solo (24.3)', async () => {
    chooseToluca()
    guestCart([{ sku: '300077-0', qty: 1 }])
    setScenario('queue')
    const { router } = renderRoute('/checkout')
    fireEvent.change(await screen.findByLabelText('Nombre completo'), { target: { value: 'Ana López' } })
    fireEvent.change(screen.getByLabelText(/Teléfono/), { target: { value: '7221234567' } })
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@ejemplo.com' } })
    await screen.findByRole('radio', { name: /Toluca Centro/ })
    fireEvent.click(screen.getByRole('button', { name: /^Pagar/ }))
    expect(
      await screen.findByRole('heading', { name: 'Hay muchas personas comprando ahora' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Avance en la fila' })).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/_pasarela\//), { timeout: 8000 })
  }, 10_000)
})
