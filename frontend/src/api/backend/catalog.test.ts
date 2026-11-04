import { describe, expect, it } from 'vitest'
import { productDetailSchema, productSummarySchema } from '../schemas/catalog'
import { storeSchema } from '../schemas/store'
import {
  buildComparison,
  productQuery,
  stockStatus,
  toDetail,
  toShippingQuote,
  toStore,
  toSummary,
} from './catalog'
import { register, translate } from './router'
import { slugify, toCents, toPesos, variantLabel } from './shared'
import type { BProduct, BStore } from './types'

const taladro: BProduct = {
  id: 'p1',
  categoria_id: 'c3',
  nombre: 'Taladro Inalámbrico Percutor 20V',
  descripcion: 'Motor sin escobillas.',
  marca: 'Milwaukee',
  estado: 'publicado',
  especificaciones: { Marca: 'Milwaukee', Voltaje: '20V' },
  imagenes: [],
  calificacion_promedio: 4.5,
  total_resenas: 2,
  ruta_categoria: [
    { id: 'c1', nombre: 'Herramientas' },
    { id: 'c2', nombre: 'Herramientas Eléctricas' },
  ],
  variantes: [
    {
      sku: 'TAL-20V-ROJ',
      producto_id: 'p1',
      atributos: { color: 'rojo', voltaje: '20V' },
      precio: '2499.00',
      imagen_url: null,
      stock_disponible: 35,
      stock_sucursal: 0,
    },
    {
      sku: 'TAL-20V-AMA',
      producto_id: 'p1',
      atributos: { color: 'amarillo', voltaje: '20V' },
      precio: '2799.00',
      imagen_url: null,
      stock_disponible: 15,
      stock_sucursal: 3,
    },
  ],
}

describe('conversiones del backend', () => {
  it('pasa pesos a centavos y de regreso', () => {
    expect(toCents('2499.00')).toBe(249900)
    expect(toCents(99.9)).toBe(9990)
    expect(toPesos(150000)).toBe('1500.00')
  })

  it('arma el slug sin acentos y la etiqueta de la variante', () => {
    expect(slugify('Herramientas Eléctricas')).toBe('herramientas-electricas')
    expect(slugify('Taladros y Rotomartillos')).toBe('taladros-y-rotomartillos')
    expect(variantLabel({ color: 'rojo', voltaje: '20V' }, 'X')).toBe('Rojo · 20V')
    expect(variantLabel({}, 'SKU-1')).toBe('SKU-1')
  })

  it('clasifica el stock como en los datos simulados', () => {
    expect(stockStatus(0)).toBe('out')
    expect(stockStatus(5)).toBe('low')
    expect(stockStatus(6)).toBe('ok')
  })
})

describe('productos', () => {
  it('resume el producto con el precio desde, la variante con stock y la imagen del SKU', () => {
    const summary = productSummarySchema.parse(toSummary(taladro, 'Sucursal Toluca Centro'))
    expect(summary).toMatchObject({
      sku: 'TAL-20V-ROJ',
      variant_sku: 'TAL-20V-AMA',
      brand: 'Milwaukee',
      price: 249900,
      price_from: 249900,
      variant_count: 2,
      stock: { status: 'low', label: 'Quedan 3 en Sucursal Toluca Centro' },
      rating: { avg: 4.5, count: 2 },
    })
    expect(summary.image.url).toBe('/api/v1/product-image/TAL-20V-ROJ.svg')
  })

  it('sin sucursal usa el stock total', () => {
    expect(
      toSummary({ ...taladro, variantes: taladro.variantes.map((v) => ({ ...v, stock_sucursal: null })) })
        .stock,
    ).toEqual({ status: 'ok', label: 'Disponible en sucursales' })
  })

  it('arma la ficha con ruta de categorías, variantes y especificaciones', () => {
    const detail = productDetailSchema.parse(toDetail(taladro, 'suc-1'))
    expect(detail.category_path).toEqual([
      { slug: 'herramientas', name: 'Herramientas' },
      { slug: 'herramientas-electricas', name: 'Herramientas Eléctricas' },
    ])
    expect(detail.variants[1]).toEqual({
      sku: 'TAL-20V-AMA',
      label: 'Amarillo · 20V',
      price: 279900,
      stock: { store_id: 'suc-1', qty: 3, status: 'low' },
    })
    expect(detail.specs).toContainEqual({ k: 'Voltaje', v: '20V' })
  })

  it('traduce los filtros del listado (marca, atributos, precios en centavos y orden)', async () => {
    await expect(
      productQuery({
        q: 'taladro',
        page: '2',
        sort: 'precio_asc',
        store_id: 's1',
        pickup_today: 'true',
        price_min: '100000',
        'attr.brand': 'Bosch,DeWalt',
        'attr.color': 'rojo',
      }),
    ).resolves.toMatchObject({
      q: 'taladro',
      page: '2',
      orden: 'precio_asc',
      sucursal_id: 's1',
      disponible_hoy: true,
      min_price: '1000.00',
      marca: 'Bosch,DeWalt',
      atributo: ['color:rojo'],
    })
  })

  it('compara marcando las filas que difieren', () => {
    const a = toDetail(taladro, null)
    const b = { ...a, brand: 'Bosch', specs: [{ k: 'Voltaje', v: '18V' }] }
    const result = buildComparison([a, b], [toSummary(taladro), toSummary(taladro)], null)
    expect(result.rows.find((r) => r.key === 'brand')).toMatchObject({
      values: ['Milwaukee', 'Bosch'],
      differs: true,
    })
    expect(result.rows.find((r) => r.key === 'Voltaje')).toMatchObject({
      values: ['20V', '18V'],
      differs: true,
    })
  })
})

describe('sucursales y envío', () => {
  it('arma la sucursal con dirección y servicios', () => {
    const b: BStore = {
      id: 's1',
      nombre: 'Sucursal Toluca Centro',
      direccion_id: 'd1',
      calle: 'Av. Benito Juárez 210',
      ciudad: 'Toluca',
      codigo_postal: '50000',
      telefono: '722 214 5500',
      horario: 'Lun a dom',
      latitud: 19.29,
      longitud: -99.65,
      servicios: ['Recoger en tienda'],
    }
    expect(storeSchema.parse(toStore(b))).toMatchObject({
      address: 'Av. Benito Juárez 210, Toluca',
      zip: '50000',
    })
  })

  it('pasa la cotización a centavos con rango de días', () => {
    expect(
      toShippingQuote({ codigo_postal: '50000', costo_domicilio: '99.00', dias_estimados_entrega: 2 }),
    ).toEqual({
      zip: '50000',
      available: true,
      cost: 9900,
      eta_min_days: 1,
      eta_max_days: 2,
    })
  })
})

describe('router de traducción', () => {
  it('encuentra la ruta, decodifica los segmentos y une los parámetros', async () => {
    register([{ method: 'get', path: '/prueba/:sku', handle: async (ctx) => ctx }])
    await expect(translate('get', '/prueba/A%2FB?x=1', { y: 2 })).resolves.toEqual({
      params: { sku: 'A/B' },
      query: { x: '1', y: '2' },
      body: undefined,
    })
  })

  it('responde 501 si la ruta no existe en el backend', async () => {
    await expect(translate('delete', '/no-existe')).rejects.toMatchObject({
      status: 501,
      code: 'not_implemented',
    })
  })
})
