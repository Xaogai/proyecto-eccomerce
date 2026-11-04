// Fuente única de estados (tabla al final de src/styles/tokens.css).
// Las transiciones son la propuesta del frontend; en el admin manda `allowed_transitions` de la API (EP-42).

export type Tone = 'ok' | 'aviso' | 'error' | 'info' | 'neutro'

export const ORDER_STATUSES = [
  'creado',
  'pendiente_pago',
  'pagado',
  'en_preparacion',
  'listo_para_recoger',
  'enviado',
  'entregado',
  'incidencia',
  'cancelado',
  'reembolsado',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

interface StatusInfo {
  label: string
  tone: Tone
  /** "curso" o "fin": agrupa los filtros de Mis pedidos (EP-18) */
  group: 'curso' | 'fin'
}

export const orderStatusInfo: Record<OrderStatus, StatusInfo> = {
  creado: { label: 'Creado', tone: 'neutro', group: 'curso' },
  pendiente_pago: { label: 'Pendiente de pago', tone: 'aviso', group: 'curso' },
  pagado: { label: 'Pagado', tone: 'info', group: 'curso' },
  en_preparacion: { label: 'En preparación', tone: 'info', group: 'curso' },
  listo_para_recoger: { label: 'Listo para recoger', tone: 'aviso', group: 'curso' },
  enviado: { label: 'Enviado', tone: 'info', group: 'curso' },
  entregado: { label: 'Entregado', tone: 'ok', group: 'fin' },
  incidencia: { label: 'Incidencia', tone: 'error', group: 'curso' },
  cancelado: { label: 'Cancelado', tone: 'neutro', group: 'fin' },
  reembolsado: { label: 'Reembolsado', tone: 'neutro', group: 'fin' },
}

export const orderTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  creado: ['pendiente_pago', 'cancelado'],
  pendiente_pago: ['pagado', 'cancelado'],
  pagado: ['en_preparacion', 'cancelado'],
  en_preparacion: ['listo_para_recoger', 'enviado', 'incidencia'],
  listo_para_recoger: ['entregado', 'cancelado', 'incidencia'],
  enviado: ['entregado', 'incidencia'],
  entregado: ['reembolsado'],
  incidencia: ['reembolsado', 'enviado'],
  cancelado: [],
  reembolsado: [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return orderTransitions[from].includes(to)
}

export type PaymentStatus = 'pendiente' | 'pagado' | 'rechazado'

export const paymentStatusInfo: Record<PaymentStatus, { label: string; tone: Tone }> = {
  pendiente: { label: 'Pago en proceso', tone: 'aviso' },
  pagado: { label: 'Pago confirmado', tone: 'ok' },
  rechazado: { label: 'Pago rechazado', tone: 'error' },
}

export type StockStatus = 'ok' | 'low' | 'out' | 'ship_only'

export const stockTone: Record<StockStatus, Tone | 'texto'> = {
  ok: 'ok',
  low: 'aviso',
  out: 'error',
  ship_only: 'texto',
}

export type ProductStatus = 'publicado' | 'borrador' | 'agotado'

export const productStatusInfo: Record<ProductStatus, { label: string; tone: Tone }> = {
  publicado: { label: 'Publicado', tone: 'ok' },
  borrador: { label: 'Borrador', tone: 'neutro' },
  agotado: { label: 'Agotado', tone: 'error' },
}
