// Cada ruta del contrato contra un backend falso: qué ruta del backend llama, con qué datos, y qué regresa.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../errors'
import { adminCategorySchema, adminOrderSchema, adminProductSchema, settingsSchema } from '../schemas/admin'
import { addressSchema, loginResponseSchema, userSchema } from '../schemas/auth'
import { inventoryPageSchema, pickupBoardSchema } from '../schemas/branch'
import { cartSchema } from '../schemas/cart'
import { compareSchema, productPageSchema, reviewPageSchema, searchSuggestSchema } from '../schemas/catalog'
import { orderPageSchema, orderSchema } from '../schemas/order'

type Call = { method: string; url: string; body?: unknown; headers?: Record<string, string> }
const calls: Call[] = []
let replies: Array<[RegExp, unknown]> = []

function reply(method: string, url: string): unknown {
  const key = `${method} ${url}`
  const hit = replies.find(([pattern]) => pattern.test(key))
  if (!hit) throw new Error(`Sin respuesta para ${key}`)
  const value = hit[1]
  if (value instanceof Error) throw value
  return typeof value === 'function' ? (value as () => unknown)() : value
}

vi.mock('./http', () => ({
  withQuery: (url: string) => url,
  bget: vi.fn(async (url: string, query?: Record<string, unknown>, headers?: Record<string, string>) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query ?? {})) {
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, String(x)))
      else if (v !== undefined && v !== null && v !== '') qs.append(k, String(v))
    }
    const full = qs.toString() ? `${url}?${qs}` : url
    calls.push({ method: 'get', url: full, headers })
    return reply('get', full)
  }),
  bsend: vi.fn(async (method: string, url: string, body?: unknown) => {
    calls.push({ method, url, body })
    return reply(method, url)
  }),
}))

const { translate } = await import('./index')
const { invalidate } = await import('./shared')

const variante = (sku: string, precio = '2499.00', stock = 10) => ({
  sku,
  producto_id: 'p1',
  atributos: { color: 'rojo' },
  precio,
  imagen_url: null,
  stock_disponible: stock,
  stock_sucursal: null,
})
const producto = {
  id: 'p1',
  categoria_id: 'c3',
  nombre: 'Taladro',
  descripcion: 'd',
  marca: 'Milwaukee',
  estado: 'publicado',
  especificaciones: { Voltaje: '20V' },
  imagenes: [],
  calificacion_promedio: 4.5,
  total_resenas: 2,
  ruta_categoria: [{ id: 'c1', nombre: 'Herramientas' }],
  variantes: [variante('TAL-1')],
}
const arbol = [
  {
    id: 'c1',
    nombre: 'Herramientas',
    categoria_padre_id: null,
    subcategorias: [{ id: 'c3', nombre: 'Taladros', categoria_padre_id: 'c1', subcategorias: [] }],
  },
]
const sucursal = {
  id: 's1',
  nombre: 'Sucursal Toluca Centro',
  direccion_id: null,
  calle: 'Juárez 1',
  ciudad: 'Toluca',
  codigo_postal: '50000',
  telefono: '722',
  horario: 'Diario',
  latitud: 19.2,
  longitud: -99.6,
  servicios: [],
}
const usuario = {
  id: 'u1',
  nombre: 'Ana Torres',
  email: 'ana@x.com',
  tipo_usuario: 'cliente',
  telefono: '722',
  acepta_marketing: true,
  acepta_personalizacion: false,
  sucursal_id: null,
  sucursal_nombre: null,
}
const carrito = {
  id: 'cart1',
  total: '2499.00',
  items: [
    {
      variante_sku: 'TAL-1',
      nombre_producto: 'Taladro',
      cantidad: 1,
      precio_unitario_vigente: '2499.00',
      imagen_url: null,
      atributos: {},
      producto_sku: 'TAL-1',
      stock_disponible: 5,
      stock_sucursal: 2,
    },
  ],
}
const pedido = {
  id: 'o1',
  folio: 'TSR-1',
  fecha: '2026-11-01T10:00:00Z',
  estado: 'confirmado',
  total: '2499.00',
  costo_envio: '0.00',
  total_con_envio: '2499.00',
  tipo_envio: 'recoleccion_tienda',
  numero_guia: null,
  estado_pago: 'aprobado',
  metodo_pago: 'tarjeta',
  checkout_url: '/api/v1/pagos/sandbox/ref1',
  contacto: { nombre: 'Ana', email: 'a@x.com', telefono: null },
  direccion_entrega: null,
  sucursal_id: 's1',
  sucursal_nombre: 'Sucursal Toluca Centro',
  codigo_recoleccion: '4821',
  historial: [{ estado: 'confirmado', fecha: '2026-11-01T10:00:00Z' }],
  devoluciones: [],
  fecha_entrega: null,
  items: [
    {
      variante_sku: 'TAL-1',
      cantidad: 1,
      precio_unitario_venta: '2499.00',
      nombre_producto: 'Taladro',
      atributos: {},
      imagen_url: null,
      producto_sku: 'TAL-1',
    },
  ],
}
const direccion = {
  id: 'd1',
  calle: 'Morelos',
  ciudad: 'Toluca',
  codigo_postal: '50000',
  es_predeterminada: true,
  alias: 'Casa',
  nombre_recibe: 'Ana',
  numero_exterior: '4',
  numero_interior: null,
  colonia: 'Centro',
  entidad: 'Méx',
  telefono: '722',
  referencias: null,
}
const tokens = { access_token: 'a', refresh_token: 'r', expires_in_minutes: 15 }
const page = <T>(items: T[]) => ({ page: 1, page_size: 20, total: items.length, items })
const backendError = (status: number, detail: unknown) =>
  Object.assign(new Error('backend'), {
    isAxiosError: true,
    response: { status, data: { detail } },
  })

