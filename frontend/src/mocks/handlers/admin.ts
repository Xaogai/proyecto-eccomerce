// Panel de administración: EP-34 a EP-47. Todo exige rol admin.
import { http, HttpResponse } from 'msw'
import type { Category } from '@/api/schemas/catalog'
import { canTransition, type OrderStatus, ORDER_STATUSES, orderTransitions } from '@/lib/orderStatus'
import { normalize } from '@/lib/text'
import { serializeOrder } from '../db/orders'
import type { DbOrder, DbProduct } from '../db/seed'
import { categoryPath, categoryWithDescendants, db } from '../db/store'
import { applyScenario } from '../scenarios'
import type { StaffInput } from '@/api/schemas/admin'
import { API, businessError, requireUser, validationError } from './utils'

const DAY = 86_400_000

async function guard(request: Request) {
  const hijack = await applyScenario()
  if (hijack) return { response: hijack }
  return requireUser(request, ['admin'])
}

const paginate = <T>(list: T[], url: URL, size = 20) => {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') ?? size)))
  return {
    items: list.slice((page - 1) * pageSize, page * pageSize),
    page,
    page_size: pageSize,
    total: list.length,
  }
}

const orderTotal = (o: DbOrder) => o.items.reduce((n, i) => n + i.unit_price * i.qty, 0) + o.shipping
const isPaid = (o: DbOrder) => o.payment_status === 'pagado' && o.status !== 'cancelado'

// ---------- Productos ----------

const totalStock = (p: DbProduct) =>
  p.variants.reduce((n, v) => n + Object.values(v.stock).reduce((a, b) => a + b, 0), 0)

function adminStatus(p: DbProduct): 'publicado' | 'borrador' | 'agotado' {
  if (p.status === 'borrador') return 'borrador'
  return totalStock(p) === 0 ? 'agotado' : 'publicado'
}

const pathLabel = (slug: string) =>
  categoryPath(slug)
    .slice(1)
    .map((c) => c.name)
    .join(' › ')

function productRow(p: DbProduct) {
  const priced = p.variants.filter((v) => v.price > 0)
  return {
    id: p.sku,
    sku: p.sku,
    name: p.name,
    category: p.category,
    category_label: pathLabel(p.category) || p.category,
    variant_count: p.variants.length,
    price_from: priced.length ? Math.min(...priced.map((v) => v.price)) : null,
    stock_total: totalStock(p),
    status: adminStatus(p),
  }
}

function productDetail(p: DbProduct) {
  return {
    id: p.sku,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    category: p.category,
    description: p.description,
    attrs: p.attrs,
    images: (p.images ?? [{ url: '/mock/producto.svg', alt: `${p.name}, vista lateral` }]).map((i) => ({
      ...i,
    })),
    variants: p.variants.map((v) => ({
      sku: v.sku,
      label: v.label,
      price: v.price,
      stock_total: Object.values(v.stock).reduce((a, b) => a + b, 0),
    })),
    status: adminStatus(p),
  }
}

type VariantInput = { sku?: string; label?: string; price?: number; stock_total?: number }
type ProductInput = {
  name?: string
  brand?: string
  category?: string
  description?: string
  attrs?: Record<string, string>
  variants?: VariantInput[]
}

function validateProduct(body: ProductInput) {
  const e: Record<string, string> = {}
  if (!body.name?.trim()) e.name = 'Escribe el nombre del producto.'
  if (!body.brand?.trim()) e.brand = 'Escribe la marca.'
  if (!body.category || !categoryPath(body.category).length) e.category = 'Elige una categoría.'
  body.variants?.forEach((v, i) => {
    if (v.price !== undefined && (!Number.isFinite(v.price) || v.price < 0))
      e[`variants.${i}.price`] = 'El precio no puede ser negativo.'
    if (v.stock_total !== undefined && (!Number.isInteger(v.stock_total) || v.stock_total < 0))
      e[`variants.${i}.stock_total`] = 'El stock es un entero de 0 o más.'
  })
  return e
}

