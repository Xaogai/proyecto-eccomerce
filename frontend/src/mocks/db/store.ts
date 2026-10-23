// "Base de datos" en memoria. Los handlers la leen y la modifican, así la UI refleja los cambios
// (agregar al carrito, cambiar estados, desbloquear usuarios). reset() vuelve a la semilla (pruebas).
import * as seed from './seed'

function fresh() {
  return {
    stores: structuredClone(seed.stores),
    categories: structuredClone(seed.categories),
    products: structuredClone(seed.products),
    users: structuredClone(seed.users),
    orders: structuredClone(seed.orders),
    addresses: structuredClone(seed.addresses),
    /** intentos de checkout en el escenario "fila de espera" */
    queueAttempts: 0,
    featureFlags: { ...seed.featureFlags },
    /** carritos por id (invitado o usuario) */
    carts: new Map<string, seed.DbCartItem[]>(),
    /** carrito de cada usuario */
    userCarts: new Map<string, string>(),
    /** refresh tokens vigentes → id de usuario */
    refreshTokens: new Map<string, string>(),
    /** lista de deseos por usuario (SKU de producto) */
    wishlists: new Map<string, Set<string>>([['u-cliente', new Set(['200118', '300077'])]]),
  }
}

export let db = fresh()

export function resetDb() {
  db = fresh()
}

// ---------- Persistencia en el navegador ----------
// Así una recarga de página no pierde el carrito, la sesión ni los pedidos simulados.

type Db = ReturnType<typeof fresh>

export function exportDb(): string {
  return JSON.stringify(db, (_key, value) =>
    value instanceof Map ? { __map: [...value] } : value instanceof Set ? { __set: [...value] } : value,
  )
}

export function importDb(json: string) {
  const restored = JSON.parse(json, (_key, value) =>
    value && typeof value === 'object' && '__map' in value
      ? new Map(value.__map)
      : value && typeof value === 'object' && '__set' in value
        ? new Set(value.__set)
        : value,
  ) as Db
  db = { ...fresh(), ...restored }
}

// ---------- Consultas comunes ----------

export function findVariant(sku: string) {
  for (const product of db.products) {
    const variant = product.variants.find((v) => v.sku === sku)
    if (variant) return { product, variant }
  }
  return null
}

export function findProduct(sku: string) {
  return db.products.find((p) => p.sku === sku) ?? findVariant(sku)?.product ?? null
}

/** Ruta de la categoría hasta la hoja: [Herramientas, Herramientas eléctricas, Taladros] */
export function categoryPath(slug: string) {
  const walk = (
    list: typeof db.categories,
    path: Array<{ slug: string; name: string }>,
  ): typeof path | null => {
    for (const c of list) {
      const here = [...path, { slug: c.slug, name: c.name }]
      if (c.slug === slug) return here
      const found = walk(c.children, here)
      if (found) return found
    }
    return null
  }
  return walk(db.categories, []) ?? []
}

/** Slugs de una categoría y todas sus descendientes. */
export function categoryWithDescendants(slug: string): Set<string> {
  const out = new Set<string>()
  const collect = (c: (typeof db.categories)[number]) => {
    out.add(c.slug)
    c.children.forEach(collect)
  }
  const find = (list: typeof db.categories): void => {
    for (const c of list) {
      if (c.slug === slug) collect(c)
      else find(c.children)
    }
  }
  find(db.categories)
  return out
}
