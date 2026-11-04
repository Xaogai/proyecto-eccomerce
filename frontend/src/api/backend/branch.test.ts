import { describe, expect, it } from 'vitest'
import { handoverSchema, inventoryRowSchema, pickupSchema } from '../schemas/branch'
import { toHandover, toInventoryRow, toPickup } from './branch'

describe('panel de sucursal', () => {
  it('convierte inventario, pedido para recoger y entrega', () => {
    expect(
      inventoryRowSchema.parse(
        toInventoryRow({
          sku: 'TAL-20V-ROJ',
          nombre: 'Taladro',
          etiqueta: 'Rojo',
          pasillo: '14-A',
          piezas: 25,
          apartadas: 5,
          minimo: 5,
          estado: 'ok',
        }),
      ),
    ).toMatchObject({ aisle: '14-A', qty: 25, reserved: 5 })

    const pickup = pickupSchema.parse(
      toPickup({
        id: 'o1',
        folio: 'TSR-1',
        cliente: 'Ana T.',
        estado: 'confirmado',
        piezas: 2,
        ubicacion: 'Pasillo 14',
        pagado_en: '2026-11-03T10:00:00Z',
        listo_en: null,
        entregado_en: null,
        atrasado: true,
        transiciones: ['en_preparacion', 'cancelado'],
      }),
    )
    expect(pickup).toMatchObject({ status: 'pagado', late: true, allowed_transitions: ['en_preparacion'] })

    expect(
      handoverSchema.parse(
        toHandover({
          id: 'o1',
          folio: 'TSR-1',
          cliente: 'Ana Torres',
          email: 'a@x.com',
          estante: 'R-03',
          pago: 'tarjeta',
          productos: [{ nombre: 'Taladro', etiqueta: 'Rojo', cantidad: 2 }],
          estado: 'listo_para_recoger',
        }),
      ).items,
    ).toEqual([{ name: 'Taladro', variant_label: 'Rojo', qty: 2 }])
  })
})
