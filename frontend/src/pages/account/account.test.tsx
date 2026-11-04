import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tokenStorage } from '@/api/tokenStorage'
import { db } from '@/mocks/db/store'
import { API, issueRefreshToken } from '@/mocks/handlers/utils'
import { server } from '@/mocks/server'
import { http, HttpResponse } from 'msw'
import { renderRoute } from '@/test/render'

const asAna = () => tokenStorage.set(issueRefreshToken('u-cliente'))

async function fillLogin(email: string, password: string) {
  fireEvent.change(await screen.findByLabelText('Correo electrónico'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

describe('iniciar sesión (B1, B4)', () => {
  it('entra y regresa a la página de ?next=', async () => {
    const { router } = renderRoute('/cuenta/login?next=%2Fcuenta%2Fdeseos')
    await fillLogin('cliente@ejemplo.com', 'Taller123')
    await waitFor(() => expect(router.state.location.pathname).toBe('/cuenta/deseos'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Lista de deseos' })).toBeInTheDocument()
  })

  it('el admin va a su panel', async () => {
    const { router } = renderRoute('/cuenta/login')
    await fillLogin('admin@ejemplo.com', 'Taller123')
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'))
  })

  it('no acepta ?next= a otro sitio', async () => {
    const { router } = renderRoute('/cuenta/login?next=%2F%2Fevil.com')
    await fillLogin('cliente@ejemplo.com', 'Taller123')
    await waitFor(() => expect(router.state.location.pathname).toBe('/cuenta'))
  })

  it('contraseña incorrecta avisa cuántos intentos quedan', async () => {
    renderRoute('/cuenta/login')
    await fillLogin('cliente@ejemplo.com', 'mal')
    await fillLogin('cliente@ejemplo.com', 'mal')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El correo o la contraseña no coinciden. Te quedan 3 intentos antes de que bloqueemos la cuenta por 15 minutos.',
    )
  })

  it('cuenta bloqueada: lo explica y ofrece restablecer', async () => {
    renderRoute('/cuenta/login')
    await fillLogin('bloqueada@ejemplo.com', 'Taller123')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Bloqueamos tu cuenta por seguridad.')
    expect(within(alert).getByRole('link', { name: 'Restablecer contraseña' })).toHaveAttribute(
      'href',
      '/cuenta/restablecer',
    )
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
  })

  it('al entrar, el carrito de invitado se une al de la cuenta (EP-14)', async () => {
    db.carts.set('c-invitado', [{ id: 'g1', sku: '300077-0', qty: 2 }])
    window.localStorage.setItem('taller.cart', JSON.stringify('c-invitado'))
    renderRoute('/cuenta/login')
    await fillLogin('cliente@ejemplo.com', 'Taller123')
    expect(await screen.findByRole('link', { name: 'Carrito 2 productos' })).toBeInTheDocument()
    expect(window.localStorage.getItem('taller.cart')).toBeNull()
  })
})

describe('crear cuenta (HU-03, B2)', () => {
  it('valida la contraseña de 8+ y el aviso de privacidad', async () => {
    renderRoute('/cuenta/registro')
    fireEvent.change(await screen.findByLabelText('Contraseña'), { target: { value: 'taller7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(await screen.findByText('Tu contraseña tiene 7 caracteres. Usa al menos 8.')).toBeInTheDocument()
    expect(
      screen.getByText('Para crear tu cuenta necesitas aceptar el aviso de privacidad.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/^Revisa \d+ campos antes de continuar\.$/)).toBeInTheDocument()
  })

  it('crea la cuenta y entra', async () => {
    const { router } = renderRoute('/cuenta/registro')
    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Luis' } })
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'García' } })
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'luis@ejemplo.com' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Segura123' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /aviso de privacidad/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/cuenta'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Luis' })).toBeInTheDocument()
  })
})

describe('Mi cuenta', () => {
  it('resumen con pedido en curso y accesos', async () => {
    asAna()
    renderRoute('/cuenta')
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: /Pedido 10482 · Listo para recoger/ }),
    ).toBeInTheDocument()
    expect(await screen.findByText('2 guardadas · Casa es la principal')).toBeInTheDocument()
  })

  it('pedidos: el filtro "Terminados" vive en la URL', async () => {
    asAna()
    const { router } = renderRoute('/cuenta/pedidos')
    expect(await screen.findByText('5 pedidos')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Terminados' }))
    await waitFor(() => expect(router.state.location.search).toBe('?estado=fin'))
    expect(await screen.findByText('3 pedidos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Terminados' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('seguimiento: línea de tiempo, código de entrega y productos', async () => {
    asAna()
    renderRoute('/cuenta/pedidos/10482')
    expect(await screen.findByRole('heading', { level: 1, name: 'Pedido 10482' })).toBeInTheDocument()
    const timeline = screen.getByRole('list', { name: 'Estado del pedido' })
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(6)
    expect(within(timeline).getByText('Listo para recoger').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByText('4821')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Escribir reseña de Taladro percutor inalámbrico 1/2 pulg 20 V' }),
    ).toBeInTheDocument()
  })

  it('pedido de otra persona: 404', async () => {
    tokenStorage.set(issueRefreshToken('u-cliente2'))
    renderRoute('/cuenta/pedidos/10482')
    expect(await screen.findByRole('heading', { name: 'No encontramos esta página' })).toBeInTheDocument()
  })
})

describe('direcciones (EP-27)', () => {
  it('agrega, hace principal y elimina con confirmación', async () => {
    asAna()
    renderRoute('/cuenta/direcciones')
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar dirección' }))
    const form = screen.getByRole('form', { name: 'Nueva dirección' })
    const fill = (label: string, value: string) =>
      fireEvent.change(within(form).getByLabelText(label), { target: { value } })
    fill('Nombre de la dirección', 'Obra')
    fill('Calle', 'Juárez')
    fill('Número exterior', '15')
    fill('Colonia', 'San Mateo')
    fill('Código postal', '52140')
    fill('Ciudad o municipio', 'Metepec')
    fill('Estado', 'Estado de México')
    fill('Teléfono de contacto', '7221112233')
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('heading', { name: 'Obra' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hacer principal Obra' }))
    expect(await screen.findByText('"Obra" es ahora tu dirección principal')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Oficina' }))
    expect(screen.getByRole('button', { name: 'No' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Oficina' })).toBeNull())
  })
})

describe('lista de deseos', () => {
  it('muestra la baja de precio y quita productos', async () => {
    asAna()
    renderRoute('/cuenta/deseos')
    expect(await screen.findByText('2 productos guardados')).toBeInTheDocument()
    expect(screen.getByText('Bajó $300')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar de la lista Rotomartillo SDS Plus 800 W' }))
    expect(await screen.findByText('1 producto guardado')).toBeInTheDocument()
  })
})

describe('datos y privacidad (ARCO)', () => {
  it('rectifica datos, cambia consentimientos y solicita copia', async () => {
    asAna()
    renderRoute('/cuenta/datos')
    const name = await screen.findByLabelText('Nombre completo')
    fireEvent.change(name, { target: { value: 'Ana María López' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Guardamos tus datos')).toBeInTheDocument()

    const marketing = await screen.findByRole('switch', { name: 'Recibir ofertas y promociones por correo' })
    fireEvent.click(marketing)
    await waitFor(() => expect(marketing).toHaveAttribute('aria-checked', 'true'))

    fireEvent.click(screen.getByRole('button', { name: 'Solicitar copia de mis datos' }))
    expect(await screen.findByText(/Solicitud registrada con folio ARCO-2291/)).toBeInTheDocument()
  })

  it('no deja eliminar la cuenta con pedidos en curso', async () => {
    asAna()
    renderRoute('/cuenta/datos')
    fireEvent.click(await screen.findByRole('button', { name: 'Quiero eliminar mi cuenta' }))
    fireEvent.change(screen.getByLabelText('Escribe tu contraseña para confirmar'), {
      target: { value: 'Taller123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar mi cuenta' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Tienes el pedido 10482 listo para recoger')
    expect(within(alert).getByRole('link', { name: 'Ver pedido' })).toBeInTheDocument()
  })
})

describe('devolución y reseña', () => {
  afterEach(() => vi.useRealTimers())

  it('pide foto si el producto llegó dañado y envía la solicitud', async () => {
    // El pedido 10311 se entregó a inicios de octubre: se fija la fecha dentro de sus 30 días para devolver.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T12:00:00'))
    asAna()
    renderRoute('/cuenta/pedidos/10311/devolucion')
    expect(await screen.findByRole('heading', { level: 1, name: 'Solicitar devolución' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(screen.getByRole('radio', { name: 'Llegó dañado o no funciona' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    expect(await screen.findByText('Agrega una foto del problema.')).toBeInTheDocument()

    // jsdom no arma multipart que MSW pueda leer: aquí se simula la respuesta (el envío real se prueba en e2e).
    server.use(
      http.post(`${API}/orders/:id/returns`, () =>
        HttpResponse.json(
          {
            id: 'r1',
            folio: 'DEV-0388',
            status: 'en_revision',
            refund: 32900,
            instructions: 'Lleva el producto a Metepec.',
          },
          { status: 201 },
        ),
      ),
    )
    const file = new File(['x'], 'foto.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText(/Foto del problema/), { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: /^Devolución DEV-\d+ en revisión$/ }),
    ).toBeInTheDocument()
  })

  it('pedido no entregado: no se puede devolver', async () => {
    asAna()
    renderRoute('/cuenta/pedidos/10482/devolucion')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Este pedido ya no se puede devolver' }),
    ).toBeInTheDocument()
  })

  it('reseña: mínimo 20 caracteres y queda en moderación', async () => {
    asAna()
    renderRoute('/producto/100245/resena?pedido=10482')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Taladro percutor inalámbrico 1/2 pulg 20 V' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /4 de 5 estrellas/ }))
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Potente' } })
    fireEvent.change(screen.getByLabelText('Tu opinión'), { target: { value: 'Muy bueno' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }))
    expect(await screen.findByText('Tu opinión tiene 9 caracteres. Escribe al menos 20.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tu opinión'), {
      target: { value: 'Lo usé en concreto y la batería duró toda la tarde.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar reseña' }))
    expect(await screen.findByText('Gracias por tu reseña')).toBeInTheDocument()
    expect(db.pendingReviews).toHaveLength(1)
  })
})

describe('restablecer contraseña (B6)', () => {
  it('pide el correo y no revela si existe', async () => {
    renderRoute('/cuenta/restablecer')
    fireEvent.change(await screen.findByLabelText('Correo electrónico'), {
      target: { value: 'nadie@ejemplo.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument()
  })

  it('enlace vencido', async () => {
    renderRoute('/cuenta/restablecer/vencido')
    fireEvent.change(await screen.findByLabelText('Contraseña nueva'), { target: { value: 'Segura123' } })
    fireEvent.change(screen.getByLabelText('Confirma la contraseña'), { target: { value: 'Segura123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByText(/El enlace ya venció/)).toBeInTheDocument()
  })
})
