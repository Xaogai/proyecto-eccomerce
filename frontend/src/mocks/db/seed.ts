// Datos semilla. Los primeros registros de cada colección salen de los <script> de
// docs/diseno/prototipos/*.dc.html para que las pantallas se vean como el diseño;
// faker completa el volumen (paginación, tablas). Semilla fija: siempre los mismos datos.
import { fakerES_MX as faker } from '@faker-js/faker'
import type { Category } from '@/api/schemas/catalog'
import type { Role } from '@/api/schemas/auth'
import type { OrderStatus, PaymentStatus } from '@/lib/orderStatus'

// ---------- Tipos internos de la "base de datos" ----------

export interface DbVariant {
  sku: string
  label: string
  /** centavos */
  price: number
  /** piezas por sucursal */
  stock: Record<string, number>
  /** se puede enviar a domicilio */
  ship: boolean
}

export interface DbProduct {
  sku: string
  name: string
  brand: string
  description: string
  /** slug de la categoría hoja */
  category: string
  attrs: Record<string, string>
  specs: Array<{ k: string; v: string }>
  rating: { avg: number; count: number }
  variants: DbVariant[]
  has360: boolean
  status: 'publicado' | 'borrador'
  created_at: string
}

export interface DbStore {
  id: string
  name: string
  address: string
  zip: string
  hours: string
  phone: string
  lat: number
  lng: number
}

export interface DbUser {
  id: string
  name: string
  email: string
  password: string
  role: Role
  branch_id: string | null
  locked: boolean
  failed_attempts: number
  last_login: string | null
}

export interface DbOrder {
  id: string
  folio: string
  user_id: string | null
  guest_token: string | null
  status: OrderStatus
  payment_status: PaymentStatus
  created_at: string
  contact: { name: string; email: string; phone: string }
  items: Array<{
    id: string
    sku: string
    name: string
    variant_label: string
    unit_price: number
    qty: number
  }>
  shipping: number
  fulfillment:
    { type: 'ship'; address_label: string; tracking?: string } | { type: 'pickup'; store_id: string }
  timeline: Array<{ status: OrderStatus; at: string }>
  pickup_code?: string
  /** Pago simulado: la "pasarela" confirma (webhook) unos segundos después de pagar */
  payment?: { outcome: 'pagado' | 'rechazado'; confirms_at: number }
}

export interface DbAddress {
  id: string
  user_id: string
  alias: string
  name: string
  street: string
  ext: string
  int?: string
  colony: string
  zip: string
  city: string
  state: string
  phone: string
  references?: string
  is_default: boolean
}

export interface DbCartItem {
  id: string
  sku: string
  qty: number
}

// ---------- Sucursales (prototipos: Toluca Centro, Metepec, Lerma) ----------

export const stores: DbStore[] = [
  {
    id: 'toluca-centro',
    name: 'Toluca Centro',
    address: 'Av. Independencia 120, Centro, Toluca',
    zip: '50000',
    hours: 'Lun a sáb 7:00–21:00 · Dom 8:00–18:00',
    phone: '722 000 0001',
    lat: 19.2925,
    lng: -99.6569,
  },
  {
    id: 'metepec',
    name: 'Metepec',
    address: 'Av. Tecnológico 1500, San Salvador Tizatlalli, Metepec',
    zip: '52140',
    hours: 'Lun a sáb 7:00–21:00 · Dom 8:00–18:00',
    phone: '722 000 0002',
    lat: 19.2565,
    lng: -99.6047,
  },
  {
    id: 'lerma',
    name: 'Lerma',
    address: 'Carretera México-Toluca km 52, Lerma',
    zip: '52000',
    hours: 'Lun a sáb 8:00–20:00 · Dom 9:00–17:00',
    phone: '728 000 0003',
    lat: 19.2847,
    lng: -99.5114,
  },
  {
    id: 'zinacantepec',
    name: 'Zinacantepec',
    address: 'Av. 16 de Septiembre 300, Zinacantepec',
    zip: '51350',
    hours: 'Lun a sáb 8:00–20:00 · Dom 9:00–17:00',
    phone: '722 000 0004',
    lat: 19.2836,
    lng: -99.7339,
  },
]

