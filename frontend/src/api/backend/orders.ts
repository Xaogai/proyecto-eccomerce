// EP-10 a EP-18: carrito, checkout, pedido, reintento de pago y Mis pedidos.
import type { Cart } from '../schemas/cart'
import type { Order, OrderSummary } from '../schemas/order'
import type { CheckoutInput } from '@/features/checkout/api'
import { type OrderStatus, orderStatusInfo } from '@/lib/orderStatus'
import { ApiError, toApiError } from '../errors'
import { stockStatus } from './catalog'
import { bget, bsend } from './http'
import type { Route } from './router'
import { skuImage, toCents, variantLabel } from './shared'

/** Los precios del carrito se respetan 24 h (se muestra "precio válido hasta…"). */
const PRICE_VALID_MS = 24 * 60 * 60_000
const MAX_QTY = 50
const RETURN_DAYS = 30

interface BCartItem {
  variante_sku: string
  nombre_producto: string
  cantidad: number
  precio_unitario_vigente: string
  imagen_url: string | null
  atributos: Record<string, unknown>
  producto_sku: string | null
  stock_disponible: number
  stock_sucursal: number | null
}

interface BCart {
  id: string
  items: BCartItem[]
  total: string
}

export function toCart(c: BCart): Cart {
  const items = c.items.map((i) => ({
    // El backend identifica el renglón por SKU: es el id que el frontend manda al cambiar o quitar.
    id: i.variante_sku,
    sku: i.variante_sku,
    product_sku: i.producto_sku ?? i.variante_sku,
    name: i.nombre_producto,
    variant_label: variantLabel(i.atributos, i.variante_sku),
    image: { url: i.imagen_url ?? skuImage(i.variante_sku), alt: `Foto de ${i.nombre_producto}` },
    unit_price: toCents(i.precio_unitario_vigente),
    price_valid_until: new Date(Date.now() + PRICE_VALID_MS).toISOString(),
    qty: i.cantidad,
    max_qty: Math.max(1, Math.min(MAX_QTY, i.stock_disponible)),
    stock_status: stockStatus(i.stock_disponible),
    store_stock:
      i.stock_sucursal === null ? null : { qty: i.stock_sucursal, status: stockStatus(i.stock_sucursal) },
  }))
  const subtotal = toCents(c.total)
  return {
    id: c.id,
    items,
    subtotal,
    shipping: null,
    total: subtotal,
    warnings: items
      .filter((i) => i.stock_status === 'out')
      .map((i) => ({ item_id: i.id, code: 'out_of_stock' })),
  }
}

/** El backend llama `disponibles` a las piezas que quedan; el frontend, `available`. */
function cartError(error: unknown): never {
  const e = toApiError(error)
  const data = 'disponibles' in e.data ? { ...e.data, available: e.data.disponibles } : e.data
  throw new ApiError(e.status, e.message, e.code, e.fieldErrors, data)
}

const store = (query: Record<string, string>) => ({ sucursal_id: query.store_id })

// Pedidos

interface BOrder {
  id: string
  folio: string
  fecha: string
  estado: string
  total: string
  costo_envio: string
  total_con_envio: string
  tipo_envio: 'domicilio' | 'recoleccion_tienda'
  numero_guia: string | null
  estado_pago: string | null
  metodo_pago: string | null
  checkout_url: string | null
  contacto: { nombre: string; email: string; telefono: string | null } | null
  direccion_entrega: string | null
  sucursal_id: string | null
  sucursal_nombre: string | null
  codigo_recoleccion: string | null
  historial: { estado: string; fecha: string }[]
  devoluciones: { folio: string; estado: string; fecha: string }[]
  fecha_entrega: string | null
  items: {
    variante_sku: string
    cantidad: number
    precio_unitario_venta: string
    nombre_producto: string | null
    atributos: Record<string, unknown>
    imagen_url: string | null
    producto_sku: string | null
  }[]
}

