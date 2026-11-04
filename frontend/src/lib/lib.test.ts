import { describe, expect, it } from 'vitest'
import { formatMoney, plural } from './format'
import { canTransition, ORDER_STATUSES, orderStatusInfo, orderTransitions } from './orderStatus'
import { pagesToShow } from './pagination'

describe('formatMoney', () => {
  it('omite los centavos cuando son cero, como el diseño', () => {
    expect(formatMoney(214900)).toBe('$2,149')
  })
  it('muestra los centavos cuando los hay', () => {
    expect(formatMoney(214950)).toBe('$2,149.50')
  })
})

describe('plural', () => {
  it('usa singular solo para 1', () => {
    expect(plural(1, 'producto')).toBe('1 producto')
    expect(plural(3, 'producto')).toBe('3 productos')
  })
})

describe('orderStatus', () => {
  it('cada estado tiene etiqueta y transiciones', () => {
    for (const s of ORDER_STATUSES) {
      expect(orderStatusInfo[s].label).toBeTruthy()
      expect(orderTransitions[s]).toBeDefined()
    }
  })
  it('usa los tonos estandarizados en tokens.css', () => {
    expect(orderStatusInfo.pagado.tone).toBe('info')
    expect(orderStatusInfo.cancelado.tone).toBe('neutro')
    expect(orderStatusInfo.reembolsado.tone).toBe('neutro')
  })
  it('solo permite transiciones válidas (I3, prototipo Admin-6)', () => {
    expect(canTransition('incidencia', 'reembolsado')).toBe(true)
    expect(canTransition('incidencia', 'enviado')).toBe(true)
    expect(canTransition('entregado', 'pagado')).toBe(false)
    expect(orderTransitions.cancelado).toHaveLength(0)
  })
})

describe('pagesToShow', () => {
  it('muestra todas cuando son pocas', () => {
    expect(pagesToShow(2, 5)).toEqual([1, 2, 3, 4, 5])
  })
  it('recorta con huecos cuando son muchas', () => {
    expect(pagesToShow(6, 12)).toEqual([1, null, 5, 6, 7, null, 12])
  })
})