// ---------- Categorías (8 departamentos del prototipo, 3 niveles) ----------

const cat = (name: string, slug: string, children: Category[] = []): Category => ({
  id: slug,
  slug,
  name,
  children,
})

export const categories: Category[] = [
  cat('Herramientas', 'herramientas', [
    cat('Herramientas eléctricas', 'herramientas-electricas', [
      cat('Taladros', 'taladros'),
      cat('Rotomartillos', 'rotomartillos'),
      cat('Sierras eléctricas', 'sierras-electricas'),
      cat('Baterías y cargadores', 'baterias-y-cargadores'),
    ]),
    cat('Herramientas manuales', 'herramientas-manuales', [
      cat('Martillos', 'martillos'),
      cat('Desarmadores', 'desarmadores'),
    ]),
  ]),
  cat('Construcción', 'construccion', [
    cat('Cemento y morteros', 'cemento-y-morteros', [
      cat('Cemento', 'cemento'),
      cat('Pegazulejo', 'pegazulejo'),
    ]),
  ]),
  cat('Pisos y azulejos', 'pisos-y-azulejos', [
    cat('Pisos', 'pisos', [
      cat('Pisos cerámicos', 'pisos-ceramicos'),
      cat('Pisos laminados', 'pisos-laminados'),
    ]),
  ]),
  cat('Pintura', 'pintura', [
    cat('Pintura para interiores', 'pintura-interiores', [
      cat('Vinílica', 'vinilica'),
      cat('Esmalte', 'esmalte'),
    ]),
  ]),
  cat('Plomería', 'plomeria', [cat('Tubería', 'tuberia', [cat('Tubería PVC', 'tuberia-pvc')])]),
  cat('Electricidad', 'electricidad', [cat('Cables', 'cables', [cat('Cable THW', 'cable-thw')])]),
  cat('Jardín', 'jardin', [cat('Riego', 'riego', [cat('Mangueras', 'mangueras')])]),
  cat('Ferretería', 'ferreteria', [
    cat('Fijación', 'fijacion', [cat('Taquetes', 'taquetes'), cat('Tornillos', 'tornillos')]),
  ]),
]

// ---------- Productos ----------

const toluca = (n: number, others = 6): Record<string, number> => ({
  'toluca-centro': n,
  metepec: others,
  lerma: Math.max(0, others - 3),
  zinacantepec: Math.max(0, others - 5),
})

const iso = (d: string) => new Date(d).toISOString()