/** Estados del backend → los del frontend: "confirmado" es pagado; el pago rechazado sigue pendiente de pago. */
export function toStatus(estado: string): OrderStatus {
  if (estado === 'confirmado') return 'pagado'
  if (estado === 'pago_rechazado') return 'pendiente_pago'
  return estado in orderStatusInfo ? (estado as OrderStatus) : 'creado'
}

export function toPaymentStatus(
  o: Pick<BOrder, 'estado' | 'estado_pago'>,
): 'pendiente' | 'pagado' | 'rechazado' {
  if (o.estado === 'pago_rechazado' || o.estado_pago === 'rechazado') return 'rechazado'
  if (o.estado_pago === 'aprobado' || o.estado === 'confirmado' || toStatus(o.estado) !== 'pendiente_pago')
    return 'pagado'
  return 'pendiente'
}

function returnDeadline(o: BOrder, now = Date.now()): string | null {
  if (o.estado !== 'entregado' || !o.fecha_entrega) return null
  const deadline = new Date(o.fecha_entrega).getTime() + RETURN_DAYS * 86_400_000
  return deadline > now ? new Date(deadline).toISOString() : null
}

export function toOrder(o: BOrder, now = Date.now()): Order {
  const timeline: Order['timeline'] = []
  for (const h of o.historial) {
    const status = toStatus(h.estado)
    if (timeline.at(-1)?.status !== status) timeline.push({ status, at: h.fecha })
  }
  const pickup = o.tipo_envio === 'recoleccion_tienda'
  return {
    id: o.id,
    folio: o.folio,
    status: toStatus(o.estado),
    payment_status: toPaymentStatus(o),
    created_at: o.fecha,
    contact: {
      name: o.contacto?.nombre ?? '',
      email: o.contacto?.email ?? '',
      phone: o.contacto?.telefono ?? '',
    },
    items: o.items.map((i) => ({
      id: i.variante_sku,
      sku: i.variante_sku,
      product_sku: i.producto_sku ?? i.variante_sku,
      name: i.nombre_producto ?? i.variante_sku,
      variant_label: variantLabel(i.atributos, i.variante_sku),
      image: {
        url: i.imagen_url ?? skuImage(i.variante_sku),
        alt: `Foto de ${i.nombre_producto ?? i.variante_sku}`,
      },
      unit_price: toCents(i.precio_unitario_venta),
      qty: i.cantidad,
    })),
    totals: {
      subtotal: toCents(o.total),
      shipping: toCents(o.costo_envio),
      total: toCents(o.total_con_envio),
    },
    fulfillment: pickup
      ? { type: 'pickup', store_id: o.sucursal_id ?? '', store_name: o.sucursal_nombre ?? '' }
      : {
          type: 'ship',
          address_label: o.direccion_entrega ?? 'Envío a domicilio',
          tracking: o.numero_guia ?? undefined,
        },
    timeline,
    pickup_code: pickup ? (o.codigo_recoleccion ?? undefined) : undefined,
    payment_label: o.metodo_pago ? `Pago con ${o.metodo_pago}` : undefined,
    return_deadline: returnDeadline(o, now),
    returns: o.devoluciones.map((d) => ({ folio: d.folio, status: d.estado, created_at: d.fecha })),
  }
}

export function toOrderSummary(o: BOrder): OrderSummary {
  return {
    id: o.id,
    folio: o.folio,
    created_at: o.fecha,
    item_count: o.items.reduce((n, i) => n + i.cantidad, 0),
    fulfillment_label:
      o.tipo_envio === 'recoleccion_tienda'
        ? `Recoger en ${o.sucursal_nombre ?? 'sucursal'}`
        : 'Envío a domicilio',
    total: toCents(o.total_con_envio),
    status: toStatus(o.estado),
  }
}

/** La pasarela de pruebas del backend es una ruta del mismo origen: se abre como página, no dentro de la app. */
const absolute = (url: string) => (url.startsWith('/') ? `${window.location.origin}${url}` : url)