/** El stock inicial de una variante nueva se pone en la primera sucursal; después se ajusta en Inventario. */
function applyVariants(p: DbProduct, variants: VariantInput[]) {
  p.variants = variants.map((v, i) => {
    const existing = p.variants.find((x) => x.sku === v.sku)
    const sku = v.sku || `${p.sku}-${i}`
    if (existing) {
      const diff = (v.stock_total ?? 0) - Object.values(existing.stock).reduce((a, b) => a + b, 0)
      if (diff !== 0)
        existing.stock['toluca-centro'] = Math.max(0, (existing.stock['toluca-centro'] ?? 0) + diff)
      return { ...existing, label: v.label?.trim() || existing.label, price: v.price ?? existing.price }
    }
    return {
      sku,
      label: v.label?.trim() || 'Única',
      price: v.price ?? 0,
      stock: { 'toluca-centro': v.stock_total ?? 0, metepec: 0, lerma: 0, zinacantepec: 0 },
      ship: true,
    }
  })
}

// ---------- Categorías ----------

function countIn(slug: string) {
  const slugs = categoryWithDescendants(slug)
  return db.products.filter((p) => slugs.has(p.category)).length
}

function withCounts(list: Category[]): Array<Category & { product_count: number }> {
  return list.map((c) => ({ ...c, product_count: countIn(c.slug), children: withCounts(c.children) }))
}

function findCategory(
  list: Category[],
  id: string,
  parent: Category | null = null,
  depth = 1,
): { node: Category; parent: Category | null; depth: number } | null {
  for (const c of list) {
    if (c.id === id) return { node: c, parent, depth }
    const found = findCategory(c.children, id, c, depth + 1)
    if (found) return found
  }
  return null
}

const slugify = (s: string) =>
  normalize(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// ---------- Pedidos ----------

const GROUPS: Record<string, OrderStatus[]> = {
  pago: ['creado', 'pendiente_pago'],
  prep: ['pagado', 'en_preparacion'],
  listos: ['listo_para_recoger', 'enviado'],
  inc: ['incidencia'],
  fin: ['entregado', 'cancelado', 'reembolsado'],
}

function orderRow(o: DbOrder) {
  const s = serializeOrder(o)
  const f = s.fulfillment
  const zip = f.type === 'ship' ? (f.address_label.match(/\b\d{5}\b/)?.[0] ?? '') : ''
  return {
    id: o.id,
    folio: o.folio,
    customer: o.contact.name.replace(/^(\S+)\s+(\S).*$/, '$1 $2.'),
    email: o.contact.email,
    fulfillment_label:
      f.type === 'pickup' ? `Recoger · ${f.store_name}` : `Envío${zip ? ` · CP ${zip}` : ''}`,
    created_at: o.created_at,
    total: orderTotal(o),
    status: s.status,
  }
}

/** Registro de auditoría: el guardado, o uno armado desde la línea de tiempo. */
function auditOf(o: DbOrder) {
  if (o.audit) return o.audit
  return o.timeline.map((t, i) => ({
    at: t.at,
    from: i ? o.timeline[i - 1].status : null,
    to: t.status,
    actor: t.status === 'pagado' ? 'Pasarela de pago' : t.status === 'creado' ? 'Cliente' : 'Sistema',
  }))
}

/** Avisos de la pasarela: los guardados o, en pedidos pagados del prototipo, el aviso de pago aprobado. */
function webhooksOf(o: DbOrder) {
  if (o.webhooks) return o.webhooks
  const paid = o.timeline.find((t) => t.status === 'pagado')
  return paid ? [{ at: paid.at, event: 'Pago aprobado', result: 'Procesado' }] : []
}

// ---------- Reportes ----------

const PERIOD_DAYS: Record<string, number> = { hoy: 1, '7d': 7, '30d': 30, '90d': 90 }

function report(period: string) {
  const days = PERIOD_DAYS[period] ?? 7
  const since = Date.now() - days * DAY
  const inPeriod = db.orders.filter((o) => new Date(o.created_at).getTime() >= since)
  const paid = inPeriod.filter(isPaid)
  const sales = paid.reduce((n, o) => n + orderTotal(o), 0)
  const byDept = new Map<string, number>()
  for (const o of paid) {
    for (const i of o.items) {
      const p = db.products.find((x) => x.variants.some((v) => v.sku === i.sku))
      const dept = p ? (categoryPath(p.category)[0]?.name ?? 'Otros') : 'Otros'
      byDept.set(dept, (byDept.get(dept) ?? 0) + i.unit_price * i.qty)
    }
  }
  const branches = db.stores.map((s) => {
    const pieces = db.products.reduce(
      (n, p) => n + p.variants.reduce((m, v) => m + (v.stock[s.id] ?? 0), 0),
      0,
    )
    const out = db.products.reduce(
      (n, p) => n + p.variants.filter((v) => (v.stock[s.id] ?? 0) === 0).length,
      0,
    )
    const pickups = inPeriod.filter(
      (o) => o.fulfillment.type === 'pickup' && o.fulfillment.store_id === s.id,
    ).length
    return {
      store: s.name,
      pieces,
      reserved: Math.round(pieces * 0.015),
      out_of_stock: out,
      pickup_orders: pickups,
    }
  })
  return {
    period,
    from: new Date(since).toISOString(),
    to: new Date().toISOString(),
    kpis: [
      { key: 'ventas', label: 'Ventas', value: sales, unit: 'money', note: 'Pagos confirmados' },
      { key: 'pedidos', label: 'Pedidos', value: paid.length, unit: 'count', note: 'Sin cancelados' },
      {
        key: 'ticket',
        label: 'Ticket promedio',
        value: paid.length ? Math.round(sales / paid.length / 100) * 100 : 0,
        unit: 'money',
        note: 'Ventas entre pedidos',
      },
      {
        key: 'rechazos',
        label: 'Pagos rechazados',
        value: inPeriod.filter((o) => o.payment_status === 'rechazado').length,
        unit: 'count',
        note: 'Revisa la pasarela',
      },
    ],
    by_category: [...byDept.entries()].sort((a, b) => b[1] - a[1]).map(([name, total]) => ({ name, total })),
    branches,
  }
}

const csvCell = (v: string | number) =>
  /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)

