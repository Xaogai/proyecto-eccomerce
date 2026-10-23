// Cálculos de la calculadora de materiales (pantallas 19 y 26). Funciones puras, probadas en calc.test.ts.

/** "2,5" o "2.5" → 2.5; vacío o inválido → null */
export function parseNumber(value: string): number | null {
  const v = value.trim().replace(',', '.')
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export interface FieldDef {
  id: string
  label: string
  help: string
  min: number
  integer?: boolean
}

/** Error de un campo, o null si es válido. */
export function fieldError(value: string, def: FieldDef): string | null {
  if (!value.trim()) return 'Este campo es obligatorio.'
  const n = parseNumber(value)
  if (n === null || n < def.min || (def.integer && !Number.isInteger(n))) {
    return def.integer
      ? `Escribe un número entero, mínimo ${def.min}.`
      : `Escribe un número válido, mínimo ${def.min}.`
  }
  return null
}

// ---------- Pintura ----------

/** Rendimiento: m² por litro por mano (del prototipo; varía según la etiqueta). */
export const PAINT_YIELD = 10

export function paint(input: {
  width: number
  height: number
  walls: number
  openings: number
  coats: number
}) {
  const area = Math.max(0, input.width * input.height * input.walls - input.openings)
  const liters = Math.ceil(((area * input.coats) / PAINT_YIELD) * 10) / 10
  // Cubetas de 19 L primero; lo que falte, en galones de 4 L.
  const buckets = Math.floor(liters / 19)
  const gallons = Math.ceil((liters - buckets * 19) / 4)
  const parts = [
    buckets ? `${buckets} ${buckets > 1 ? 'cubetas' : 'cubeta'} de 19 L` : '',
    gallons ? `${gallons} ${gallons > 1 ? 'galones' : 'galón'} de 4 L` : '',
  ].filter(Boolean)
  return { area, liters, buckets, gallons, suggestion: parts.join(' y ') || 'No necesitas pintura' }
}

// ---------- Piso y azulejo ----------

export function floor(input: { length: number; width: number; boxM2: number; wastePct: number }) {
  const area = input.length * input.width
  const withWaste = area * (1 + input.wastePct / 100)
  const boxes = Math.ceil(withWaste / input.boxM2 - 1e-9)
  // Pegazulejo: un saco de 20 kg rinde unos 4 m².
  const adhesiveBags = Math.ceil(area / 4 - 1e-9)
  return { area, withWaste, boxes, adhesiveBags }
}

// ---------- Taquetes y tornillos ----------

export function anchors(input: { pieces: number; perPiece: number; extraPct: number }) {
  const needed = input.pieces * input.perPiece
  const total = Math.ceil(needed * (1 + input.extraPct / 100) - 1e-9)
  // Se venden en bolsas de 25.
  const bags = Math.ceil(total / 25)
  return { needed, total, bags }
}

export const format1 = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
