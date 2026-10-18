// Formatos para es-MX. El dinero llega de la API en centavos (T-03 en docs/api/endpoints-propuestos.md).

const moneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 })
const monedaEntera = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })

/** 214900 → "$2,149"; 214950 → "$2,149.50" (el diseño omite los centavos cuando son cero). */
export function formatMoney(centavos: number): string {
  return centavos % 100 === 0 ? monedaEntera.format(centavos / 100) : moneda.format(centavos / 100)
}

const sinPunto = (s: string) => s.replace(/\./g, '')

const fecha = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
const fechaCorta = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })
const hora = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })

/** "16 oct 2026" */
export function formatDate(iso: string): string {
  return sinPunto(fecha.format(new Date(iso)).replace(/ de /g, ' '))
}

/** "16 oct 19:05" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${sinPunto(fechaCorta.format(d).replace(/ de /g, ' '))} ${hora.format(d)}`
}

/** "1 producto", "3 productos" */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}