/** Los 6 taladros del prototipo Escritorio-1-Listado y sus variantes de Escritorio-2-Ficha. */
const prototypeProducts: DbProduct[] = [
  {
    sku: '100245',
    name: 'Taladro percutor inalámbrico 1/2 pulg 20 V',
    brand: 'Volta',
    description:
      'Taladro percutor con motor de 20 V, mandril de 1/2 pulg sin llave y tres modos de trabajo: taladro, percutor y atornillador.',
    category: 'taladros',
    attrs: { alimentacion: 'Inalámbrico 20 V', mandril: '1/2 pulg' },
    specs: [
      { k: 'Alimentación', v: 'Batería de ion de litio 20 V' },
      { k: 'Mandril', v: '1/2 pulg, sin llave' },
      { k: 'Velocidad sin carga', v: '0 a 1,800 rpm' },
      { k: 'Modos', v: 'Taladro, percutor y atornillador' },
      { k: 'Peso', v: '1.6 kg sin batería' },
      { k: 'Garantía', v: '[Garantía del fabricante]' },
    ],
    rating: { avg: 4.6, count: 128 },
    variants: [
      { sku: '100245-0', label: 'Solo herramienta', price: 214900, stock: toluca(12), ship: true },
      {
        sku: '100245-1',
        label: 'Con 1 batería de 2 Ah y cargador',
        price: 289900,
        stock: toluca(8),
        ship: true,
      },
      {
        sku: '100245-2',
        label: 'Con 2 baterías, cargador y estuche',
        price: 349900,
        stock: toluca(2),
        ship: true,
      },
    ],
    has360: true,
    status: 'publicado',
    created_at: iso('2026-08-01'),
  },
  {
    sku: '100311',
    name: 'Kit taladro y atornillador 20 V con 2 baterías',
    brand: 'Volta',
    description: 'Kit con taladro y atornillador de impacto de 20 V, dos baterías, cargador y maletín.',
    category: 'taladros',
    attrs: { alimentacion: 'Inalámbrico 20 V', mandril: '1/2 pulg' },
    specs: [
      { k: 'Alimentación', v: 'Batería de ion de litio 20 V' },
      { k: 'Incluye', v: 'Taladro, atornillador, 2 baterías, cargador y maletín' },
    ],
    rating: { avg: 4.4, count: 56 },
    variants: [
      { sku: '100311-0', label: 'Baterías de 1.5 Ah', price: 349900, stock: toluca(7), ship: true },
      { sku: '100311-1', label: 'Baterías de 4 Ah', price: 429900, stock: toluca(3), ship: true },
    ],
    has360: false,
    status: 'publicado',
    created_at: iso('2026-07-15'),
  },
  {
    sku: '200118',
    name: 'Rotomartillo SDS Plus 800 W',
    brand: 'Brava',
    description: 'Rotomartillo de 800 W con sistema SDS Plus para concreto y mampostería.',
    category: 'taladros',
    attrs: { alimentacion: 'Eléctrico 127 V', mandril: '1/2 pulg' },
    specs: [
      { k: 'Potencia', v: '800 W' },
      { k: 'Sistema', v: 'SDS Plus' },
    ],
    rating: { avg: 4.7, count: 41 },
    variants: [{ sku: '200118-0', label: 'Única', price: 289900, stock: toluca(3, 4), ship: true }],
    has360: false,
    status: 'publicado',
    created_at: iso('2026-06-20'),
  },
  {
    sku: '100402',
    name: 'Taladro atornillador compacto 12 V',
    brand: 'Volta',
    description: 'Taladro atornillador ligero de 12 V para trabajos en casa.',
    category: 'taladros',
    attrs: { alimentacion: 'Inalámbrico 12 V', mandril: '3/8 pulg' },
    specs: [{ k: 'Alimentación', v: 'Batería de ion de litio 12 V' }],
    rating: { avg: 4.2, count: 33 },
    variants: [
      {
        sku: '100402-0',
        label: 'Única',
        price: 129900,
        stock: { 'toluca-centro': 0, metepec: 5, lerma: 0, zinacantepec: 0 },
        ship: true,
      },
    ],
    has360: false,
    status: 'publicado',
    created_at: iso('2026-05-02'),
  },
  {
    sku: '300077',
    name: 'Taladro eléctrico 3/8 pulg 600 W',
    brand: 'Ferro',
    description: 'Taladro eléctrico de 600 W con mandril de 3/8 pulg.',
    category: 'taladros',
    attrs: { alimentacion: 'Eléctrico 127 V', mandril: '3/8 pulg' },
    specs: [{ k: 'Potencia', v: '600 W' }],
    rating: { avg: 4.1, count: 87 },
    variants: [{ sku: '300077-0', label: 'Única', price: 84900, stock: toluca(20, 12), ship: true }],
    has360: false,
    status: 'publicado',
    created_at: iso('2026-04-11'),
  },
  {
    sku: '300190',
    name: 'Taladro de banco 1/2 HP, 5 velocidades',
    brand: 'Ferro',
    description: 'Taladro de banco de 1/2 HP con 5 velocidades. Disponible solo con envío a domicilio.',
    category: 'taladros',
    attrs: { alimentacion: 'Eléctrico 127 V', mandril: '1/2 pulg' },
    specs: [{ k: 'Motor', v: '1/2 HP' }],
    rating: { avg: 4.5, count: 12 },
    variants: [
      {
        sku: '300190-0',
        label: 'Única',
        price: 459000,
        stock: { 'toluca-centro': 0, metepec: 0, lerma: 0, zinacantepec: 0 },
        ship: true,
      },
    ],
    has360: false,
    status: 'publicado',
    created_at: iso('2026-03-30'),
  },
]