export function checkoutBody(cartId: string, input: CheckoutInput) {
  const ship = input.fulfillment === 'ship'
  const a = input.address
  return {
    carrito_id: cartId,
    tipo_envio: ship ? 'domicilio' : 'recoleccion_tienda',
    // En envío, el backend elige la sucursal que tiene todo el pedido.
    sucursal_id: ship ? undefined : input.store_id,
    direccion_id: ship ? input.address_id : undefined,
    direccion:
      ship && !input.address_id && a
        ? {
            calle: a.street,
            numero_exterior: a.ext,
            numero_interior: a.int || undefined,
            colonia: a.colony,
            codigo_postal: a.zip,
            ciudad: a.city,
            entidad: a.state,
            referencias: a.references || undefined,
          }
        : undefined,
    telefono_contacto: input.contact.phone || undefined,
  }
}

const ADDRESS_FIELDS: Record<string, string> = {
  'direccion.calle': 'address.street',
  'direccion.numero_exterior': 'address.ext',
  'direccion.colonia': 'address.colony',
  'direccion.codigo_postal': 'address.zip',
  'direccion.ciudad': 'address.city',
  'direccion.entidad': 'address.state',
}

async function checkout(input: CheckoutInput) {
  const cart = await bget<BCart>('/cart')
  try {
    const order = await bsend<BOrder>('post', '/checkout', checkoutBody(cart.id, input))
    return { order_id: order.id, folio: order.folio, payment_url: absolute(order.checkout_url ?? '') }
  } catch (error) {
    const e = toApiError(error)
    const fields = Object.fromEntries(
      Object.entries(e.fieldErrors).map(([k, v]) => [ADDRESS_FIELDS[k] ?? k, v]),
    )
    throw new ApiError(e.status, e.message, e.code, fields, e.data)
  }
}

async function myOrders(query: Record<string, string>) {
  const all = (await bget<BOrder[]>('/orders')).map(toOrderSummary)
  const group = query.status_group
  const filtered = group ? all.filter((o) => orderStatusInfo[o.status].group === group) : all
  const page = Number(query.page ?? 1)
  const pageSize = Number(query.page_size ?? 10)
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    page,
    page_size: pageSize,
    total: filtered.length,
  }
}

export const orderRoutes: Route[] = [
  {
    method: 'get',
    path: '/cart',
    handle: async ({ query }) => toCart(await bget<BCart>('/cart', store(query))),
  },
  {
    method: 'post',
    path: '/cart/items',
    handle: async ({ query, body }) => {
      const { sku, qty } = body as { sku: string; qty: number }
      return toCart(
        await bsend<BCart>('post', '/cart/items', { variante_sku: sku, cantidad: qty }, store(query)).catch(
          cartError,
        ),
      )
    },
  },
  {
    method: 'patch',
    path: '/cart/items/:id',
    handle: async ({ params, query, body }) =>
      toCart(
        await bsend<BCart>(
          'patch',
          `/cart/items/${encodeURIComponent(params.id)}`,
          { cantidad: (body as { qty: number }).qty },
          store(query),
        ).catch(cartError),
      ),
  },
  {
    method: 'delete',
    path: '/cart/items/:id',
    handle: async ({ params, query }) =>
      toCart(
        await bsend<BCart>('delete', `/cart/items/${encodeURIComponent(params.id)}`, undefined, store(query)),
      ),
  },
  {
    method: 'post',
    path: '/cart/merge',
    handle: async ({ body }) =>
      toCart(
        await bsend<BCart>('post', '/cart/merge', {
          carrito_invitado_id: (body as { guest_cart_id: string }).guest_cart_id,
        }),
      ),
  },
  { method: 'post', path: '/checkout', handle: ({ body }) => checkout(body as CheckoutInput) },
  { method: 'get', path: '/orders', handle: ({ query }) => myOrders(query) },
  {
    method: 'get',
    path: '/orders/:id',
    handle: async ({ params }) => toOrder(await bget<BOrder>(`/orders/${params.id}`)),
  },
  {
    method: 'post',
    path: '/orders/:id/payment/retry',
    handle: async ({ params }) => {
      const result = await bsend<{ checkout_url: string }>('post', `/orders/${params.id}/pago/reintentar`)
      return { payment_url: absolute(result.checkout_url) }
    },
  },
]
