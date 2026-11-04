// Respuestas del backend real (FastAPI, nombres en español, dinero en pesos con decimales).

export interface BCategory {
  id: string
  nombre: string
  categoria_padre_id: string | null
  subcategorias: BCategory[]
}

export interface BVariant {
  sku: string
  producto_id: string
  atributos: Record<string, unknown>
  precio: string
  imagen_url: string | null
  stock_disponible: number
  stock_sucursal: number | null
}

export interface BProduct {
  id: string
  categoria_id: string
  nombre: string
  descripcion: string | null
  marca: string | null
  variantes: BVariant[]
  estado: string
  especificaciones: Record<string, unknown>
  imagenes: { url: string; texto_alternativo: string }[]
  calificacion_promedio: number
  total_resenas: number
  ruta_categoria: { id: string; nombre: string }[]
}

export interface BPage<T> {
  page: number
  page_size: number
  total: number
  items: T[]
}

export interface BProductPage extends BPage<BProduct> {
  facetas: {
    clave: string
    titulo: string
    opciones: { valor: string; total: number; seleccionada: boolean }[]
  }[]
}

export interface BReview {
  id: string
  autor: string
  calificacion: number
  titulo: string
  comentario: string
  fecha: string
  compra_verificada: boolean
}

export interface BReviewPage extends BPage<BReview> {
  resumen: { promedio: number; total: number; por_estrellas: number[] }
}

export interface BStore {
  id: string
  nombre: string
  direccion_id: string | null
  calle: string | null
  ciudad: string | null
  codigo_postal: string | null
  telefono: string | null
  horario: string | null
  latitud: number | null
  longitud: number | null
  servicios: string[]
}

export interface BBranchStock {
  sucursal_id: string
  sucursal_nombre: string
  variante_sku: string
  cantidad_disponible: number
  cantidad_reservada: number
}

export interface BShippingQuote {
  codigo_postal: string
  [key: string]: unknown
}
