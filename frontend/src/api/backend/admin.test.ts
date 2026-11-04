import { describe, expect, it } from 'vitest'
import { adminCategorySchema, dashboardSchema, reportSchema, settingsSchema } from '../schemas/admin'
import { fromStatus, settingsBody, toAdminCategory, toDashboard, toReport, toSettings } from './admin'

describe('panel de administración', () => {
  it('arma los indicadores del resumen en centavos', () => {
    const d = dashboardSchema.parse(
      toDashboard({
        indicadores: {
          ventas_hoy: '7596.00',
          pedidos_hoy: 2,
          por_preparar: 2,
          por_preparar_atrasados: 1,
          pagos_rechazados: 0,
          variantes_agotadas: 3,
        },
        alertas: [
          { severidad: 'media', titulo: 'Stock bajo', detalle: 'Quedan 4', enlace: '/sucursal/inventario' },
        ],
        ventas_por_dia: [{ fecha: '2026-11-03T00:00:00Z', total: '99.50' }],
      }),
    )
    expect(d.kpis[0]).toMatchObject({ key: 'ventas_hoy', value: 759600, note: '2 pedidos' })
    expect(d.kpis[1].note).toBe('1 con más de 1 hora')
    expect(d.sales_by_day[0].total).toBe(9950)
  })

  it('traduce estados y categorías con su conteo', () => {
    expect(fromStatus('pagado')).toBe('confirmado')
    expect(fromStatus('enviado')).toBe('enviado')
    const c = adminCategorySchema.parse(
      toAdminCategory({ id: 'c1', nombre: 'Herramientas', total_productos: 4, subcategorias: [] }),
    )
    expect(c).toEqual({
      id: 'c1',
      slug: 'herramientas',
      name: 'Herramientas',
      product_count: 4,
      children: [],
    })
  })

  it('convierte el reporte y la configuración, y manda solo lo que cambió', () => {
    const r = reportSchema.parse(
      toReport({
        periodo: '7d',
        desde: '2026-10-28T00:00:00Z',
        hasta: '2026-11-03T00:00:00Z',
        ventas: '100.00',
        pedidos: 1,
        ticket_promedio: '100.00',
        pagos_rechazados: 0,
        por_departamento: [{ nombre: 'Herramientas', total: '100.00' }],
        sucursales: [{ sucursal: 'Toluca', piezas: 10, apartadas: 2, agotados: 1, pedidos_recoger: 3 }],
      }),
    )
    expect(r.branches[0]).toEqual({
      store: 'Toluca',
      pieces: 10,
      reserved: 2,
      out_of_stock: 1,
      pickup_orders: 3,
    })
    const s = settingsSchema.parse(
      toSettings({
        funciones: { cmp: true },
        pago: { proveedor: 'stripe', modo: 'sandbox', llave_pista: '…1234' },
        envios: {
          tarifas: [{ zona: 'Centro', costo: '99.00', dias: '1 a 2' }],
          envio_gratis_desde: '1500.00',
        },
        seguridad: { intentos_maximos: 5, minutos_bloqueo: 15, minutos_sesion: 15, minutos_reserva: 15 },
      }),
    )
    expect(s.shipping.free_from).toBe(150000)
    expect(settingsBody({ shipping: { free_from: 99900 }, security: { max_attempts: 3 } })).toEqual({
      funciones: undefined,
      envios: { envio_gratis_desde: '999.00' },
      seguridad: { intentos_maximos: 3 },
    })
  })
})