// ---------- Configuración ----------

const settings = {
  payment: { provider: 'Por definir', mode: 'sandbox' as const, key_hint: 'pk_…1234' },
  shipping: {
    rates: [
      { zone: '50000 a 50299 (Toluca)', cost: 14900, days: '3 a 5' },
      { zone: '52000 a 52299 (Metepec, Lerma)', cost: 17900, days: '3 a 5' },
      { zone: 'Resto del país', cost: 24900, days: '5 a 8' },
    ],
    free_from: 150000,
  },
  security: { max_attempts: 5, lock_minutes: 15, session_minutes: 15, reservation_minutes: 30 },
}

export const adminHandlers = [
  // EP-34
  http.get(`${API}/admin/dashboard`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const today = db.orders.filter((o) => new Date(o.created_at) >= startOfDay)
    const toPrepare = db.orders.filter((o) => o.status === 'pagado' || o.status === 'en_preparacion')
    const oldPrepare = toPrepare.filter((o) => Date.now() - new Date(o.created_at).getTime() > 3_600_000)
    const rejected = db.orders.filter(
      (o) => o.payment_status === 'rechazado' && o.status === 'pendiente_pago',
    )
    const outVariants = db.products.reduce(
      (n, p) => n + p.variants.filter((v) => db.stores.some((s) => (v.stock[s.id] ?? 0) === 0)).length,
      0,
    )
    const incidents = db.orders.filter((o) => o.status === 'incidencia')
    const drafts = db.products.filter((p) => p.status === 'borrador')
    const low = db.products.find((p) => p.sku === '200118')
    const sales_by_day = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(startOfDay.getTime() - (6 - i) * DAY)
      const next = day.getTime() + DAY
      const total = db.orders
        .filter(
          (o) =>
            isPaid(o) &&
            new Date(o.created_at).getTime() >= day.getTime() &&
            new Date(o.created_at).getTime() < next,
        )
        .reduce((n, o) => n + orderTotal(o), 0)
      return { date: day.toISOString(), total }
    })
    return HttpResponse.json({
      kpis: [
        {
          key: 'ventas_hoy',
          label: 'Ventas de hoy',
          value: today.filter(isPaid).reduce((n, o) => n + orderTotal(o), 0),
          unit: 'money',
          note: `${today.length} pedidos`,
          tone: 'neutro',
          link: '/admin/reportes',
        },
        {
          key: 'por_preparar',
          label: 'Por preparar',
          value: toPrepare.length,
          unit: 'count',
          note: `${oldPrepare.length} con más de 1 hora`,
          tone: 'aviso',
          link: '/admin/pedidos?estado=prep',
        },
        {
          key: 'rechazados',
          label: 'Pagos rechazados',
          value: rejected.length,
          unit: 'count',
          note: 'Revisa la pasarela',
          tone: 'error',
          link: '/admin/pedidos?estado=pago',
        },
        {
          key: 'agotadas',
          label: 'Variantes agotadas',
          value: outVariants,
          unit: 'count',
          note: 'En al menos 1 sucursal',
          tone: 'neutro',
          link: '/admin/productos?estado=agotado',
        },
      ],
      alerts: [
        ...incidents.slice(0, 3).map((o) => ({
          severity: 'alta',
          title: `Pedido ${o.folio} en incidencia`,
          detail: 'El cliente reporta un problema con la entrega',
          link: `/admin/pedidos/${o.id}`,
        })),
        ...db.orders
          .filter((o) => o.webhooks?.some((w) => w.result.startsWith('Ignorado')))
          .slice(0, 1)
          .map((o) => ({
            severity: 'alta',
            title: 'Confirmación de pago duplicada',
            detail: `Pedido ${o.folio}: llegaron 2 avisos de la pasarela; se procesó 1`,
            link: `/admin/pedidos/${o.id}`,
          })),
        ...(low
          ? [
              {
                severity: 'media',
                title: `Stock bajo: ${low.name}`,
                detail: `Quedan ${low.variants[0].stock['toluca-centro']} en Toluca Centro`,
                link: '/sucursal/inventario',
              },
            ]
          : []),
        ...(drafts.length
          ? [
              {
                severity: 'baja',
                title: `${drafts.length} productos en borrador`,
                detail: 'Revísalos y publícalos',
                link: '/admin/productos?estado=borrador',
              },
            ]
          : []),
      ],
      sales_by_day,
    })
  }),

  // EP-35
  http.get(`${API}/admin/products`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const q = normalize(url.searchParams.get('q') ?? '')
    const category = url.searchParams.get('category')
    const slugs = category ? categoryWithDescendants(category) : null
    const rows = db.products
      .filter((p) => !slugs || slugs.has(p.category))
      .filter(
        (p) => !q || normalize(`${p.name} ${p.sku} ${p.variants.map((v) => v.sku).join(' ')}`).includes(q),
      )
      .map(productRow)
    const counts = {
      todos: rows.length,
      publicado: rows.filter((r) => r.status === 'publicado').length,
      borrador: rows.filter((r) => r.status === 'borrador').length,
      agotado: rows.filter((r) => r.status === 'agotado').length,
    }
    const filtered = rows.filter((r) => !status || r.status === status)
    return HttpResponse.json({ ...paginate(filtered, url), counts })
  }),

  // EP-36
  http.get(`${API}/admin/products/:id`, async ({ request, params }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const p = db.products.find((x) => x.sku === params.id)
    if (!p) return businessError(404, 'not_found', 'No encontramos este producto.')
    return HttpResponse.json(productDetail(p))
  }),

  http.post(`${API}/admin/products`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const body = (await request.json()) as ProductInput
    const errors = validateProduct(body)
    if (Object.keys(errors).length) return validationError(errors)
    const sku = String(Math.max(...db.products.map((p) => Number(p.sku) || 0)) + 1)
    const p: DbProduct = {
      sku,
      name: body.name!.trim(),
      brand: body.brand!.trim(),
      description: body.description?.trim() ?? '',
      category: body.category!,
      attrs: body.attrs ?? {},
      specs: Object.entries(body.attrs ?? {}).map(([k, v]) => ({ k, v })),
      rating: { avg: 0, count: 0 },
      variants: [],
      has360: false,
      status: 'borrador',
      created_at: new Date().toISOString(),
    }
    applyVariants(p, body.variants ?? [])
    db.products.unshift(p)
    return HttpResponse.json(productDetail(p), { status: 201 })
  }),

  // Guarda información general y la lista completa de variantes (ver bitácora: simplifica EP-38).
  http.patch(`${API}/admin/products/:id`, async ({ request, params }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const p = db.products.find((x) => x.sku === params.id)
    if (!p) return businessError(404, 'not_found', 'No encontramos este producto.')
    const body = (await request.json()) as ProductInput
    const errors = validateProduct({ name: p.name, brand: p.brand, category: p.category, ...body })
    if (Object.keys(errors).length) return validationError(errors)
    if (body.name !== undefined) p.name = body.name.trim()
    if (body.brand !== undefined) p.brand = body.brand.trim()
    if (body.category !== undefined) p.category = body.category
    if (body.description !== undefined) p.description = body.description.trim()
    if (body.attrs) p.attrs = body.attrs
    if (body.variants) applyVariants(p, body.variants)
    return HttpResponse.json(productDetail(p))
  }),

  // EP-37: I2, no se publica sin una variante con precio y stock mayores a cero.
  http.post(`${API}/admin/products/:id/publish`, async ({ request, params }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const p = db.products.find((x) => x.sku === params.id)
    if (!p) return businessError(404, 'not_found', 'No encontramos este producto.')
    const valid = p.variants.some((v) => v.price > 0 && Object.values(v.stock).some((n) => n > 0))
    if (!valid)
      return businessError(
        409,
        'no_valid_variant',
        'No puedes publicar: agrega al menos una variante con precio y stock mayor a cero.',
      )
    p.status = 'publicado'
    return HttpResponse.json(productDetail(p))
  }),

  http.post(`${API}/admin/products/:id/unpublish`, async ({ request, params }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const p = db.products.find((x) => x.sku === params.id)
    if (!p) return businessError(404, 'not_found', 'No encontramos este producto.')
    p.status = 'borrador'
    return HttpResponse.json(productDetail(p))
  }),

  // EP-39 (multipart: file + alt obligatorio, F4)
  http.post(`${API}/admin/products/:id/images`, async ({ request, params }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const p = db.products.find((x) => x.sku === params.id)
    if (!p) return businessError(404, 'not_found', 'No encontramos este producto.')
    const form = await request.formData()
    const alt = String(form.get('alt') ?? '').trim()
    if (!(form.get('file') instanceof File)) return validationError({ file: 'Elige una imagen.' })
    if (!alt) return validationError({ alt: 'Escribe el texto alternativo de la imagen.' })
    const image = { url: '/mock/producto.svg', alt }
    p.images = [...(p.images ?? [{ url: '/mock/producto.svg', alt: `${p.name}, vista lateral` }]), image]
    return HttpResponse.json(image, { status: 201 })
  }),

  // EP-40
  http.get(`${API}/admin/categories`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    return HttpResponse.json(withCounts(db.categories))
  }),

  http.post(`${API}/admin/categories`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const body = (await request.json()) as { name?: string; slug?: string; parent_id?: string | null }
    if (!body.name?.trim()) return validationError({ name: 'Escribe el nombre.' })
    const slug = slugify(body.slug || body.name)
    if (findCategory(db.categories, slug))
      return validationError({ slug: 'Ya existe una categoría con esa dirección web.' })
    const node: Category = { id: slug, slug, name: body.name.trim(), children: [] }
    if (body.parent_id) {
      const parent = findCategory(db.categories, body.parent_id)
      if (!parent) return validationError({ parent_id: 'La categoría padre no existe.' })
      if (parent.depth >= 3)
        return businessError(422, 'max_depth', 'Máximo 3 niveles: una subcategoría no admite más niveles.')
      parent.node.children.push(node)
    } else {
      db.categories.push(node)
    }
    return HttpResponse.json(node, { status: 201 })
  }),

  http.patch(`${API}/admin/categories/:id`, async ({ request, params }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const found = findCategory(db.categories, String(params.id))
    if (!found) return businessError(404, 'not_found', 'No encontramos esa categoría.')
    const body = (await request.json()) as { name?: string }
    if (!body.name?.trim()) return validationError({ name: 'Escribe el nombre.' })
    found.node.name = body.name.trim()
    return HttpResponse.json(found.node)
  }),

  http.delete(`${API}/admin/categories/:id`, async ({ request, params }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const found = findCategory(db.categories, String(params.id))
    if (!found) return businessError(404, 'not_found', 'No encontramos esa categoría.')
    if (found.node.children.length || countIn(found.node.slug)) {
      return businessError(
        409,
        'not_empty',
        'Solo puedes eliminar categorías sin productos ni subcategorías.',
      )
    }
    const siblings = found.parent ? found.parent.children : db.categories
    siblings.splice(siblings.indexOf(found.node), 1)
    return new HttpResponse(null, { status: 204 })
  }),

  // EP-41
  http.get(`${API}/admin/orders`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const url = new URL(request.url)
    const group = url.searchParams.get('status_group')
    const q = normalize(url.searchParams.get('q') ?? '')
    const store = url.searchParams.get('store_id')
    const days = Number(url.searchParams.get('days')) || null
    const base = db.orders
      .filter((o) => !q || normalize(`${o.folio} ${o.contact.name} ${o.contact.email}`).includes(q))
      .filter((o) => !store || (o.fulfillment.type === 'pickup' && o.fulfillment.store_id === store))
      .filter((o) => !days || Date.now() - new Date(o.created_at).getTime() <= days * DAY)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    const counts = Object.fromEntries([
      ['todos', base.length],
      ...Object.entries(GROUPS).map(([k, statuses]) => [
        k,
        base.filter((o) => statuses.includes(o.status)).length,
      ]),
    ])
    const list = base.filter((o) => !group || GROUPS[group]?.includes(o.status)).map(orderRow)
    return HttpResponse.json({ ...paginate(list, url), counts })
  }),

  // EP-42
  http.get(`${API}/admin/orders/:id`, async ({ request, params }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const o = db.orders.find((x) => x.id === params.id)
    if (!o) return businessError(404, 'not_found', 'No encontramos este pedido.')
    return HttpResponse.json({
      ...serializeOrder(o),
      allowed_transitions: orderTransitions[o.status],
      webhook_log: webhooksOf(o),
      audit_log: [...auditOf(o)].reverse(),
    })
  }),

  // EP-43: I3, solo transiciones válidas; cada cambio queda en el registro.
  http.post(`${API}/admin/orders/:id/status`, async ({ request, params }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const o = db.orders.find((x) => x.id === params.id)
    if (!o) return businessError(404, 'not_found', 'No encontramos este pedido.')
    const { to, note } = (await request.json()) as { to?: OrderStatus; note?: string }
    if (!to || !ORDER_STATUSES.includes(to) || !canTransition(o.status, to)) {
      return businessError(409, 'invalid_transition', `No se puede pasar de "${o.status}" a "${to}".`)
    }
    o.audit = [
      ...auditOf(o),
      {
        at: new Date().toISOString(),
        from: o.status,
        to,
        actor: auth.user.name,
        note: note?.trim() || undefined,
      },
    ]
    o.timeline.push({ status: to, at: new Date().toISOString() })
    o.status = to
    return HttpResponse.json({
      ...serializeOrder(o),
      allowed_transitions: orderTransitions[o.status],
      webhook_log: webhooksOf(o),
      audit_log: [...o.audit].reverse(),
    })
  }),

  // EP-44 y EP-45
  http.get(`${API}/admin/users`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const url = new URL(request.url)
    const role = url.searchParams.get('role')
    const q = normalize(url.searchParams.get('q') ?? '')
    const list = db.users
      .filter((u) => !role || u.role === role)
      .filter((u) => !q || normalize(`${u.name} ${u.email}`).includes(q))
      .sort((a, b) =>
        a.role === b.role
          ? a.name.localeCompare(b.name)
          : ['admin', 'staff', 'cliente'].indexOf(a.role) - ['admin', 'staff', 'cliente'].indexOf(b.role),
      )
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        branch_id: u.branch_id,
        branch_name: db.stores.find((s) => s.id === u.branch_id)?.name ?? null,
        last_login: u.last_login,
        locked: u.locked,
        is_self: u.id === auth.user.id,
      }))
    return HttpResponse.json(paginate(list, url, 25))
  }),

  http.patch(`${API}/admin/users/:id`, async ({ request, params }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const u = db.users.find((x) => x.id === params.id)
    if (!u) return businessError(404, 'not_found', 'No encontramos ese usuario.')
    if (u.id === auth.user.id) return businessError(409, 'self_change', 'No puedes cambiar tu propio rol.')
    const body = (await request.json()) as { role?: 'cliente' | 'staff' | 'admin'; branch_id?: string | null }
    if (body.role === 'staff' && !(body.branch_id ?? u.branch_id))
      return validationError({ branch_id: 'El staff necesita una sucursal.' })
    if (body.role) u.role = body.role
    if (body.branch_id !== undefined) u.branch_id = body.branch_id
    if (u.role !== 'staff') u.branch_id = null
    return HttpResponse.json({ id: u.id })
  }),

  http.post(`${API}/admin/users`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const body = (await request.json()) as StaffInput
    const email = body.email.trim().toLowerCase()
    if (body.role === 'staff' && !body.branch_id)
      return validationError({ branch_id: 'El staff necesita una sucursal.' })
    if (db.users.some((u) => u.email === email))
      return businessError(
        409,
        'email_taken',
        'Ya existe una cuenta con ese correo. Cámbiale el rol en la tabla.',
      )
    const temporary_password = 'Temporal-2026'
    const user = {
      id: `u-${crypto.randomUUID().slice(0, 8)}`,
      name: body.name.trim(),
      email,
      password: temporary_password,
      role: body.role,
      branch_id: body.role === 'staff' ? body.branch_id : null,
      locked: false,
      failed_attempts: 0,
      last_login: null,
      must_change_password: true,
    }
    db.users.push(user)
    return HttpResponse.json(
      { id: user.id, name: user.name, email, role: user.role, branch_id: user.branch_id, temporary_password },
      { status: 201 },
    )
  }),

  http.post(`${API}/admin/users/:id/unlock`, async ({ request, params }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const u = db.users.find((x) => x.id === params.id)
    if (!u) return businessError(404, 'not_found', 'No encontramos ese usuario.')
    u.locked = false
    u.failed_attempts = 0
    return HttpResponse.json({ id: u.id })
  }),

  // EP-46
  http.get(`${API}/admin/reports`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    return HttpResponse.json(report(new URL(request.url).searchParams.get('period') ?? '7d'))
  }),

  http.get(`${API}/admin/reports/export.csv`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const period = new URL(request.url).searchParams.get('period') ?? '7d'
    const since = Date.now() - (PERIOD_DAYS[period] ?? 7) * DAY
    const rows = db.orders
      .filter((o) => new Date(o.created_at).getTime() >= since)
      .map((o) => [
        o.folio,
        o.created_at,
        o.contact.name,
        o.status,
        o.payment_status,
        (orderTotal(o) / 100).toFixed(2),
      ])
    const csv = [['folio', 'fecha', 'cliente', 'estado', 'pago', 'total_mxn'], ...rows]
      .map((r) => r.map(csvCell).join(','))
      .join('\n')
    return new HttpResponse(`﻿${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="reporte-${period}.csv"`,
      },
    })
  }),

  // EP-47: la llave de la pasarela solo viaja enmascarada (I6).
  http.get(`${API}/admin/settings`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    return HttpResponse.json({ flags: db.featureFlags, ...settings })
  }),

  http.patch(`${API}/admin/settings`, async ({ request }) => {
    const auth = await guard(request)
    if ('response' in auth) return auth.response
    const body = (await request.json()) as {
      flags?: Partial<typeof db.featureFlags>
      shipping?: { free_from?: number }
      security?: Partial<typeof settings.security>
    }
    if (body.flags) db.featureFlags = { ...db.featureFlags, ...body.flags }
    if (body.shipping?.free_from !== undefined) {
      if (!Number.isInteger(body.shipping.free_from) || body.shipping.free_from < 0)
        return validationError({ free_from: 'Escribe un monto válido.' })
      settings.shipping.free_from = body.shipping.free_from
    }
    if (body.security) {
      const e: Record<string, string> = {}
      for (const [k, v] of Object.entries(body.security))
        if (!Number.isInteger(v) || (v as number) < 1) e[k] = 'Escribe un número entero mayor a 0.'
      if (Object.keys(e).length) return validationError(e)
      Object.assign(settings.security, body.security)
    }
    return HttpResponse.json({ flags: db.featureFlags, ...settings })
  }),
]
