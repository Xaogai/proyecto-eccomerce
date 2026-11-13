// EP-34 a EP-47: panel de administración.
import type {
  AdminCategory,
  AdminOrder,
  AdminProduct,
  AdminProductRow,
  AdminUser,
  Dashboard,
  Report,
  Settings,
} from '../schemas/admin'
import type { StaffInput } from '../schemas/admin'
import type { OrderStatus } from '@/lib/orderStatus'
import { ApiError, toApiError } from '../errors'
import { bget, bsend } from './http'
import { toOrder, toStatus } from './orders'
import type { Route } from './router'
import { categoryTree, findCategory, invalidate, slugify, toCents, toPesos } from './shared'

/** Estados del frontend → backend (el inverso de toStatus). */
export function fromStatus(status: OrderStatus): string {
  return status === 'pagado' ? 'confirmado' : status
}

const slugOf = async (categoryId: string) => findCategory(await categoryTree(), categoryId)?.slug ?? ''
const idOf = async (slug: string | undefined) =>
  slug ? findCategory(await categoryTree(), slug)?.id : undefined

/** Nombres de campo del backend → los del formulario del admin. */
function fieldError(map: Record<string, string>) {
  return (error: unknown): never => {
    const e = toApiError(error)
    const fields = Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [map[k] ?? k, v]))
    throw new ApiError(e.status, e.message, e.code, fields, e.data)
  }
}

// Resumen

interface BDashboard {
  indicadores: Record<string, number | string>
  alertas: { severidad: 'alta' | 'media' | 'baja'; titulo: string; detalle: string; enlace: string }[]
  ventas_por_dia: { fecha: string; total: string }[]
}

export function toDashboard(d: BDashboard): Dashboard {
  const n = (k: string) => Number(d.indicadores[k] ?? 0)
  return {
    kpis: [
      {
        key: 'ventas_hoy',
        label: 'Ventas de hoy',
        value: toCents(d.indicadores.ventas_hoy),
        unit: 'money',
        note: `${n('pedidos_hoy')} pedidos`,
        tone: 'neutro',
        link: '/admin/reportes',
      },
      {
        key: 'por_preparar',
        label: 'Por preparar',
        value: n('por_preparar'),
        unit: 'count',
        note: `${n('por_preparar_atrasados')} con más de 1 hora`,
        tone: 'aviso',
        link: '/admin/pedidos?estado=prep',
      },
      {
        key: 'rechazados',
        label: 'Pagos rechazados',
        value: n('pagos_rechazados'),
        unit: 'count',
        note: 'Revisa la pasarela',
        tone: 'error',
        link: '/admin/pedidos?estado=pago',
      },
      {
        key: 'agotadas',
        label: 'Variantes agotadas',
        value: n('variantes_agotadas'),
        unit: 'count',
        note: 'En al menos 1 sucursal',
        tone: 'neutro',
        link: '/admin/productos?estado=agotado',
      },
    ],
    alerts: d.alertas.map((a) => ({
      severity: a.severidad,
      title: a.titulo,
      detail: a.detalle,
      link: a.enlace,
    })),
    sales_by_day: d.ventas_por_dia.map((v) => ({ date: v.fecha, total: toCents(v.total) })),
  }
}

// Productos

interface BProductRow {
  id: string
  sku: string
  nombre: string
  categoria_id: string
  categoria: string
  total_variantes: number
  precio_desde: string | null
  stock_total: number
  estado: AdminProductRow['status']
}

interface BAdminProduct {
  id: string
  sku: string
  nombre: string
  marca: string
  categoria_id: string
  descripcion: string
  especificaciones: Record<string, string>
  imagenes: { url: string; texto_alternativo: string }[]
  variantes: { sku: string; etiqueta: string; precio: string; stock_total: number }[]
  estado: AdminProduct['status']
}

async function toProductRow(r: BProductRow): Promise<AdminProductRow> {
  return {
    id: r.id,
    sku: r.sku,
    name: r.nombre,
    category: await slugOf(r.categoria_id),
    category_label: r.categoria,
    variant_count: r.total_variantes,
    price_from: r.precio_desde === null ? null : toCents(r.precio_desde),
    stock_total: r.stock_total,
    status: r.estado,
  }
}

export function toAdminProduct(p: BAdminProduct, categorySlug: string): AdminProduct {
  return {
    id: p.id,
    sku: p.sku,
    name: p.nombre,
    brand: p.marca,
    category: categorySlug,
    description: p.descripcion,
    attrs: p.especificaciones,
    images: p.imagenes.map((i) => ({ url: i.url, alt: i.texto_alternativo })),
    variants: p.variantes.map((v) => ({
      sku: v.sku,
      label: v.etiqueta,
      price: toCents(v.precio),
      stock_total: v.stock_total,
    })),
    status: p.estado,
  }
}

