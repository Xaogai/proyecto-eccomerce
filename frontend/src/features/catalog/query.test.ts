import { describe, expect, it } from 'vitest'
import { activeFilters, filterSummary, readListing, toApiParams, writeListing } from './query'

describe('estado del listado en la URL', () => {
  it('lee y escribe filtros; cambiar un filtro vuelve a la página 1', () => {
    const params = new URLSearchParams('page=3&attr.brand=Volta')
    const next = writeListing(params, { priceMax: 5000 })
    expect(next.get('page')).toBeNull()
    expect(next.get('precio_max')).toBe('5000')
    expect(readListing(next)).toMatchObject({ page: 1, priceMax: 5000, attrs: { brand: ['Volta'] } })
  })

  it('convierte pesos a centavos para la API y solo manda "recoger hoy" con sucursal', () => {
    const state = readListing(
      new URLSearchParams('precio_min=100&disponible=hoy&attr.mandril=3/8 pulg,1/2 pulg'),
    )
    expect(toApiParams(state, { category: 'taladros' })).toMatchObject({
      category: 'taladros',
      price_min: 10000,
      'attr.mandril': '3/8 pulg,1/2 pulg',
    })
    expect(toApiParams(state, {})).not.toHaveProperty('pickup_today')
    expect(toApiParams(state, { storeId: 'toluca-centro' })).toMatchObject({ pickup_today: 'true' })
  })

  it('resume los filtros como en el prototipo (28.3)', () => {
    const state = readListing(new URLSearchParams('precio_max=5000&attr.mandril=3/8 pulg,1/2 pulg'))
    const active = activeFilters(state, { mandril: 'Mandril' })
    expect(active.map((f) => f.label)).toEqual(['Hasta $5,000', 'Mandril 3/8 pulg', 'Mandril 1/2 pulg'])
    expect(filterSummary(active)).toBe(
      'Filtrado por: precio hasta $5,000, mandril 3/8 pulg y mandril 1/2 pulg. 3 filtros activos',
    )
    expect(filterSummary([])).toBe('Sin filtros activos')
  })
})