const lastCall = () => calls[calls.length - 1]

beforeEach(() => {
  calls.length = 0
  invalidate('categories')
  invalidate('branches')
  replies = [
    [/^get \/categories$/, arbol],
    [/^get \/branches$/, [sucursal]],
  ]
})

describe('catálogo', () => {
  it('lista productos con la categoría por slug, la marca y los precios en pesos', async () => {
    replies.push([
      /^get \/products\?/,
      { ...page([producto]), facetas: [{ clave: 'marca', titulo: 'Marca', opciones: [] }] },
    ])
    const data = productPageSchema.parse(
      await translate('get', '/products', {
        category: 'taladros',
        'attr.brand': 'Bosch',
        price_max: '300000',
        store_id: 's1',
      }),
    )
    expect(calls.find((c) => c.url.startsWith('/products'))?.url).toBe(
      '/products?category=c3&sucursal_id=s1&max_price=3000.00&marca=Bosch',
    )
    expect(data.facets[0].key).toBe('brand')
    expect(data.items[0].stock.label).toContain('Sucursal Toluca Centro')
  })

  it('no pide todo el catálogo si la categoría ya no existe', async () => {
    const data = await translate('get', '/products', { category: 'no-existe', page_size: '12' })
    expect(data).toMatchObject({ total: 0, page_size: 12 })
    expect(calls.some((c) => c.url.startsWith('/products'))).toBe(false)
  })

  it('arma sugerencias, ficha, comparador, reseñas, sucursales y envío', async () => {
    replies.push(
      [/^get \/products\?q=/, page([producto])],
      [/^get \/products\/TAL-1(\?|$)/, producto],
      [/^get \/products\/X-1/, new Error('404')],
      [
        /^get \/products\/TAL-1\/resenas/,
        { ...page([]), resumen: { promedio: 0, total: 0, por_estrellas: [0, 0, 0, 0, 0] } },
      ],
      [/^post \/products\/TAL-1\/resenas/, { id: 'r1' }],
      [
        /^get \/inventory\/TAL-1/,
        [
          {
            sucursal_id: 's1',
            sucursal_nombre: 'T',
            variante_sku: 'TAL-1',
            cantidad_disponible: 3,
            cantidad_reservada: 0,
          },
        ],
      ],
      [
        /^get \/shipping\/quote/,
        { codigo_postal: '50000', costo_domicilio: '99.00', dias_estimados_entrega: 2 },
      ],
    )
    const suggest = searchSuggestSchema.parse(await translate('get', '/search/suggest', { q: 'tala' }))
    expect(suggest.categories).toEqual([{ slug: 'taladros', name: 'Taladros' }])
    expect(await translate('get', '/products/TAL-1')).toMatchObject({ sku: 'TAL-1', brand: 'Milwaukee' })
    const cmp = compareSchema.parse(
      await translate('get', '/products/compare', { skus: 'TAL-1,X-1', store_id: 's1' }),
    )
    expect(cmp.products).toHaveLength(1)
    expect(cmp.rows.at(-1)?.key).toBe('today')
    reviewPageSchema.parse(await translate('get', '/products/TAL-1/reviews', { page: 1, page_size: 5 }))
    await translate('post', '/products/TAL-1/reviews', undefined, {
      rating: 5,
      title: 'Bien',
      body: 'Muy bien',
    })
    expect(lastCall().body).toEqual({ calificacion: 5, titulo: 'Bien', comentario: 'Muy bien' })
    const stores = (await translate('get', '/stores', {
      q: 'toluca',
      sku: 'TAL-1',
      skus: 'TAL-1:2',
    })) as Array<Record<string, unknown>>
    expect(stores[0]).toMatchObject({
      stock: { qty: 3, status: 'low' },
      all_available: true,
      available_count: 1,
    })
    expect(await translate('get', '/shipping/quote', { zip: '50000' })).toMatchObject({ cost: 9900 })
    replies.push([/^get \/categories$/, arbol])
    expect(await translate('get', '/categories')).toHaveLength(1)
    replies.push([/^get \/funciones$/, { cmp: true }])
    expect(await translate('get', '/feature-flags')).toEqual({ cmp: true })
  })
})

