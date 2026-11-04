import { describe, expect, it } from 'vitest'
import { checkoutFormSchema } from './form'

const contact = { name: 'Ana López', phone: '722 123 4567', email: 'ana@correo.com' }
const address = {
  street: 'Av. Juárez',
  ext: '12',
  colony: 'Centro',
  zip: '52600',
  city: 'Tianguistenco',
  state: 'Estado de México',
}

/** Mensaje de error de cada campo que no pasó. */
function errors(input: Record<string, unknown>) {
  const result = checkoutFormSchema.safeParse(input)
  if (result.success) return {}
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]))
}

describe('formulario de checkout', () => {
  it('recoger en tienda solo pide contacto y sucursal', () => {
    expect(errors({ ...contact, fulfillment: 'pickup', storeId: 's-toluca' })).toEqual({})
    expect(errors({ ...contact, fulfillment: 'pickup' })).toEqual({
      storeId: 'Elige la sucursal donde vas a recoger.',
    })
  })

  it('el teléfono acepta espacios y guiones pero exige 10 dígitos', () => {
    expect(errors({ ...contact, phone: '722-123-4567', fulfillment: 'pickup', storeId: 's' })).toEqual({})
    expect(errors({ ...contact, phone: '722 123', fulfillment: 'pickup', storeId: 's' })).toEqual({
      phone: 'El teléfono tiene 10 dígitos, por ejemplo 722 123 4567.',
    })
  })

  it('rechaza nombre vacío y correo inválido con un mensaje que dice qué hacer', () => {
    const e = errors({
      name: '   ',
      phone: contact.phone,
      email: 'ana@',
      fulfillment: 'pickup',
      storeId: 's',
    })
    expect(e.name).toBe('Escribe tu nombre completo.')
    expect(e.email).toBe('Escribe un correo válido, por ejemplo nombre@correo.com.')
  })

  it('envío a una dirección nueva pide todos sus campos', () => {
    expect(errors({ ...contact, fulfillment: 'ship', addressId: 'nueva', ...address })).toEqual({})
    expect(errors({ ...contact, fulfillment: 'ship', addressId: 'nueva' })).toEqual({
      street: 'Escribe la calle.',
      ext: 'Escribe el número exterior.',
      colony: 'Escribe la colonia.',
      city: 'Escribe la ciudad o municipio.',
      state: 'Escribe el estado.',
      zip: 'El código postal tiene 5 dígitos.',
    })
  })

  it('el código postal tiene exactamente 5 dígitos', () => {
    expect(errors({ ...contact, fulfillment: 'ship', ...address, zip: '5260' })).toEqual({
      zip: 'El código postal tiene 5 dígitos.',
    })
  })

  it('con una dirección guardada no pide los campos de dirección', () => {
    expect(errors({ ...contact, fulfillment: 'ship', addressId: 'dir-1' })).toEqual({})
  })
})
