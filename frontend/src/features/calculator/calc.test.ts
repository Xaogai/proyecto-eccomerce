import { describe, expect, it } from 'vitest'
import { anchors, fieldError, floor, paint, parseNumber } from './calc'

describe('calculadora de materiales', () => {
  it('acepta coma o punto decimal', () => {
    expect(parseNumber('2,5')).toBe(2.5)
    expect(parseNumber('2.5')).toBe(2.5)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
  })

  it('mensajes de error como el prototipo', () => {
    const def = { id: 'ancho', label: 'Ancho', help: '', min: 0.1 }
    expect(fieldError('', def)).toBe('Este campo es obligatorio.')
    expect(fieldError('0', def)).toBe('Escribe un número válido, mínimo 0.1.')
    expect(fieldError('3', def)).toBeNull()
    expect(fieldError('2.5', { ...def, min: 1, integer: true })).toBe('Escribe un número entero, mínimo 1.')
  })

  it('pintura: valores del prototipo (4 × 2.5 × 4 muros − 3 m², 2 manos)', () => {
    const r = paint({ width: 4, height: 2.5, walls: 4, openings: 3, coats: 2 })
    expect(r.area).toBe(37)
    expect(r.liters).toBe(7.4)
    expect(r.suggestion).toBe('2 galones de 4 L')
  })

  it('pintura: cubetas de 19 L y galones', () => {
    expect(paint({ width: 10, height: 3, walls: 4, openings: 0, coats: 2 }).suggestion).toBe(
      '1 cubeta de 19 L y 2 galones de 4 L',
    )
    expect(paint({ width: 1, height: 1, walls: 1, openings: 5, coats: 2 }).suggestion).toBe(
      'No necesitas pintura',
    )
  })

  it('piso: agrega el desperdicio y redondea cajas hacia arriba', () => {
    const r = floor({ length: 4, width: 3, boxM2: 1.44, wastePct: 10 })
    expect(r.area).toBe(12)
    expect(r.boxes).toBe(10) // 13.2 / 1.44 = 9.17 → 10
    expect(r.adhesiveBags).toBe(3)
  })

  it('taquetes: bolsas de 25 con piezas extra', () => {
    const r = anchors({ pieces: 6, perPiece: 4, extraPct: 10 })
    expect(r.needed).toBe(24)
    expect(r.total).toBe(27)
    expect(r.bags).toBe(2)
  })
})