describe('sesión', () => {
  it('inicia sesión pidiendo el perfil con el token nuevo y traduce los errores', async () => {
    replies.push([/^post \/auth\/login$/, tokens], [/^get \/users\/me$/, usuario])
    const res = loginResponseSchema.parse(
      await translate('post', '/auth/login', undefined, { email: 'a', password: 'b' }),
    )
    expect(res.expires_in).toBe(900)
    expect(res.refresh_token).toBeUndefined()
    expect(calls[0].body).toEqual({ email: 'a', password: 'b', recordar: false })
    expect(lastCall().headers).toEqual({ Authorization: 'Bearer a' })

    replies.unshift([
      /^post \/auth\/login$/,
      backendError(429, { code: 'account_locked', message: 'Bloqueada', reintentar_en_s: 900 }),
    ])
    await expect(translate('post', '/auth/login', undefined, {})).rejects.toMatchObject({
      status: 423,
      code: 'account_locked',
      data: { retry_after_s: 900 },
    })
  })

  it('registra, renueva, cierra sesión, recupera y cambia la contraseña', async () => {
    replies.push(
      [/^post \/auth\/register$/, usuario],
      [/^post \/auth\/login$/, tokens],
      [/^get \/users\/me$/, usuario],
      [/^post \/auth\/refresh$/, tokens],
      [/^post \/auth\/logout$/, {}],
      [/^post \/auth\/password-reset\/request$/, {}],
      [/^post \/users\/me\/password$/, {}],
    )
    await translate('post', '/auth/register', undefined, {
      name: 'Ana',
      email: 'a@x.com',
      password: '12345678',
      privacy_accepted: true,
    })
    expect(calls[0].body).toMatchObject({
      nombre: 'Ana',
      acepta_aviso_privacidad: true,
      acepta_marketing: false,
    })
    expect(await translate('post', '/auth/refresh', undefined, { refresh_token: 'r' })).toMatchObject({
      expires_in: 900,
    })
    expect(await translate('post', '/auth/logout', undefined, { refresh_token: 'r' })).toBeNull()
    await translate('post', '/auth/password/forgot', undefined, { email: 'a@x.com' })
    userSchema.parse(await translate('get', '/me'))
    await translate('post', '/me/password', undefined, { current: 'a', password: 'b' })
    expect(lastCall().body).toEqual({ password_actual: 'a', password_nueva: 'b' })

    replies.unshift([
      /^post \/users\/me\/password$/,
      backendError(400, { code: 'wrong_password', message: 'No' }),
    ])
    await expect(
      translate('post', '/me/password', undefined, { current: 'x', password: 'y' }),
    ).rejects.toMatchObject({
      fieldErrors: { current: 'No' },
    })
    replies.unshift([
      /^post \/auth\/password-reset\/confirm$/,
      backendError(401, 'El token ha sido revocado'),
    ])
    await expect(
      translate('post', '/auth/password/reset', undefined, { token: 't', password: 'p' }),
    ).rejects.toMatchObject({
      status: 410,
      code: 'token_expired',
    })
  })
})

