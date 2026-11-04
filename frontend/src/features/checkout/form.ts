import { z } from 'zod'

// Validación del formulario de checkout. Los mensajes dicen qué hacer, no solo qué falló (sec. 28).

const required = (message: string) => z.string().trim().min(1, message)

export const checkoutFormSchema = z
  .object({
    name: required('Escribe tu nombre completo.'),
    phone: z
      .string()
      .trim()
      .refine(
        (v) => v.replace(/\D/g, '').length === 10,
        'El teléfono tiene 10 dígitos, por ejemplo 722 123 4567.',
      ),
    email: z.string().trim().email('Escribe un correo válido, por ejemplo nombre@correo.com.'),
    fulfillment: z.enum(['pickup', 'ship']),
    storeId: z.string().optional(),
    /** "nueva" o el id de una dirección guardada */
    addressId: z.string().optional(),
    street: z.string().optional(),
    ext: z.string().optional(),
    int: z.string().optional(),
    colony: z.string().optional(),
    zip: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    references: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    const need = (field: keyof typeof v, message: string) => {
      if (!String(v[field] ?? '').trim()) ctx.addIssue({ code: 'custom', path: [field], message })
    }
    if (v.fulfillment === 'pickup') need('storeId', 'Elige la sucursal donde vas a recoger.')
    if (v.fulfillment === 'ship' && (!v.addressId || v.addressId === 'nueva')) {
      need('street', 'Escribe la calle.')
      need('ext', 'Escribe el número exterior.')
      need('colony', 'Escribe la colonia.')
      need('city', 'Escribe la ciudad o municipio.')
      need('state', 'Escribe el estado.')
      if (!/^\d{5}$/.test(v.zip ?? ''))
        ctx.addIssue({ code: 'custom', path: ['zip'], message: 'El código postal tiene 5 dígitos.' })
    }
  })

export type CheckoutForm = z.infer<typeof checkoutFormSchema>

/** Nombres de campo del 422 de la API → campos del formulario. */
export const apiFieldMap: Record<string, keyof CheckoutForm> = {
  'contact.name': 'name',
  'contact.email': 'email',
  'contact.phone': 'phone',
  store_id: 'storeId',
  address_id: 'addressId',
  'address.street': 'street',
  'address.ext': 'ext',
  'address.colony': 'colony',
  'address.zip': 'zip',
  'address.city': 'city',
  'address.state': 'state',
}
