import { describe, expect, it } from 'vitest'
import { addressSchema } from '../schemas/auth'
import { wishlistItemSchema } from '../schemas/catalog'
import { fromAddress, toAddress, toWishlistItem } from './account'

describe('direcciones', () => {
  it('convierte la dirección del backend y de regreso solo con los campos enviados', () => {
    const address = addressSchema.parse(
      toAddress({
        id: 'd1',
        calle: 'Calle Morelos',
        ciudad: 'Toluca',
        codigo_postal: '50000',
        es_predeterminada: true,
        alias: 'Casa',
        nombre_recibe: 'Ana Torres',
        numero_exterior: '45',
        numero_interior: null,
        colonia: 'Centro',
        entidad: 'Estado de México',
        telefono: '7221234567',
        referencias: null,
      }),
    )
    expect(address).toMatchObject({ street: 'Calle Morelos', ext: '45', colony: 'Centro', is_default: true })
    expect(address.int).toBeUndefined()
    expect(fromAddress({ alias: 'Trabajo', is_default: true, int: '' })).toEqual({
      alias: 'Trabajo',
      es_predeterminada: true,
      numero_interior: null,
    })
  })
})

describe('lista de deseos', () => {
  it('usa la variante guardada y el precio que tenía', () => {
    const item = wishlistItemSchema.parse(
      toWishlistItem({
        variante_sku: 'TAL-20V-AMA',
        precio_guardado: '2999.00',
        producto: {
          id: 'p1',
          categoria_id: 'c1',
          nombre: 'Taladro',
          descripcion: null,
          marca: 'Milwaukee',
          estado: 'publicado',
          especificaciones: {},
          imagenes: [],
          calificacion_promedio: 0,
          total_resenas: 0,
          ruta_categoria: [],
          variantes: [
            {
              sku: 'TAL-20V-ROJ',
              producto_id: 'p1',
              atributos: {},
              precio: '2499.00',
              imagen_url: null,
              stock_disponible: 3,
              stock_sucursal: null,
            },
            {
              sku: 'TAL-20V-AMA',
              producto_id: 'p1',
              atributos: {},
              precio: '2799.00',
              imagen_url: null,
              stock_disponible: 3,
              stock_sucursal: null,
            },
          ],
        },
      }),
    )
    expect(item).toMatchObject({
      sku: 'TAL-20V-ROJ',
      variant_sku: 'TAL-20V-AMA',
      saved_price: 299900,
      price: 249900,
    })
  })
})
