import { describe, expect, it } from 'vitest'
import { listProducts, parseQuery, stockFor, suggest, suggestCorrection } from './catalog'
import { db } from './store'

const query = (qs: string) => parseQuery(new URL(`http://x/api/v1/products?${qs}`))

describe('catálogo simulado (EP-02)', () => {
  it('una categoría incluye a sus subcategorías', () => {
    const taladros = listProducts(query('category=taladros&page_size=96')).total
    const herramientas = listProducts(query('category=herramientas&page_size=96')).total
    expect(taladros).toBeGreaterThan(40)
    expect(herramientas).toBeGreaterThan(taladros)
  })

  it('cada faceta cuenta sin aplicar su propio filtro, para poder combinar marcas', () => {
    const page = listProducts(query('category=taladros&attr.brand=Volta'))
    const brand = page.facets.find((f) => f.key === 'brand')!
    expect(brand.options.find((o) => o.value === 'Volta')?.selected).toBe(true)
    expect(brand.options.filter((o) => o.count > 0).length).toBeGreaterThan(1)
    expect(page.items.every((p) => p.brand === 'Volta')).toBe(true)
  })

  it('filtra por precio en centavos y ordena por precio', () => {
    const page = listProducts(query('category=taladros&price_max=100000&sort=precio_asc&page_size=96'))
    const prices = page.items.map((p) => p.price)
    expect(prices.every((p) => p <= 100000)).toBe(true)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
  })

  it('pagina con page y page_size', () => {
    const all = listProducts(query('category=taladros&page_size=96'))
    const second = listProducts(query('category=taladros&page=2&page_size=10'))
    expect(second.items.map((p) => p.sku)).toEqual(all.items.slice(10, 20).map((p) => p.sku))
  })

  it('"recoger hoy" deja solo lo que tiene stock en la sucursal', () => {
    const page = listProducts(
      query('category=taladros&store_id=toluca-centro&pickup_today=true&page_size=96'),
    )
    expect(page.items.length).toBeGreaterThan(0)
    expect(page.items.every((p) => p.stock.status === 'ok' || p.stock.status === 'low')).toBe(true)
  })

  it('busca sin importar acentos ni mayúsculas, y por SKU', () => {
    expect(listProducts(query('q=INALAMBRICO')).total).toBeGreaterThan(0)
    expect(listProducts(query('q=SKU 100245')).items[0].sku).toBe('100245')
  })
})

describe('textos de stock (prototipo Escritorio-1-Listado)', () => {
  const product = (sku: string) => db.products.find((p) => p.sku === sku)!

  it('con sucursal', () => {
    expect(stockFor(product('100245').variants.slice(0, 1), 'toluca-centro').label).toBe(
      '12 en Toluca Centro',
    )
    expect(stockFor(product('200118').variants, 'toluca-centro').label).toBe('Quedan 3 en Toluca Centro')
    expect(stockFor(product('100402').variants, 'toluca-centro').label).toBe('Agotado en tu sucursal')
    expect(stockFor(product('300190').variants, 'toluca-centro').label).toBe('Solo envío a domicilio')
  })
})

describe('búsqueda', () => {
  it('"¿Quisiste decir…?" corrige y quita palabras que no existen (Escritorio-7-Estados)', () => {
    const published = db.products.filter((p) => p.status === 'publicado')
    expect(suggestCorrection('taladro inalambico rojo 36v', published)).toBe('taladro inalámbrico')
  })

  it('sugerencias: búsquedas, categorías y productos (EP-04)', () => {
    const s = suggest('tala')
    expect(s.queries.length).toBeGreaterThan(0)
    expect(s.queries.every((q) => q.startsWith('tala'))).toBe(true)
    expect(s.categories.map((c) => c.slug)).toContain('taladros')
    expect(s.products.length).toBeLessThanOrEqual(3)
  })
})