/** Atributos de filtro y nombres base por categoría hoja, para generar productos. */
const generators: Record<
  string,
  { nouns: string[]; attrs: Record<string, string[]>; price: [number, number] }
> = {
  taladros: {
    nouns: ['Taladro inalámbrico', 'Taladro percutor', 'Taladro eléctrico'],
    attrs: {
      alimentacion: ['Inalámbrico 12 V', 'Inalámbrico 20 V', 'Eléctrico 127 V'],
      mandril: ['1/4 pulg', '3/8 pulg', '1/2 pulg'],
    },
    price: [700, 4500],
  },
  rotomartillos: {
    nouns: ['Rotomartillo SDS Plus', 'Rotomartillo SDS Max'],
    attrs: { alimentacion: ['Inalámbrico 20 V', 'Eléctrico 127 V'] },
    price: [1800, 7500],
  },
  'sierras-electricas': {
    nouns: ['Sierra circular', 'Sierra caladora', 'Sierra ingleteadora'],
    attrs: { alimentacion: ['Inalámbrico 20 V', 'Eléctrico 127 V'] },
    price: [900, 6800],
  },
  'baterias-y-cargadores': {
    nouns: ['Batería 20 V', 'Cargador rápido 20 V', 'Kit de 2 baterías'],
    attrs: { capacidad: ['2 Ah', '4 Ah', '6 Ah'] },
    price: [500, 2600],
  },
  martillos: {
    nouns: ['Martillo de uña', 'Mazo de goma', 'Marro'],
    attrs: { peso: ['16 oz', '20 oz', '3 lb'] },
    price: [120, 650],
  },
  desarmadores: {
    nouns: ['Juego de desarmadores', 'Desarmador de precisión', 'Desarmador de caja'],
    attrs: { piezas: ['1 pieza', '6 piezas', '12 piezas'] },
    price: [60, 520],
  },
  cemento: {
    nouns: ['Cemento gris', 'Cemento blanco', 'Mortero'],
    attrs: { presentacion: ['25 kg', '50 kg'] },
    price: [150, 420],
  },
  pegazulejo: {
    nouns: ['Pegazulejo', 'Adhesivo para porcelanato'],
    attrs: { presentacion: ['20 kg', '25 kg'] },
    price: [120, 380],
  },
  'pisos-ceramicos': {
    nouns: ['Piso cerámico', 'Piso porcelánico'],
    attrs: { medida: ['33 x 33 cm', '45 x 45 cm', '60 x 60 cm'] },
    price: [140, 520],
  },
  'pisos-laminados': {
    nouns: ['Piso laminado', 'Piso vinílico'],
    attrs: { grosor: ['7 mm', '8 mm', '12 mm'] },
    price: [220, 680],
  },
  vinilica: {
    nouns: ['Pintura vinílica', 'Pintura vinil-acrílica'],
    attrs: { presentacion: ['1 L', '4 L', '19 L'], acabado: ['Mate', 'Satinado'] },
    price: [180, 2600],
  },
  esmalte: {
    nouns: ['Esmalte alquidálico', 'Esmalte base agua'],
    attrs: { presentacion: ['1 L', '4 L'], acabado: ['Brillante', 'Semimate'] },
    price: [210, 1400],
  },
  'tuberia-pvc': {
    nouns: ['Tubo PVC hidráulico', 'Codo PVC', 'Tee PVC'],
    attrs: { diametro: ['1/2 pulg', '3/4 pulg', '1 pulg'] },
    price: [15, 260],
  },
  'cable-thw': {
    nouns: ['Cable THW', 'Cable dúplex'],
    attrs: { calibre: ['12 AWG', '14 AWG', '10 AWG'] },
    price: [600, 2100],
  },
  mangueras: {
    nouns: ['Manguera reforzada', 'Manguera extensible'],
    attrs: { largo: ['15 m', '20 m', '30 m'] },
    price: [180, 950],
  },
  taquetes: {
    nouns: ['Taquete de plástico', 'Taquete expansivo', 'Ancla para concreto'],
    attrs: { medida: ['1/4 pulg', '5/16 pulg', '3/8 pulg'] },
    price: [25, 240],
  },
  tornillos: {
    nouns: ['Tornillo para madera', 'Tornillo autorroscante', 'Pija para tablaroca'],
    attrs: { medida: ['1 pulg', '1 1/2 pulg', '2 pulg'] },
    price: [30, 210],
  },
}

