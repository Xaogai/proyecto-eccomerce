import { describe, expect, it } from 'vitest'
import { cartSchema } from '../schemas/cart'
import { orderSchema, orderSummarySchema } from '../schemas/order'
import { toRefreshResponse, toUser } from './auth'
import { checkoutBody, toCart, toOrder, toOrderSummary, toPaymentStatus, toStatus } from './orders'

const pedido = {
  id: 'o1',
  folio: 'TSR-2026-1234-AB12',
  fecha: '2026-10-01T10:00:00Z',
  estado: 'entregado',
  total: '2499.00',
  costo_envio: '99.00',
  total_con_envio: '2598.00',
  tipo_envio: 'domicilio' as const,
  numero_guia: 'GUIA-1',
  estado_pago: 'aprobado',
  metodo_pago: 'tarjeta',
  checkout_url: null,
  contacto: { nombre: 'Ana Torres', email: 'ana@correo.com', telefono: null },
  direccion_entrega: 'Av. Juárez 1, Col. Centro, 50000 Toluca, Estado de México',
  sucursal_id: 's1',
  sucursal_nombre: 'Sucursal Toluca Centro',
  codigo_recoleccion: null,
  historial: [
    { estado: 'pendiente_pago', fecha: '2026-10-01T10:00:00Z' },
    { estado: 'pago_rechazado', fecha: '2026-10-01T10:01:00Z' },
    { estado: 'confirmado', fecha: '2026-10-01T10:05:00Z' },
    { estado: 'entregado', fecha: '2026-10-03T12:00:00Z' },
  ],
  devoluciones: [],
  fecha_entrega: '2026-10-03T12:00:00Z',
  items: [
    {
      variante_sku: 'TAL-20V-ROJ',
      cantidad: 1,
      precio_unitario_venta: '2499.00',
      nombre_producto: 'Taladro',
      atributos: { color: 'rojo' },
      imagen_url: null,
      producto_sku: 'TAL-20V-ROJ',
    },
  ],
}

describe('sesión', () => {
  it('convierte el perfil y la vigencia del token', () => {
    expect(
      toUser({
        id: 'u1',
        nombre: 'Carlos',
        email: 'c@x.com',
        tipo_usuario: 'staff',
        telefono: null,
        acepta_marketing: false,
        acepta_personalizacion: false,
        sucursal_id: 's1',
        sucursal_nombre: 'Sucursal Toluca Centro',
      }),
    ).toEqual({
      id: 'u1',
      name: 'Carlos',
      email: 'c@x.com',
      role: 'staff',
      branch_id: 's1',
      branch_name: 'Sucursal Toluca Centro',
    })
    expect(
      toRefreshResponse({ access_token: 'a', refresh_token: 'r', expires_in_minutes: 15 }).expires_in,
    ).toBe(900)
  })
})

describe('carrito', () => {
  it('usa el SKU como id del renglón y calcula stock y tope', () => {
    const cart = cartSchema.parse(
      toCart({
        id: 'c1',
        total: '4998.00',
        items: [
          {
            variante_sku: 'TAL-20V-ROJ',
            nombre_producto: 'Taladro',
            cantidad: 2,
            precio_unitario_vigente: '2499.00',
            imagen_url: null,
            atributos: { color: 'rojo' },
            producto_sku: 'TAL-20V-ROJ',
            stock_disponible: 0,
            stock_sucursal: 0,
          },
        ],
      }),
    )
    expect(cart.items[0]).toMatchObject({
      id: 'TAL-20V-ROJ',
      unit_price: 249900,
      max_qty: 1,
      stock_status: 'out',
    })
    expect(cart.subtotal).toBe(499800)
    expect(cart.warnings).toEqual([{ item_id: 'TAL-20V-ROJ', code: 'out_of_stock' }])
  })
})

describe('pedidos', () => {
  it('traduce los estados del backend', () => {
    expect(toStatus('confirmado')).toBe('pagado')
    expect(toStatus('pago_rechazado')).toBe('pendiente_pago')
    expect(toStatus('listo_para_recoger')).toBe('listo_para_recoger')
    expect(toPaymentStatus({ estado: 'pago_rechazado', estado_pago: 'rechazado' })).toBe('rechazado')
    expect(toPaymentStatus({ estado: 'pendiente_pago', estado_pago: 'procesando' })).toBe('pendiente')
    expect(toPaymentStatus({ estado: 'en_preparacion', estado_pago: null })).toBe('pagado')
  })

  it('arma el pedido con totales en centavos, línea de tiempo sin repetidos y plazo de devolución', () => {
    const order = orderSchema.parse(toOrder(pedido, new Date('2026-10-20').getTime()))
    expect(order.totals).toEqual({ subtotal: 249900, shipping: 9900, total: 259800 })
    expect(order.timeline.map((t) => t.status)).toEqual(['pendiente_pago', 'pagado', 'entregado'])
    expect(order.fulfillment).toEqual({
      type: 'ship',
      address_label: pedido.direccion_entrega,
      tracking: 'GUIA-1',
    })
    expect(order.return_deadline).toBe('2026-11-02T12:00:00.000Z')
    expect(toOrder(pedido, new Date('2026-12-01').getTime()).return_deadline).toBeNull()
  })

  it('en recoger en tienda muestra la sucursal y el código', () => {
    const order = toOrder({ ...pedido, tipo_envio: 'recoleccion_tienda', codigo_recoleccion: '4821' })
    expect(order.fulfillment).toEqual({
      type: 'pickup',
      store_id: 's1',
      store_name: 'Sucursal Toluca Centro',
    })
    expect(order.pickup_code).toBe('4821')
    expect(
      orderSummarySchema.parse(toOrderSummary({ ...pedido, tipo_envio: 'recoleccion_tienda' })),
    ).toMatchObject({
      fulfillment_label: 'Recoger en Sucursal Toluca Centro',
      total: 259800,
      item_count: 1,
    })
  })

  it('arma el checkout: en envío no manda sucursal y traduce la dirección', () => {
    const contact = { name: 'Ana', email: 'a@x.com', phone: '7221234567' }
    expect(checkoutBody('c1', { contact, fulfillment: 'pickup', store_id: 's1' })).toMatchObject({
      carrito_id: 'c1',
      tipo_envio: 'recoleccion_tienda',
      sucursal_id: 's1',
      telefono_contacto: '7221234567',
    })
    const ship = checkoutBody('c1', {
      contact,
      fulfillment: 'ship',
      store_id: 's1',
      address: {
        street: 'Hidalgo',
        ext: '12',
        colony: 'Centro',
        zip: '44100',
        city: 'Guadalajara',
        state: 'Jalisco',
      },
    })
    expect(ship.sucursal_id).toBeUndefined()
    expect(ship.direccion).toMatchObject({
      calle: 'Hidalgo',
      numero_exterior: '12',
      codigo_postal: '44100',
      entidad: 'Jalisco',
    })
    expect(checkoutBody('c1', { contact, fulfillment: 'ship', address_id: 'd1' })).toMatchObject({
      direccion_id: 'd1',
      direccion: undefined,
    })
  })
})
