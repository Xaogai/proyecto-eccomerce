/** Quita acentos y pasa a minúsculas para comparar: "Inalámbrico" → "inalambrico". */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
