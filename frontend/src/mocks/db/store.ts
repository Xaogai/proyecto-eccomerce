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
    featureFlags: { ...seed.featureFlags },
    /** carritos por id (invitado o usuario) */
    carts: new Map<string, seed.DbCartItem[]>(),
    /** carrito de cada usuario */
    userCarts: new Map<string, string>(),
    /** refresh tokens vigentes → id de usuario */
    refreshTokens: new Map<string, string>(),
  }
}

export let db = fresh()

export function resetDb() {
  db = fresh()
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
  const walk = (list: typeof db.categories, path: Array<{ slug: string; name: string }>): typeof path | null => {
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