const adminProduct = async (p: BAdminProduct) => toAdminProduct(p, await slugOf(p.categoria_id))

interface ProductInput {
  name: string
  brand: string
  category: string
  description: string
  attrs: Record<string, string>
  variants: { sku?: string; label: string; price: number; stock_total: number }[]
}

async function productBody(input: ProductInput) {
  return {
    nombre: input.name,
    marca: input.brand,
    categoria_id: await idOf(input.category),
    descripcion: input.description,
    especificaciones: input.attrs,
    variantes: input.variants.map((v) => ({
      sku: v.sku || undefined,
      etiqueta: v.label,
      precio: toPesos(v.price),
      stock_total: v.stock_total,
    })),
  }
}

const PRODUCT_FIELDS = {
  nombre: 'name',
  marca: 'brand',
  categoria_id: 'category',
  descripcion: 'description',
}

async function uploadImage(id: string, form: FormData) {
  const out = new FormData()
  const file = form.get('file')
  if (file instanceof Blob) out.append('archivo', file)
  out.append('texto_alternativo', String(form.get('alt') ?? ''))
  const res = await bsend<{ url: string; texto_alternativo: string }>(
    'post',
    `/admin/products/${id}/imagenes`,
    out,
  ).catch(fieldError({ archivo: 'file', texto_alternativo: 'alt' }))
  return { url: res.url, alt: res.texto_alternativo }
}

// Categorías

interface BAdminCategory {
  id: string
  nombre: string
  total_productos: number
  subcategorias: BAdminCategory[]
}

export function toAdminCategory(c: BAdminCategory): AdminCategory {
  return {
    id: c.id,
    slug: slugify(c.nombre),
    name: c.nombre,
    product_count: c.total_productos,
    children: c.subcategorias.map(toAdminCategory),
  }
}

/** El menú de la tienda usa el mismo árbol: se vuelve a pedir después de cada cambio. */
async function categoryChange<T>(run: () => Promise<T>): Promise<T> {
  const result = await run()
  invalidate('categories')
  return result
}

const categoryOk = (c: { id: string; nombre: string }) => ({
  id: c.id,
  slug: slugify(c.nombre),
  name: c.nombre,
})

// Pedidos

interface BOrderRow {
  id: string
  folio: string
  cliente: string
  email: string
  entrega: string
  fecha: string
  total: string
  estado: string
}

type BAdminOrder = Parameters<typeof toOrder>[0] & {
  transiciones_permitidas: string[]
  avisos_pasarela: { fecha: string; evento: string; resultado: string }[]
  registro: { fecha: string; de: string | null; a: string; actor: string; nota: string | null }[]
}

export function toAdminOrder(o: BAdminOrder): AdminOrder {
  return {
    ...toOrder(o),
    allowed_transitions: [...new Set(o.transiciones_permitidas.map(toStatus))],
    webhook_log: o.avisos_pasarela.map((w) => ({ at: w.fecha, event: w.evento, result: w.resultado })),
    audit_log: o.registro.map((r) => ({
      at: r.fecha,
      from: r.de ? toStatus(r.de) : null,
      to: toStatus(r.a),
      actor: r.actor,
      note: r.nota ?? undefined,
    })),
  }
}

// Usuarios

interface BStaffCreated {
  id: string
  nombre: string
  email: string
  tipo_usuario: 'staff' | 'admin'
  sucursal_id: string | null
  password_temporal: string
}

interface BAdminUser {
  id: string
  nombre: string
  email: string
  tipo_usuario: AdminUser['role']
  sucursal_id: string | null
  sucursal_nombre: string | null
  ultimo_acceso: string | null
  bloqueado: boolean
  es_yo: boolean
}

const toAdminUser = (u: BAdminUser): AdminUser => ({
  id: u.id,
  name: u.nombre,
  email: u.email,
  role: u.tipo_usuario,
  branch_id: u.sucursal_id,
  branch_name: u.sucursal_nombre,
  last_login: u.ultimo_acceso,
  locked: u.bloqueado,
  is_self: u.es_yo,
})

// Reportes y configuración

interface BReport {
  periodo: string
  desde: string
  hasta: string
  ventas: string
  pedidos: number
  ticket_promedio: string
  pagos_rechazados: number
  por_departamento: { nombre: string; total: string }[]
  sucursales: {
    sucursal: string
    piezas: number
    apartadas: number
    agotados: number
    pedidos_recoger: number
  }[]
}