describe('compra y pedidos', () => {
  it('maneja el carrito por SKU con la sucursal y la unión del invitado', async () => {
    replies.push(
      [/^get \/cart/, carrito],
      [/^post \/cart\/items$/, carrito],
      [/^patch \/cart\/items\/TAL-1$/, carrito],
      [/^delete \/cart\/items\/TAL-1$/, carrito],
      [/^post \/cart\/merge$/, carrito],
    )
    cartSchema.parse(await translate('get', '/cart', { store_id: 's1' }))
    expect(lastCall().url).toBe('/cart?sucursal_id=s1')
    await translate('post', '/cart/items', undefined, { sku: 'TAL-1', qty: 2 })
    expect(lastCall().body).toEqual({ variante_sku: 'TAL-1', cantidad: 2 })
    await translate('patch', '/cart/items/TAL-1?store_id=s1', undefined, { qty: 3 })
    await translate('delete', '/cart/items/TAL-1')
    await translate('post', '/cart/merge', undefined, { guest_cart_id: 'g1' })
    expect(lastCall().body).toEqual({ carrito_invitado_id: 'g1' })

    replies.unshift([
      /^post \/cart\/items$/,
      backendError(409, { code: 'out_of_stock', message: 'Solo hay 5', disponibles: 5 }),
    ])
    await expect(translate('post', '/cart/items', undefined, { sku: 'TAL-1', qty: 9 })).rejects.toMatchObject(
      {
        code: 'out_of_stock',
        data: { available: 5 },
      },
    )
  })

  it('hace checkout con la pasarela en URL absoluta, lista y reintenta el pago', async () => {
    replies.push(
      [/^get \/cart$/, carrito],
      [/^post \/checkout$/, pedido],
      [/^get \/orders$/, [pedido, { ...pedido, id: 'o2', estado: 'entregado' }]],
      [/^get \/orders\/o1$/, pedido],
      [/^post \/orders\/o1\/pago\/reintentar$/, { checkout_url: '/api/v1/pagos/sandbox/ref2' }],
    )
    const result = (await translate('post', '/checkout', undefined, {
      contact: { name: 'Ana', email: 'a@x.com', phone: '' },
      fulfillment: 'pickup',
      store_id: 's1',
    })) as { payment_url: string }
    expect(result.payment_url).toBe(`${window.location.origin}/api/v1/pagos/sandbox/ref1`)
    const lista = orderPageSchema.parse(
      await translate('get', '/orders', { status_group: 'curso', page: 1, page_size: 10 }),
    )
    expect(lista.total).toBe(1)
    orderSchema.parse(await translate('get', '/orders/o1'))
    expect(await translate('post', '/orders/o1/payment/retry')).toEqual({
      payment_url: `${window.location.origin}/api/v1/pagos/sandbox/ref2`,
    })

    replies.unshift([
      /^post \/checkout$/,
      backendError(422, [{ loc: ['body', 'direccion', 'codigo_postal'], msg: 'CP inválido' }]),
    ])
    await expect(
      translate('post', '/checkout', undefined, {
        contact: { name: '', email: '', phone: '' },
        fulfillment: 'ship',
      }),
    ).rejects.toMatchObject({ fieldErrors: { 'address.zip': 'CP inválido' } })
  })
})

