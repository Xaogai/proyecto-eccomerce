import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useUrlFilters } from './useUrlFilters'

function setup(url: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  )
  return renderHook(() => ({ filters: useUrlFilters(), location: useLocation() }), { wrapper })
}

describe('useUrlFilters', () => {
  it('lee los filtros y la página de la URL', () => {
    const { result } = setup('/admin/pedidos?estado=pagado&page=3&q=taladro')
    expect(result.current.filters.get('estado')).toBe('pagado')
    expect(result.current.filters.get('sucursal')).toBe('')
    expect(result.current.filters.page).toBe(3)
    expect(result.current.filters.text).toBe('taladro')
  })

  it('una página inválida es la 1', () => {
    expect(setup('/admin/pedidos?page=abc').result.current.filters.page).toBe(1)
    expect(setup('/admin/pedidos?page=-2').result.current.filters.page).toBe(1)
  })

  it('cambiar un filtro regresa a la página 1 y vaciarlo lo quita de la URL', () => {
    const { result } = setup('/admin/pedidos?estado=pagado&page=3')
    act(() => result.current.filters.set('sucursal', 'toluca'))
    expect(result.current.location.search).toBe('?estado=pagado&sucursal=toluca')
    act(() => result.current.filters.set('estado', null))
    expect(result.current.location.search).toBe('?sucursal=toluca')
  })

  it('la búsqueda llega a la URL al dejar de escribir', async () => {
    const { result } = setup('/admin/productos?page=2')
    act(() => result.current.filters.setText('  martillo '))
    expect(result.current.location.search).toBe('?page=2')
    await waitFor(() => expect(result.current.location.search).toBe('?q=martillo'))
    act(() => result.current.filters.setText(''))
    await waitFor(() => expect(result.current.location.search).toBe(''))
  })
})
