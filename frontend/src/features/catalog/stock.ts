import type { Variant } from '@/api/schemas/catalog'

/** Texto de stock de la variante en la sucursal: "12 disponibles en Toluca Centro". */
export function variantStockText(variant: Variant, storeName?: string) {
  const { qty, status } = variant.stock
  if (!storeName)
    return status === 'ship_only' ? 'Solo envío a domicilio' : `${qty} disponibles en sucursales`
  if (status === 'ok') return `${qty} disponibles en ${storeName}`
  if (status === 'low') return `Quedan ${qty} en ${storeName}`
  if (status === 'ship_only') return 'Solo envío a domicilio'
  return `Agotado en ${storeName}`
}
