// EP-19 y EP-27 a EP-32: devoluciones, direcciones, lista de deseos, perfil, consentimientos, ARCO y baja de cuenta.
import type { Address } from '../schemas/auth'
import type { WishlistItem } from '../schemas/catalog'
import { ApiError, toApiError } from '../errors'
import type { BUser } from './auth'
import { toSummary } from './catalog'
import { bget, bsend } from './http'
import { toStatus } from './orders'
import type { Route } from './router'
import { toCents } from './shared'
import type { BProduct } from './types'

export interface BAddress {
  id: string
  calle: string
  ciudad: string
  codigo_postal: string
  es_predeterminada: boolean
  alias: string | null
  nombre_recibe: string | null
  numero_exterior: string | null
  numero_interior: string | null
  colonia: string | null
  entidad: string | null
  telefono: string | null
  referencias: string | null
}

export function toAddress(a: BAddress): Address {
  return {
    id: a.id,
    alias: a.alias ?? 'Dirección',
    name: a.nombre_recibe ?? '',
    street: a.calle,
    ext: a.numero_exterior ?? '',
    int: a.numero_interior ?? undefined,
    colony: a.colonia ?? '',
    zip: a.codigo_postal,
    city: a.ciudad,
    state: a.entidad ?? '',
    phone: a.telefono ?? '',
    references: a.referencias ?? undefined,
    is_default: a.es_predeterminada,
  }
}

const ADDRESS_FIELDS: Record<string, keyof BAddress> = {
  alias: 'alias',
  name: 'nombre_recibe',
  street: 'calle',
  ext: 'numero_exterior',
  int: 'numero_interior',
  colony: 'colonia',
  zip: 'codigo_postal',
  city: 'ciudad',
  state: 'entidad',
  phone: 'telefono',
  references: 'referencias',
  is_default: 'es_predeterminada',
}

/** Solo los campos enviados (en PATCH se respeta lo que no cambió). */
export function fromAddress(input: Partial<Omit<Address, 'id'>>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    const target = ADDRESS_FIELDS[key]
    if (target) body[target] = value === '' && key === 'int' ? null : value
  }
  return body
}

const FIELD_BACK = Object.fromEntries(Object.entries(ADDRESS_FIELDS).map(([k, v]) => [v, k]))

function addressError(error: unknown): never {
  const e = toApiError(error)
  const fields = Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [FIELD_BACK[k] ?? k, v]))
  throw new ApiError(e.status, e.message, e.code, fields, e.data)
}

interface BWish {
  variante_sku: string
  precio_guardado: string
  producto: BProduct
}

export function toWishlistItem(w: BWish): WishlistItem {
  return {
    ...toSummary(w.producto),
    variant_sku: w.variante_sku,
    saved_price: toCents(w.precio_guardado),
  }
}

const toWishlist = (list: BWish[]) => list.map(toWishlistItem)

const profileOf = (u: BUser) => ({ name: u.nombre, email: u.email, phone: u.telefono ?? '' })
const consentsOf = (c: { acepta_marketing: boolean; acepta_personalizacion: boolean }) => ({
  marketing: c.acepta_marketing,
  personalization: c.acepta_personalizacion,
})

/** Contraseña incorrecta (400 del backend) → error en el campo, como lo muestra el formulario. */
function passwordError(field: string) {
  return (error: unknown): never => {
    const e = toApiError(error)
    if (e.code === 'wrong_password')
      throw new ApiError(422, e.message, 'validation_error', { [field]: e.message })
    throw e
  }
}

async function deleteAccount(body: { password: string }) {
  try {
    const res = await bsend<{ fecha_efectiva: string }>('delete', '/users/me', { password: body.password })
    return { effective_date: res.fecha_efectiva }
  } catch (error) {
    const e = toApiError(error)
    if (e.code === 'active_orders') {
      const pedidos = (e.data.pedidos ?? []) as { id: string; folio: string; estado: string }[]
      throw new ApiError(
        e.status,
        e.message,
        e.code,
        {},
        {
          orders: pedidos.map((p) => ({ id: p.id, folio: p.folio, status: toStatus(p.estado) })),
        },
      )
    }
    return passwordError('password')(e)
  }
}

const RETURN_FIELDS: Record<string, string> = {
  articulos: 'items',
  motivo: 'reason',
  foto: 'photo',
  metodo: 'method',
}

