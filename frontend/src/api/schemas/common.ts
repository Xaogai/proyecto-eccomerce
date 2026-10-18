import { z } from 'zod'

/** Dinero en centavos MXN (T-03). */
export const money = z.number().int()

export const isoDate = z.string()

/** `{ items, page, page_size, total }` (convención de paginación del contrato). */
export const page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    page_size: z.number().int(),
    total: z.number().int(),
  })

export type Page<T> = { items: T[]; page: number; page_size: number; total: number }

export const imageSchema = z.object({ url: z.string(), alt: z.string() })
export type Image = z.infer<typeof imageSchema>

export const toneSchema = z.enum(['ok', 'aviso', 'error', 'info', 'neutro'])