describe('Mi cuenta', () => {
  it('direcciones, deseos, perfil, consentimientos y ARCO', async () => {
    replies.push(
      [/^get \/users\/me\/addresses$/, [direccion]],
      [/^post \/users\/me\/addresses$/, direccion],
      [/^patch \/users\/me\/addresses\/d1$/, direccion],
      [/^delete \/users\/me\/addresses\/d1$/, null],
      [/^get \/users\/me\/deseos$/, [{ variante_sku: 'TAL-1', precio_guardado: '2999.00', producto }]],
      [/^post \/users\/me\/deseos$/, []],
      [/^delete \/users\/me\/deseos\/TAL-1$/, []],
      [/^get \/users\/me$/, usuario],
      [/^put \/users\/me$/, usuario],
      [/^patch \/users\/me\/consentimientos$/, { acepta_marketing: false, acepta_personalizacion: true }],
      [/^post \/users\/me\/solicitudes-arco$/, { folio: 'ARCO-1', fecha_limite: '2026-12-01T00:00:00Z' }],
    )
    addressSchema.parse(((await translate('get', '/me/addresses')) as unknown[])[0])
    await translate('post', '/me/addresses', undefined, { street: 'Morelos', zip: '50000' })
    expect(lastCall().body).toEqual({ calle: 'Morelos', codigo_postal: '50000' })
    await translate('patch', '/me/addresses/d1', undefined, { is_default: true })
    expect(await translate('delete', '/me/addresses/d1')).toBeNull()
    expect(((await translate('get', '/me/wishlist')) as Array<{ saved_price: number }>)[0].saved_price).toBe(
      299900,
    )
    await translate('post', '/me/wishlist', undefined, { sku: 'TAL-1' })
    await translate('delete', '/me/wishlist/TAL-1')
    expect(await translate('get', '/me/profile')).toEqual({
      name: 'Ana Torres',
      email: 'ana@x.com',
      phone: '722',
    })
    await translate('patch', '/me/profile', undefined, { name: 'Ana', phone: '1' })
    expect(lastCall().body).toEqual({ nombre: 'Ana', telefono: '1' })
    expect(await translate('get', '/me/consents')).toEqual({ marketing: true, personalization: false })
    expect(await translate('patch', '/me/consents', undefined, { personalization: true })).toEqual({
      marketing: false,
      personalization: true,
    })
    expect(await translate('post', '/me/arco', undefined, { type: 'acceso' })).toEqual({
      folio: 'ARCO-1',
      due_date: '2026-12-01T00:00:00Z',
    })
  })

  it('baja de cuenta con pedidos en curso y devolución con foto', async () => {
    replies.push([
      /^delete \/users\/me$/,
      backendError(409, {
        code: 'active_orders',
        message: 'En curso',
        pedidos: [{ id: 'o1', folio: 'TSR-1', estado: 'confirmado' }],
      }),
    ])
    await expect(translate('delete', '/me', undefined, { password: 'x' })).rejects.toMatchObject({
      data: { orders: [{ id: 'o1', folio: 'TSR-1', status: 'pagado' }] },
    })
    replies.unshift([/^delete \/users\/me$/, { fecha_efectiva: '2026-11-04T00:00:00Z' }])
    expect(await translate('delete', '/me', undefined, { password: 'x' })).toEqual({
      effective_date: '2026-11-04T00:00:00Z',
    })

    replies.push([
      /^post \/orders\/o1\/devoluciones$/,
      {
        id: 'r1',
        folio: 'DEV-1',
        estado: 'en_revision',
        instrucciones: 'Lleva el producto',
        monto_reembolso: '100.00',
      },
    ])
    const form = new FormData()
    form.append(
      'data',
      JSON.stringify({ items: [{ item_id: 'TAL-1', qty: 1 }], reason: 'danado', method: 'tienda' }),
    )
    form.append('photo', new Blob(['x'], { type: 'image/png' }))
    expect(await translate('post', '/orders/o1/returns', undefined, form)).toMatchObject({
      folio: 'DEV-1',
      refund: 10000,
    })
    const sent = lastCall().body as FormData
    expect(JSON.parse(String(sent.get('data')))).toEqual({
      articulos: [{ variante_sku: 'TAL-1', cantidad: 1 }],
      motivo: 'danado',
      comentario: null,
      metodo: 'tienda',
    })
    expect(sent.get('foto')).toBeInstanceOf(Blob)
  })
})

