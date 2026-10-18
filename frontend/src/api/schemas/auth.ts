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