export function toReport(r: BReport): Report {
  return {
    period: r.periodo,
    from: r.desde,
    to: r.hasta,
    kpis: [
      { key: 'ventas', label: 'Ventas', value: toCents(r.ventas), unit: 'money', note: 'Pagos confirmados' },
      { key: 'pedidos', label: 'Pedidos', value: r.pedidos, unit: 'count', note: 'Sin cancelados' },
      {
        key: 'ticket',
        label: 'Ticket promedio',
        value: toCents(r.ticket_promedio),
        unit: 'money',
        note: 'Ventas entre pedidos',
      },
      {
        key: 'rechazos',
        label: 'Pagos rechazados',
        value: r.pagos_rechazados,
        unit: 'count',
        note: 'Revisa la pasarela',
      },
    ],
    by_category: r.por_departamento.map((d) => ({ name: d.nombre, total: toCents(d.total) })),
    branches: r.sucursales.map((s) => ({
      store: s.sucursal,
      pieces: s.piezas,
      reserved: s.apartadas,
      out_of_stock: s.agotados,
      pickup_orders: s.pedidos_recoger,
    })),
  }
}

interface BSettings {
  funciones: Record<string, boolean>
  pago: { proveedor: string; modo: 'sandbox' | 'vivo'; llave_pista: string }
  envios: { tarifas: { zona: string; costo: string; dias: string }[]; envio_gratis_desde: string }
  seguridad: {
    intentos_maximos: number
    minutos_bloqueo: number
    minutos_sesion: number
    minutos_reserva: number
  }
}

export function toSettings(s: BSettings): Settings {
  return {
    flags: s.funciones,
    payment: { provider: s.pago.proveedor, mode: s.pago.modo, key_hint: s.pago.llave_pista },
    shipping: {
      rates: s.envios.tarifas.map((t) => ({ zone: t.zona, cost: toCents(t.costo), days: t.dias })),
      free_from: toCents(s.envios.envio_gratis_desde),
    },
    security: {
      max_attempts: s.seguridad.intentos_maximos,
      lock_minutes: s.seguridad.minutos_bloqueo,
      session_minutes: s.seguridad.minutos_sesion,
      reservation_minutes: s.seguridad.minutos_reserva,
    },
  }
}

interface SettingsPatch {
  flags?: Record<string, boolean>
  shipping?: { free_from?: number }
  security?: Partial<Settings['security']>
}

export function settingsBody(patch: SettingsPatch) {
  const sec = patch.security
  return {
    funciones: patch.flags,
    envios:
      patch.shipping?.free_from === undefined
        ? undefined
        : { envio_gratis_desde: toPesos(patch.shipping.free_from) },
    seguridad: sec
      ? Object.fromEntries(
          Object.entries({
            intentos_maximos: sec.max_attempts,
            minutos_bloqueo: sec.lock_minutes,
            minutos_sesion: sec.session_minutes,
            minutos_reserva: sec.reservation_minutes,
          }).filter(([, v]) => v !== undefined),
        )
      : undefined,
  }
}

const page = <T>(data: { page: number; page_size: number; total: number }, items: T[]) => ({
  items,
  page: data.page,
  page_size: data.page_size,
  total: data.total,
})