describe('alta de personal', () => {
  it('manda el alta con los nombres del backend y regresa la contraseña temporal', async () => {
    replies.push([
      /^post \/admin\/users$/,
      {
        id: 'u9',
        nombre: 'Sofía Treviño',
        email: 'sofia@x.com',
        tipo_usuario: 'staff',
        sucursal_id: 's1',
        password_temporal: 'Abc-2345xyzQ',
      },
    ])
    const created = await translate('post', '/admin/users', undefined, {
      name: 'Sofía Treviño',
      email: 'sofia@x.com',
      role: 'staff',
      branch_id: 's1',
    })
    expect(lastCall().body).toEqual({
      nombre: 'Sofía Treviño',
      email: 'sofia@x.com',
      tipo_usuario: 'staff',
      sucursal_id: 's1',
    })
    expect(created).toEqual({
      id: 'u9',
      name: 'Sofía Treviño',
      email: 'sofia@x.com',
      role: 'staff',
      branch_id: 's1',
      temporary_password: 'Abc-2345xyzQ',
    })
  })

  it('el error de sucursal llega con el nombre del campo del formulario', async () => {
    replies.push([
      /^post \/admin\/users$/,
      backendError(422, [
        { loc: ['body', 'sucursal_id'], msg: 'El staff necesita una sucursal.', type: 'value_error' },
      ]),
    ])
    const error = await translate('post', '/admin/users', undefined, {
      name: 'X Y',
      email: 'x@y.com',
      role: 'staff',
      branch_id: null,
    }).catch((e: unknown) => e)
    expect((error as { fieldErrors: Record<string, string> }).fieldErrors.branch_id).toBe(
      'El staff necesita una sucursal.',
    )
  })
})