const BRANDS = ['Volta', 'Brava', 'Ferro', 'Taller Pro', 'Cumbre']

function generateProducts(): DbProduct[] {
  faker.seed(20261017)
  const out: DbProduct[] = []
  let sku = 400000
  for (const [category, g] of Object.entries(generators)) {
    const count = category === 'taladros' ? 42 : 8
    for (let i = 0; i < count; i++) {
      sku += faker.number.int({ min: 3, max: 40 })
      const attrs = Object.fromEntries(
        Object.entries(g.attrs).map(([k, vals]) => [k, faker.helpers.arrayElement(vals)]),
      )
      const noun = faker.helpers.arrayElement(g.nouns)
      const brand = faker.helpers.arrayElement(BRANDS)
      const variantCount = faker.helpers.weightedArrayElement([
        { weight: 6, value: 1 },
        { weight: 3, value: 2 },
        { weight: 1, value: 3 },
      ])
      const basePrice = faker.number.int({ min: g.price[0], max: g.price[1] }) * 100
      const variants: DbVariant[] = Array.from({ length: variantCount }, (_, v) => {
        const qty = faker.helpers.weightedArrayElement([
          { weight: 6, value: faker.number.int({ min: 6, max: 40 }) },
          { weight: 2, value: faker.number.int({ min: 1, max: 5 }) },
          { weight: 1, value: 0 },
        ])
        return {
          sku: `${sku}-${v}`,
          label: variantCount === 1 ? 'Única' : ['Básico', 'Con accesorios', 'Kit completo'][v],
          price: Math.round((basePrice * (1 + v * 0.3)) / 100) * 100,
          stock: toluca(qty, faker.number.int({ min: 0, max: 15 })),
          ship: true,
        }
      })
      // Sin palabras repetidas: "Taladro inalámbrico" + "Inalámbrico 20 V" → "Taladro inalámbrico 20 V"
      const used = new Set(noun.toLowerCase().split(' '))
      const extra = Object.values(attrs)
        .join(' ')
        .split(' ')
        .filter((w) => !used.has(w.toLowerCase()) && (used.add(w.toLowerCase()), true))
        .join(' ')
      out.push({
        sku: String(sku),
        name: `${noun} ${extra}`.trim(),
        brand,
        description: faker.commerce.productDescription(),
        category,
        attrs,
        specs: [
          ...Object.entries(attrs).map(([k, v]) => ({ k: attrTitles[k] ?? k, v })),
          { k: 'Marca', v: brand },
          { k: 'Garantía', v: '[Garantía del fabricante]' },
        ],
        rating: {
          avg: faker.number.float({ min: 3.4, max: 5, fractionDigits: 1 }),
          count: faker.number.int({ min: 0, max: 220 }),
        },
        variants,
        has360: false,
        status: faker.helpers.weightedArrayElement([
          { weight: 19, value: 'publicado' as const },
          { weight: 1, value: 'borrador' as const },
        ]),
        created_at: faker.date.between({ from: '2025-10-01', to: '2026-10-01' }).toISOString(),
      })
    }
  }
  return out
}

/** Nombre visible de cada atributo de filtro. */
export const attrTitles: Record<string, string> = {
  alimentacion: 'Alimentación',
  mandril: 'Mandril',
  capacidad: 'Capacidad',
  peso: 'Peso',
  piezas: 'Piezas',
  presentacion: 'Presentación',
  medida: 'Medida',
  grosor: 'Grosor',
  acabado: 'Acabado',
  diametro: 'Diámetro',
  calibre: 'Calibre',
  largo: 'Largo',
}

export const products: DbProduct[] = [...prototypeProducts, ...generateProducts()]

// ---------- Usuarios (contraseña de todos: Taller123) ----------

export const MOCK_PASSWORD = 'Taller123'