export const adminRoutes: Route[] = [
  {
    method: 'get',
    path: '/admin/dashboard',
    handle: async () => toDashboard(await bget<BDashboard>('/admin/dashboard')),
  },
  {
    method: 'get',
    path: '/admin/products',
    handle: async ({ query }) => {
      const data = await bget<{
        page: number
        page_size: number
        total: number
        items: BProductRow[]
        conteos: Record<string, number>
      }>('/admin/products', {
        q: query.q,
        categoria_id: await idOf(query.category),
        estado: query.status,
        page: query.page,
      })
      return { ...page(data, await Promise.all(data.items.map(toProductRow))), counts: data.conteos }
    },
  },
  {
    method: 'post',
    path: '/admin/products',
    handle: async ({ body }) =>
      adminProduct(
        await bsend<BAdminProduct>('post', '/admin/products', await productBody(body as ProductInput)).catch(
          fieldError(PRODUCT_FIELDS),
        ),
      ),
  },
  {
    method: 'get',
    path: '/admin/products/:id',
    handle: async ({ params }) => adminProduct(await bget<BAdminProduct>(`/admin/products/${params.id}`)),
  },
  {
    method: 'patch',
    path: '/admin/products/:id',
    handle: async ({ params, body }) =>
      adminProduct(
        await bsend<BAdminProduct>(
          'patch',
          `/admin/products/${params.id}`,
          await productBody(body as ProductInput),
        ).catch(fieldError(PRODUCT_FIELDS)),
      ),
  },
  {
    method: 'post',
    path: '/admin/products/:id/publish',
    handle: async ({ params }) =>
      adminProduct(await bsend<BAdminProduct>('post', `/admin/products/${params.id}/publicar`)),
  },
  {
    method: 'post',
    path: '/admin/products/:id/unpublish',
    handle: async ({ params }) =>
      adminProduct(await bsend<BAdminProduct>('post', `/admin/products/${params.id}/despublicar`)),
  },
  {
    method: 'post',
    path: '/admin/products/:id/images',
    handle: ({ params, body }) => uploadImage(params.id, body as FormData),
  },
  {
    method: 'get',
    path: '/admin/categories',
    handle: async () => (await bget<BAdminCategory[]>('/admin/categories')).map(toAdminCategory),
  },
  {
    method: 'post',
    path: '/admin/categories',
    handle: ({ body }) =>
      categoryChange(async () => {
        const { name, parent_id } = body as { name: string; parent_id: string | null }
        return categoryOk(
          await bsend<{ id: string; nombre: string }>('post', '/admin/categories', {
            nombre: name,
            padre_id: parent_id,
          }).catch(fieldError({ nombre: 'name', padre_id: 'parent_id' })),
        )
      }),
  },
  {
    method: 'patch',
    path: '/admin/categories/:id',
    handle: ({ params, body }) =>
      categoryChange(async () =>
        categoryOk(
          await bsend<{ id: string; nombre: string }>('patch', `/admin/categories/${params.id}`, {
            nombre: (body as { name: string }).name,
          }).catch(fieldError({ nombre: 'name' })),
        ),
      ),
  },
  {
    method: 'delete',
    path: '/admin/categories/:id',
    handle: ({ params }) => categoryChange(() => bsend('delete', `/admin/categories/${params.id}`)),
  },
  {
    method: 'get',
    path: '/admin/orders',
    handle: async ({ query }) => {
      const data = await bget<{
        page: number
        page_size: number
        total: number
        items: BOrderRow[]
        conteos: Record<string, number>
      }>('/admin/orders', {
        q: query.q,
        sucursal_id: query.store_id,
        dias: query.days,
        grupo: query.status_group,
        page: query.page,
      })
      const items = data.items.map((r) => ({
        id: r.id,
        folio: r.folio,
        customer: r.cliente,
        email: r.email,
        fulfillment_label: r.entrega,
        created_at: r.fecha,
        total: toCents(r.total),
        status: toStatus(r.estado),
      }))
      return { ...page(data, items), counts: data.conteos }
    },
  },
  {
    method: 'get',
    path: '/admin/orders/:id',
    handle: async ({ params }) => toAdminOrder(await bget<BAdminOrder>(`/admin/orders/${params.id}`)),
  },
  {
    method: 'post',
    path: '/admin/orders/:id/status',
    handle: async ({ params, body }) => {
      const { to, note } = body as { to: OrderStatus; note?: string }
      return toAdminOrder(
        await bsend<BAdminOrder>('post', `/admin/orders/${params.id}/estado`, {
          estado: fromStatus(to),
          nota: note,
        }),
      )
    },
  },
  {
    method: 'get',
    path: '/admin/users',
    handle: async ({ query }) => {
      const data = await bget<{ page: number; page_size: number; total: number; items: BAdminUser[] }>(
        '/admin/users',
        {
          q: query.q,
          rol: query.role,
          page: query.page,
        },
      )
      return page(data, data.items.map(toAdminUser))
    },
  },
  {
    method: 'post',
    path: '/admin/users',
    handle: async ({ body }) => {
      const { name, email, role, branch_id } = body as StaffInput
      const created = await bsend<BStaffCreated>('post', '/admin/users', {
        nombre: name,
        email,
        tipo_usuario: role,
        sucursal_id: branch_id,
      }).catch(fieldError({ nombre: 'name', tipo_usuario: 'role', sucursal_id: 'branch_id' }))
      return {
        id: created.id,
        name: created.nombre,
        email: created.email,
        role: created.tipo_usuario,
        branch_id: created.sucursal_id,
        temporary_password: created.password_temporal,
      }
    },
  },
  {
    method: 'patch',
    path: '/admin/users/:id',
    handle: ({ params, body }) => {
      const { role, branch_id } = body as { role: string; branch_id?: string | null }
      return bsend('patch', `/admin/users/${params.id}`, {
        tipo_usuario: role,
        sucursal_id: branch_id ?? null,
      }).catch(fieldError({ sucursal_id: 'branch_id' }))
    },
  },
  {
    method: 'post',
    path: '/admin/users/:id/unlock',
    handle: ({ params }) => bsend('post', `/admin/users/${params.id}/desbloquear`),
  },
  {
    method: 'get',
    path: '/admin/reports',
    handle: async ({ query }) => toReport(await bget<BReport>('/admin/reports', { periodo: query.period })),
  },
  {
    method: 'get',
    path: '/admin/settings',
    handle: async () => toSettings(await bget<BSettings>('/admin/settings')),
  },
  {
    method: 'patch',
    path: '/admin/settings',
    handle: async ({ body }) =>
      toSettings(await bsend<BSettings>('patch', '/admin/settings', settingsBody(body as SettingsPatch))),
  },
]