describe('administración', () => {
  const adminProduct = {
    id: 'p1',
    sku: 'TAL-1',
    nombre: 'Taladro',
    marca: 'M',
    categoria_id: 'c3',
    descripcion: '',
    especificaciones: {},
    imagenes: [],
    variantes: [{ sku: 'TAL-1', etiqueta: 'Única', precio: '10.00', stock_total: 1 }],
    estado: 'borrador',
  }
  const adminOrder = {
    ...pedido,
    transiciones_permitidas: ['en_preparacion', 'cancelado'],
    avisos_pasarela: [{ fecha: '2026-11-01T10:00:00Z', evento: 'Pago aprobado', resultado: 'Procesado' }],
    registro: [{ fecha: '2026-11-01T10:00:00Z', de: null, a: 'confirmado', actor: 'Pasarela', nota: null }],
  }

  it('productos, imágenes y categorías', async () => {
    replies.push(
      [
        /^get \/admin\/products\?/,
        {
          ...page([
            {
              ...adminProduct,
              total_variantes: 1,
              precio_desde: null,
              stock_total: 0,
              categoria: 'Taladros',
            },
          ]),
          conteos: { todos: 1 },
        },
      ],
      [/^post \/admin\/products$/, adminProduct],
      [/^get \/admin\/products\/p1$/, adminProduct],
      [/^patch \/admin\/products\/p1$/, adminProduct],
      [/^post \/admin\/products\/p1\/(publicar|despublicar)$/, adminProduct],
      [
        /^post \/admin\/products\/p1\/imagenes$/,
        { url: '/api/v1/media/productos/a.png', texto_alternativo: 'Alt' },
      ],
      [
        /^get \/admin\/categories$/,
        [{ id: 'c1', nombre: 'Herramientas', total_productos: 1, subcategorias: [] }],
      ],
      [/^post \/admin\/categories$/, { id: 'c9', nombre: 'Jardín' }],
      [/^patch \/admin\/categories\/c9$/, { id: 'c9', nombre: 'Jardinería' }],
      [/^delete \/admin\/categories\/c9$/, null],
    )
    const rows = (await translate('get', '/admin/products', {
      category: 'taladros',
      status: 'borrador',
    })) as {
      items: Array<{ category: string; price_from: number | null }>
    }
    expect(lastCall().url).toBe('/admin/products?categoria_id=c3&estado=borrador')
    expect(rows.items[0]).toMatchObject({ category: 'taladros', price_from: null })
    const input = {
      name: 'Taladro',
      brand: 'M',
      category: 'taladros',
      description: '',
      attrs: {},
      variants: [{ label: 'Única', price: 1000, stock_total: 1 }],
    }
    adminProductSchema.parse(await translate('post', '/admin/products', undefined, input))
    expect(lastCall().body).toMatchObject({
      categoria_id: 'c3',
      variantes: [{ etiqueta: 'Única', precio: '10.00' }],
    })
    await translate('get', '/admin/products/p1')
    await translate('patch', '/admin/products/p1', undefined, input)
    await translate('post', '/admin/products/p1/publish')
    await translate('post', '/admin/products/p1/unpublish')
    const form = new FormData()
    form.append('file', new Blob(['x'], { type: 'image/png' }))
    form.append('alt', 'Alt')
    expect(await translate('post', '/admin/products/p1/images', undefined, form)).toEqual({
      url: '/api/v1/media/productos/a.png',
      alt: 'Alt',
    })
    adminCategorySchema.parse(((await translate('get', '/admin/categories')) as unknown[])[0])
    expect(
      await translate('post', '/admin/categories', undefined, { name: 'Jardín', parent_id: null }),
    ).toEqual({
      id: 'c9',
      slug: 'jardin',
      name: 'Jardín',
    })
    await translate('patch', '/admin/categories/c9', undefined, { name: 'Jardinería' })
    await translate('delete', '/admin/categories/c9')
    const antes = calls.filter((c) => c.url === '/categories').length
    await translate('get', '/admin/products', { category: 'taladros' })
    expect(calls.filter((c) => c.url === '/categories').length).toBe(antes + 1)
  })

  it('pedidos, usuarios, reportes, configuración y resumen', async () => {
    replies.push(
      [
        /^get \/admin\/orders\?/,
        {
          ...page([
            {
              id: 'o1',
              folio: 'TSR-1',
              cliente: 'Ana',
              email: 'a',
              entrega: 'Recoger',
              fecha: '2026-11-01T10:00:00Z',
              total: '1.00',
              estado: 'confirmado',
            },
          ]),
          conteos: { todos: 1 },
        },
      ],
      [/^get \/admin\/orders\/o1$/, adminOrder],
      [/^post \/admin\/orders\/o1\/estado$/, adminOrder],
      [
        /^get \/admin\/users\?/,
        page([{ ...usuario, ultimo_acceso: null, bloqueado: false, activo: false, es_yo: true }]),
      ],
      [/^post \/admin\/users\/u1\/(desactivar|reactivar)$/, { id: 'u1' }],
      [
        /^post \/admin\/users\/u1\/password-temporal$/,
        { id: 'u1', email: 'x@y.com', password_temporal: 'Tmp-1234abcd' },
      ],
      [/^patch \/admin\/users\/u1$/, { id: 'u1' }],
      [/^post \/admin\/users\/u1\/desbloquear$/, { id: 'u1' }],
      [
        /^get \/admin\/reports\?periodo=30d$/,
        {
          periodo: '30d',
          desde: 'a',
          hasta: 'b',
          ventas: '0',
          pedidos: 0,
          ticket_promedio: '0',
          pagos_rechazados: 0,
          por_departamento: [],
          sucursales: [],
        },
      ],
      [
        /^(get|patch) \/admin\/settings$/,
        {
          funciones: {},
          pago: { proveedor: 'p', modo: 'sandbox', llave_pista: '…1' },
          envios: { tarifas: [], envio_gratis_desde: '1500.00' },
          seguridad: { intentos_maximos: 5, minutos_bloqueo: 15, minutos_sesion: 15, minutos_reserva: 15 },
        },
      ],
      [/^get \/admin\/dashboard$/, { indicadores: {}, alertas: [], ventas_por_dia: [] }],
    )
    const orders = (await translate('get', '/admin/orders', { status_group: 'prep', days: 7 })) as {
      items: Array<{ status: string }>
    }
    expect(lastCall().url).toBe('/admin/orders?dias=7&grupo=prep')
    expect(orders.items[0].status).toBe('pagado')
    expect(adminOrderSchema.parse(await translate('get', '/admin/orders/o1')).allowed_transitions).toEqual([
      'en_preparacion',
      'cancelado',
    ])
    await translate('post', '/admin/orders/o1/status', undefined, { to: 'pagado', note: 'x' })
    expect(lastCall().body).toEqual({ estado: 'confirmado', nota: 'x' })
    const users = (await translate('get', '/admin/users', { role: 'admin' })) as {
      items: Array<{ active: boolean }>
    }
    expect(users.items[0].active).toBe(false)
    await translate('post', '/admin/users/u1/disable')
    expect(lastCall().url).toBe('/admin/users/u1/desactivar')
    await translate('post', '/admin/users/u1/enable')
    expect(lastCall().url).toBe('/admin/users/u1/reactivar')
    expect(await translate('post', '/admin/users/u1/temporary-password')).toEqual({
      temporary_password: 'Tmp-1234abcd',
    })
    await translate('patch', '/admin/users/u1', undefined, { role: 'staff', branch_id: 's1' })
    expect(lastCall().body).toEqual({ tipo_usuario: 'staff', sucursal_id: 's1' })
    await translate('post', '/admin/users/u1/unlock')
    await translate('get', '/admin/reports', { period: '30d' })
    settingsSchema.parse(await translate('get', '/admin/settings'))
    await translate('patch', '/admin/settings', undefined, { flags: { cmp: false } })
    await translate('get', '/admin/dashboard')
  })
})