export const users: DbUser[] = [
  {
    id: 'u-cliente',
    name: 'Ana López',
    email: 'cliente@ejemplo.com',
    password: MOCK_PASSWORD,
    role: 'cliente',
    branch_id: null,
    locked: false,
    failed_attempts: 0,
    last_login: iso('2026-10-16T18:02:00'),
  },
  {
    id: 'u-staff',
    name: 'Sofía Treviño',
    email: 'staff@ejemplo.com',
    password: MOCK_PASSWORD,
    role: 'staff',
    branch_id: 'toluca-centro',
    locked: false,
    failed_attempts: 0,
    last_login: iso('2026-10-16T19:41:00'),
  },
  {
    id: 'u-admin',
    name: 'Luis Ramírez',
    email: 'admin@ejemplo.com',
    password: MOCK_PASSWORD,
    role: 'admin',
    branch_id: null,
    locked: false,
    failed_attempts: 0,
    last_login: iso('2026-10-17T09:00:00'),
  },
  {
    id: 'u-bloqueada',
    name: 'Jorge Méndez',
    email: 'bloqueada@ejemplo.com',
    password: MOCK_PASSWORD,
    role: 'cliente',
    branch_id: null,
    locked: true,
    failed_attempts: 5,
    last_login: iso('2026-10-16T21:37:00'),
  },
  {
    id: 'u-staff2',
    name: 'Mario Olvera',
    email: 'staff.metepec@ejemplo.com',
    password: MOCK_PASSWORD,
    role: 'staff',
    branch_id: 'metepec',
    locked: false,
    failed_attempts: 0,
    last_login: iso('2026-10-16T17:02:00'),
  },
  {
    id: 'u-cliente2',
    name: 'Rosa Pérez',
    email: 'rosa@ejemplo.com',
    password: MOCK_PASSWORD,
    role: 'cliente',
    branch_id: null,
    locked: false,
    failed_attempts: 0,
    last_login: iso('2026-10-15T10:20:00'),
  },
]

// ---------- Pedidos de Ana López (prototipo Escritorio-15-Pedidos) ----------

function timeline(statuses: OrderStatus[], start: string): DbOrder['timeline'] {
  const t0 = new Date(start).getTime()
  return statuses.map((status, i) => ({ status, at: new Date(t0 + i * 45 * 60_000).toISOString() }))
}

const contactoAna = { name: 'Ana López', email: 'cliente@ejemplo.com', phone: '722 123 4567' }

