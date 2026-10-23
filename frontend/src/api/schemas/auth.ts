// EP-20 a EP-26 y EP-33
import { z } from 'zod'

export const roleSchema = z.enum(['cliente', 'staff', 'admin'])
export type Role = z.infer<typeof roleSchema>

export const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  branch_id: z.string().nullable().optional(),
  branch_name: z.string().nullable().optional(),
})
export type User = z.infer<typeof userSchema>

/** refresh_token viaja en el cuerpo solo hasta la fase 7; después va en cookie HttpOnly (T-02). */
export const loginResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().int(),
  refresh_token: z.string().optional(),
  user: userSchema,
})
export type LoginResponse = z.infer<typeof loginResponseSchema>

export const refreshResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().int(),
  refresh_token: z.string().optional(),
})

export const featureFlagsSchema = z.object({
  v360: z.boolean(),
  calc: z.boolean(),
  cmp: z.boolean(),
  rev: z.boolean(),
  queue: z.boolean(),
})
export type FeatureFlags = z.infer<typeof featureFlagsSchema>
export type FeatureFlag = keyof FeatureFlags

// EP-27
export const addressSchema = z.object({
  id: z.string(),
  alias: z.string(),
  name: z.string(),
  street: z.string(),
  ext: z.string(),
  int: z.string().optional(),
  colony: z.string(),
  zip: z.string(),
  city: z.string(),
  state: z.string(),
  phone: z.string(),
  references: z.string().optional(),
  is_default: z.boolean(),
})
export type Address = z.infer<typeof addressSchema>

// EP-29 a EP-32 y EP-53
export const profileSchema = z.object({ name: z.string(), email: z.string(), phone: z.string() })
export type Profile = z.infer<typeof profileSchema>

export const consentsSchema = z.object({ marketing: z.boolean(), personalization: z.boolean() })
export type Consents = z.infer<typeof consentsSchema>

export const arcoResultSchema = z.object({ folio: z.string(), due_date: z.string() })
