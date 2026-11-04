import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { tokenStorage } from '@/api/tokenStorage'
import { issueRefreshToken } from '@/mocks/handlers/utils'
import { setScenario } from '@/mocks/scenarios'
import { renderRoute } from '@/test/render'
import { setViewport } from '@/test/viewport'

const chooseToluca = () =>
  window.localStorage.setItem(
    'taller.sucursal',
    JSON.stringify({ id: 'toluca-centro', name: 'Toluca Centro', zip: '50000' }),
  )

describe('listado por categoría (HU-01, HU-09)', () => {
  it('muestra migas, título, total y productos', async () => {
    setViewport('escritorio')
    renderRoute('/categoria/taladros')
    expect(await screen.findByRole('heading', { level: 1, name: 'Taladros' })).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'Migas de pan' })
    expect(within(crumbs).getByRole('link', { name: 'Herramientas eléctricas' })).toHaveAttribute(
      'href',
      '/categoria/herramientas-electricas',
    )
    expect(await screen.findByText(/^\d+ productos$/)).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: 'Taladro percutor inalámbrico 1/2 pulg 20 V' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toBeInTheDocument()
  })

  it('filtrar por marca actualiza la URL y los resultados sin recargar', async () => {
    setViewport('escritorio')
    const { router } = renderRoute('/categoria/taladros')
    const brands = await screen.findByRole('group', { name: 'Marca' })
    fireEvent.click(within(brands).getByRole('checkbox', { name: /Brava/ }))
    await waitFor(() => expect(router.state.location.search).toBe('?attr.brand=Brava'))
    expect(await screen.findByText('Filtrado por: marca Brava. 1 filtro activo')).toBeInTheDocument()
    await waitFor(() => {
      const cards = screen.getAllByRole('article')
      expect(cards.length).toBeGreaterThan(0)
      cards.forEach((card) => expect(card).toHaveTextContent('Brava'))
    })
    fireEvent.click(screen.getByRole('button', { name: /Marca Brava/ }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('la tarjeta de un producto de una sola variante lo agrega al carrito', async () => {
    chooseToluca()
    renderRoute('/categoria/taladros?sort=precio_asc')
    const add = await screen.findByRole('button', {
      name: /Agregar al carrito: Taladro eléctrico 3\/8 pulg 600 W/,
    })
    fireEvent.click(add)
    expect(await screen.findByRole('link', { name: 'Carrito 1 producto' })).toBeInTheDocument()
    expect(await screen.findByText(/Agregaste 1 pieza de Taladro eléctrico/)).toBeInTheDocument()
  })

  it('en móvil los filtros se abren en un panel', async () => {
    renderRoute('/categoria/taladros')
    fireEvent.click(await screen.findByRole('button', { name: /^Filtros/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Filtros' })
    expect(within(sheet).getByRole('button', { name: /Ver \d+ resultados/ })).toBeInTheDocument()
  })

  it('error de conexión con "Reintentar"', async () => {
    setScenario('error')
    renderRoute('/categoria/taladros')
    expect(
      await screen.findByRole('heading', { name: 'No pudimos cargar los productos' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})

describe('búsqueda', () => {
  it('sin resultados sugiere "¿Quisiste decir…?"', async () => {
    renderRoute('/buscar?q=taladro inalambico rojo 36v')
    expect(
      await screen.findByRole('heading', { name: 'No encontramos "taladro inalambico rojo 36v"' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'taladro inalámbrico' })).toHaveAttribute(
      'href',
      '/buscar?q=taladro%20inal%C3%A1mbrico',
    )
  })

  it('el autocompletado se recorre con flechas y Enter abre la opción', async () => {
    const { router } = renderRoute('/buscar')
    const input = screen.getByRole('combobox', { name: 'Buscar productos' })
    fireEvent.change(input, { target: { value: 'tala' } })
    const listbox = await screen.findByRole('listbox', { name: 'Sugerencias' })
    expect(await within(listbox).findAllByRole('option')).not.toHaveLength(0)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const first = within(listbox).getAllByRole('option')[0]
    expect(input).toHaveAttribute('aria-activedescendant', first.id)
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(router.state.location.search).toMatch(/^\?q=tala/))
  })
})

describe('ficha de producto (HU-02, HU-07)', () => {
  it('elegir otra variante cambia precio y SKU', async () => {
    chooseToluca()
    renderRoute('/producto/100245')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Taladro percutor inalámbrico 1/2 pulg 20 V' }),
    ).toBeInTheDocument()
    expect(screen.getByText('SKU 100245-0', { selector: '.sku' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Con 1 batería de 2 Ah y cargador/ }))
    expect(screen.getByText('SKU 100245-1', { selector: '.sku' })).toBeInTheDocument()
    expect(screen.getAllByText('$2,899').length).toBeGreaterThan(0)
    expect(await screen.findByText('Envío a domicilio, CP 50000: $149')).toBeInTheDocument()
    expect(screen.getByText('8 disponibles en Toluca Centro')).toBeInTheDocument()
  })

  it('agrega la cantidad elegida al carrito', async () => {
    renderRoute('/producto/300077')
    const steppers = await screen.findAllByRole('button', { name: 'Agregar uno' })
    fireEvent.click(steppers[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar al carrito' })[0])
    expect(await screen.findByRole('link', { name: 'Carrito 2 productos' })).toBeInTheDocument()
  })

  it('sin sesión, "Guardar en lista de deseos" manda a iniciar sesión', async () => {
    const { router } = renderRoute('/producto/100245')
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar en lista de deseos' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/cuenta/login'))
    expect(router.state.location.search).toBe('?next=%2Fproducto%2F100245')
  })

  it('con sesión guarda en la lista de deseos', async () => {
    tokenStorage.set(issueRefreshToken('u-cliente'))
    renderRoute('/producto/100245')
    const button = await screen.findByRole('button', { name: 'Guardar en lista de deseos' })
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'))
    fireEvent.click(button)
    expect(await screen.findByRole('button', { name: 'Guardado en tu lista de deseos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('muestra reseñas y especificaciones', async () => {
    setViewport('escritorio')
    renderRoute('/producto/100245')
    expect(await screen.findByRole('heading', { name: 'Especificaciones' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Mandril' })).toBeInTheDocument()
    expect(await screen.findByText('Potente y ligero')).toBeInTheDocument()
  })

  it('SKU inexistente: 404', async () => {
    renderRoute('/producto/no-existe')
    expect(await screen.findByRole('heading', { name: 'No encontramos esta página' })).toBeInTheDocument()
  })
})

describe('inicio y departamentos', () => {
  it('inicio con departamentos y productos disponibles hoy', async () => {
    chooseToluca()
    renderRoute('/')
    expect(
      await screen.findByRole('heading', { level: 1, name: /Compra en línea y recoge/ }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Disponibles hoy en Toluca Centro' }),
    ).toBeInTheDocument()
    const deps = screen.getByRole('region', { name: 'Departamentos' })
    expect(await within(deps).findAllByRole('listitem')).toHaveLength(8)
  })

  it('departamentos baja por niveles y regresa', async () => {
    renderRoute('/departamentos')
    fireEvent.click(await screen.findByRole('button', { name: 'Herramientas, ver subcategorías' }))
    expect(screen.getByText('Herramientas · nivel 2 de 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Herramientas eléctricas, ver subcategorías' }))
    expect(screen.getByRole('link', { name: 'Taladros' })).toHaveAttribute('href', '/categoria/taladros')
    fireEvent.click(screen.getByRole('button', { name: /Herramientas$/ }))
    expect(screen.getByText('Herramientas · nivel 2 de 3')).toBeInTheDocument()
  })

  it('páginas de ayuda del pie (G1)', async () => {
    renderRoute('/ayuda/privacidad')
    expect(await screen.findByRole('heading', { level: 1, name: 'Aviso de privacidad' })).toBeInTheDocument()
  })
})