export const orders: DbOrder[] = [
  {
    id: '10482',
    folio: '10482',
    user_id: 'u-cliente',
    guest_token: null,
    status: 'listo_para_recoger',
    payment_status: 'pagado',
    created_at: iso('2026-10-16T14:30:00'),
    contact: contactoAna,
    items: [
      {
        id: 'i1',
        sku: '100245-1',
        name: 'Taladro percutor inalámbrico 1/2 pulg 20 V',
        variant_label: 'Con 1 batería de 2 Ah y cargador',
        unit_price: 289900,
        qty: 1,
      },
      {
        id: 'i2',
        sku: '300077-0',
        name: 'Taladro eléctrico 3/8 pulg 600 W',
        variant_label: 'Única',
        unit_price: 44800,
        qty: 1,
      },
    ],
    shipping: 0,
    fulfillment: { type: 'pickup', store_id: 'toluca-centro' },
    timeline: timeline(
      ['creado', 'pendiente_pago', 'pagado', 'en_preparacion', 'listo_para_recoger'],
      '2026-10-16T14:30:00',
    ),
    pickup_code: '4821',
  },
  {
    id: '10450',
    folio: '10450',
    user_id: 'u-cliente',
    guest_token: null,
    status: 'enviado',
    payment_status: 'pagado',
    created_at: iso('2026-10-12T11:00:00'),
    contact: contactoAna,
    items: [
      {
        id: 'i1',
        sku: '200118-0',
        name: 'Rotomartillo SDS Plus 800 W',
        variant_label: 'Única',
        unit_price: 84900,
        qty: 1,
      },
    ],
    shipping: 14900,
    fulfillment: { type: 'ship', address_label: 'Hidalgo 210, Toluca', tracking: 'MX123456789' },
    timeline: timeline(
      ['creado', 'pendiente_pago', 'pagado', 'en_preparacion', 'enviado'],
      '2026-10-12T11:00:00',
    ),
  },
  {
    id: '10311',
    folio: '10311',
    user_id: 'u-cliente',
    guest_token: null,
    status: 'entregado',
    payment_status: 'pagado',
    created_at: iso('2026-10-02T10:00:00'),
    contact: contactoAna,
    items: [
      {
        id: 'i1',
        sku: '400003-0',
        name: 'Taquete de plástico 1/4 pulg',
        variant_label: 'Única',
        unit_price: 4900,
        qty: 4,
      },
      {
        id: 'i2',
        sku: '400010-0',
        name: 'Martillo de uña 16 oz',
        variant_label: 'Única',
        unit_price: 32900,
        qty: 1,
      },
      {
        id: 'i3',
        sku: '400020-0',
        name: 'Juego de desarmadores 6 piezas',
        variant_label: 'Única',
        unit_price: 51900,
        qty: 1,
      },
    ],
    shipping: 0,
    fulfillment: { type: 'pickup', store_id: 'metepec' },
    timeline: timeline(
      ['creado', 'pendiente_pago', 'pagado', 'en_preparacion', 'listo_para_recoger', 'entregado'],
      '2026-10-02T10:00:00',
    ),
  },
  {
    id: '10107',
    folio: '10107',
    user_id: 'u-cliente',
    guest_token: null,
    status: 'reembolsado',
    payment_status: 'pagado',
    created_at: iso('2026-09-14T16:00:00'),
    contact: contactoAna,
    items: [
      {
        id: 'i1',
        sku: '400030-0',
        name: 'Manguera reforzada 20 m',
        variant_label: 'Única',
        unit_price: 42900,
        qty: 1,
      },
    ],
    shipping: 0,
    fulfillment: { type: 'pickup', store_id: 'toluca-centro' },
    timeline: timeline(
      [
        'creado',
        'pendiente_pago',
        'pagado',
        'en_preparacion',
        'listo_para_recoger',
        'entregado',
        'reembolsado',
      ],
      '2026-09-14T16:00:00',
    ),
  },
  {
    id: '10044',
    folio: '10044',
    user_id: 'u-cliente',
    guest_token: null,
    status: 'cancelado',
    payment_status: 'pendiente',
    created_at: iso('2026-09-03T12:00:00'),
    contact: contactoAna,
    items: [
      {
        id: 'i1',
        sku: '400040-0',
        name: 'Pintura vinílica 1 L Mate',
        variant_label: 'Única',
        unit_price: 21900,
        qty: 1,
      },
    ],
    shipping: 0,
    fulfillment: { type: 'pickup', store_id: 'toluca-centro' },
    timeline: timeline(['creado', 'pendiente_pago', 'cancelado'], '2026-09-03T12:00:00'),
  },
]

/** Feature flags del prototipo Admin-9-Configuracion. */
export const featureFlags = { v360: false, calc: true, cmp: true, rev: true, queue: true }

// ---------- Direcciones de Ana López (prototipo Escritorio-17-Direcciones) ----------

export const addresses: DbAddress[] = [
  {
    id: 'a-casa',
    user_id: 'u-cliente',
    alias: 'Casa',
    name: 'Ana López',
    street: 'Hidalgo',
    ext: '210',
    colony: 'Centro',
    zip: '50000',
    city: 'Toluca',
    state: 'Estado de México',
    phone: '722 123 4567',
    references: 'Portón negro',
    is_default: true,
  },
  {
    id: 'a-oficina',
    user_id: 'u-cliente',
    alias: 'Oficina',
    name: 'Ana López',
    street: 'Av. Tecnológico',
    ext: '1500',
    int: 'Piso 3',
    colony: 'San Salvador Tizatlalli',
    zip: '52140',
    city: 'Metepec',
    state: 'Estado de México',
    phone: '722 123 4567',
    is_default: false,
  },
]