describe('sucursal', () => {
  it('inventario, ajuste, tablero, verificación y entrega', async () => {
    const fila = {
      sku: 'TAL-1',
      nombre: 'T',
      etiqueta: 'Única',
      pasillo: '14-A',
      piezas: 3,
      apartadas: 0,
      minimo: 5,
      estado: 'low',
    }
    const recoger = {
      id: 'o1',
      folio: 'TSR-1',
      cliente: 'Ana T.',
      estado: 'listo_para_recoger',
      piezas: 1,
      ubicacion: 'Estante R-01',
      pagado_en: 'a',
      listo_en: null,
      entregado_en: null,
      atrasado: false,
      transiciones: [],
    }
    const entrega = {
      id: 'o1',
      folio: 'TSR-1',
      cliente: 'Ana',
      email: 'a',
      estante: 'R-01',
      pago: 'tarjeta',
      productos: [],
      estado: 'entregado',
    }
    replies.push(
      [
        /^get \/sucursal\/inventario/,
        { sucursal: { id: 's1', nombre: 'Toluca' }, ...page([fila]), conteos: { todos: 1, low: 1, out: 0 } },
      ],
      [/^post \/sucursal\/inventario\/TAL-1\/ajuste$/, fila],
      [
        /^get \/sucursal\/recolecciones/,
        { sucursal: { id: 's1', nombre: 'Toluca' }, por_preparar: [], listos: [recoger], entregados_hoy: [] },
      ],
      [/^post \/sucursal\/recolecciones\/verificar$/, entrega],
      [/^post \/sucursal\/recolecciones\/o1\/estado$/, recoger],
      [/^post \/sucursal\/recolecciones\/o1\/entregar$/, entrega],
    )
    inventoryPageSchema.parse(await translate('get', '/branch/inventory', { store_id: 's1', status: 'low' }))
    expect(lastCall().url).toBe('/sucursal/inventario?sucursal_id=s1&estado=low')
    await translate('post', '/branch/inventory/TAL-1/adjust', undefined, { delta: -1, reason: 'Merma' })
    expect(lastCall().body).toEqual({ delta: -1, motivo: 'Merma' })
    pickupBoardSchema.parse(await translate('get', '/branch/pickups'))
    await translate('post', '/branch/pickups/verify', undefined, { pickup_code: '4821' })
    await translate('post', '/branch/pickups/o1/status', undefined, { to: 'listo_para_recoger' })
    await translate('post', '/branch/pickups/o1/handover', undefined, {
      pickup_code: '4821',
      id_checked: true,
      items_checked: true,
    })
    expect(lastCall().body).toEqual({
      codigo: '4821',
      identificacion_revisada: true,
      productos_revisados: true,
    })

    replies.unshift([
      /^post \/sucursal\/inventario\/TAL-1\/ajuste$/,
      backendError(409, { code: 'below_reserved', message: 'No', apartadas: 2 }),
    ])
    await expect(
      translate('post', '/branch/inventory/TAL-1/adjust', undefined, { delta: -9, reason: 'x' }),
    ).rejects.toBeInstanceOf(ApiError)
  })
})