/** Multipart del contrato (data con items/reason/method y photo) → el del backend (data en español y foto). */
async function createReturn(orderId: string, form: FormData) {
  const data = JSON.parse(String(form.get('data') ?? '{}')) as {
    items: { item_id: string; qty: number }[]
    reason: string
    comment?: string
    method: string
  }
  const out = new FormData()
  out.append(
    'data',
    JSON.stringify({
      // El id del renglón del pedido es el SKU de la variante.
      articulos: data.items.map((i) => ({ variante_sku: i.item_id, cantidad: i.qty })),
      motivo: data.reason,
      comentario: data.comment || null,
      metodo: data.method,
    }),
  )
  const photo = form.get('photo')
  if (photo instanceof Blob) out.append('foto', photo)
  try {
    const res = await bsend<{
      id: string
      folio: string
      estado: string
      instrucciones: string
      monto_reembolso: string
    }>('post', `/orders/${orderId}/devoluciones`, out)
    return {
      id: res.id,
      folio: res.folio,
      status: res.estado,
      instructions: res.instrucciones,
      refund: toCents(res.monto_reembolso),
    }
  } catch (error) {
    const e = toApiError(error)
    const fields = Object.fromEntries(
      Object.entries(e.fieldErrors).map(([k, v]) => [RETURN_FIELDS[k] ?? k, v]),
    )
    throw new ApiError(e.status, e.message, e.code, fields, e.data)
  }
}

export const accountRoutes: Route[] = [
  {
    method: 'get',
    path: '/me/addresses',
    handle: async () => (await bget<BAddress[]>('/users/me/addresses')).map(toAddress),
  },
  {
    method: 'post',
    path: '/me/addresses',
    handle: async ({ body }) =>
      toAddress(
        await bsend<BAddress>('post', '/users/me/addresses', fromAddress(body as Address)).catch(
          addressError,
        ),
      ),
  },
  {
    method: 'patch',
    path: '/me/addresses/:id',
    handle: async ({ params, body }) =>
      toAddress(
        await bsend<BAddress>(
          'patch',
          `/users/me/addresses/${params.id}`,
          fromAddress(body as Address),
        ).catch(addressError),
      ),
  },
  {
    method: 'delete',
    path: '/me/addresses/:id',
    handle: async ({ params }) => {
      await bsend('delete', `/users/me/addresses/${params.id}`)
      return null
    },
  },
  {
    method: 'get',
    path: '/me/wishlist',
    handle: async () => toWishlist(await bget<BWish[]>('/users/me/deseos')),
  },
  {
    method: 'post',
    path: '/me/wishlist',
    handle: async ({ body }) =>
      toWishlist(
        await bsend<BWish[]>('post', '/users/me/deseos', { variante_sku: (body as { sku: string }).sku }),
      ),
  },
  {
    method: 'delete',
    path: '/me/wishlist/:sku',
    handle: async ({ params }) =>
      toWishlist(await bsend<BWish[]>('delete', `/users/me/deseos/${encodeURIComponent(params.sku)}`)),
  },
  { method: 'get', path: '/me/profile', handle: async () => profileOf(await bget<BUser>('/users/me')) },
  {
    method: 'patch',
    path: '/me/profile',
    handle: async ({ body }) => {
      const { name, phone } = body as { name: string; phone: string }
      return profileOf(await bsend<BUser>('put', '/users/me', { nombre: name, telefono: phone }))
    },
  },
  { method: 'get', path: '/me/consents', handle: async () => consentsOf(await bget<BUser>('/users/me')) },
  {
    method: 'patch',
    path: '/me/consents',
    handle: async ({ body }) => {
      const patch = body as { marketing?: boolean; personalization?: boolean }
      return consentsOf(
        await bsend('patch', '/users/me/consentimientos', {
          acepta_marketing: patch.marketing,
          acepta_personalizacion: patch.personalization,
        }),
      )
    },
  },
  {
    method: 'post',
    path: '/me/arco',
    handle: async ({ body }) => {
      const { type, detail } = body as { type: string; detail?: string }
      const res = await bsend<{ folio: string; fecha_limite: string }>('post', '/users/me/solicitudes-arco', {
        tipo: type,
        detalle: detail,
      })
      return { folio: res.folio, due_date: res.fecha_limite }
    },
  },
  { method: 'delete', path: '/me', handle: ({ body }) => deleteAccount(body as { password: string }) },
  {
    method: 'post',
    path: '/orders/:id/returns',
    handle: ({ params, body }) => createReturn(params.id, body as FormData),
  },
]
