import { z } from 'zod'

/** Hard limits shared by main and renderer. */
export const LIMITS = {
  maxRows: 10_000,
  maxFileBytes: 25 * 1024 * 1024,
  minPasswordLength: 8,
  maxLoginAttempts: 5,
  lockoutMinutes: 5,
  maxHtmlBytes: 500 * 1024
} as const

export const DEFAULT_SENDING = {
  batchSize: 100,
  requestsPerSecond: 2,
  maxRetries: 3,
  nameFallback: 'there'
} as const

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email())

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'At least 3 characters')
  .max(32, 'At most 32 characters')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Letters, numbers, dot, dash and underscore only')

export const passwordSchema = z
  .string()
  .min(LIMITS.minPasswordLength, `At least ${LIMITS.minPasswordLength} characters`)
  .max(128, 'At most 128 characters')

export const setupSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string()
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  })

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Required').max(64),
  password: z.string().min(1, 'Required').max(128)
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required').max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string()
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  })

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === '' || z.email().safeParse(v).success, 'Invalid email')

export const resendConfigSchema = z.object({
  /** Empty string keeps the stored key. */
  apiKey: z
    .string()
    .trim()
    .refine((v) => v === '' || /^re_[A-Za-z0-9_]{8,}$/.test(v), 'Key must start with re_'),
  fromName: z.string().trim().min(1, 'Required').max(100).regex(/^[^<>"\r\n]+$/, 'No <, >, " or line breaks'),
  fromEmail: emailSchema,
  replyTo: optionalEmail,
  unsubscribeEmail: optionalEmail,
  batchSize: z.coerce.number().int().min(1).max(100),
  requestsPerSecond: z.coerce.number().int().min(1).max(5),
  maxRetries: z.coerce.number().int().min(0).max(5),
  nameFallback: z.string().trim().min(1, 'Required').max(50)
})
export type ResendConfigInput = z.input<typeof resendConfigSchema>
export type ResendConfigValues = z.output<typeof resendConfigSchema>

export const preferencesSchema = z.object({
  autoLockMinutes: z.coerce.number().int().min(1).max(240)
})
export type Preferences = z.output<typeof preferencesSchema>

export const recipientSchema = z.object({
  row: z.number().int().min(1),
  email: emailSchema,
  name: z.string().max(200),
  fields: z.record(z.string().max(64), z.string().max(2000))
})

export const composeSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(998),
  html: z
    .string()
    .min(1, 'Body is required')
    .refine((v) => new TextEncoder().encode(v).length <= LIMITS.maxHtmlBytes, 'Body is too large (max 500 KB)')
})
export type ComposeValues = z.output<typeof composeSchema>

export const startCampaignSchema = composeSchema.extend({
  recipients: z.array(recipientSchema).min(1, 'No recipients').max(LIMITS.maxRows),
  sourceFile: z.string().max(260)
})

export const sendTestSchema = composeSchema.extend({
  to: emailSchema,
  sample: recipientSchema.optional()
})

export const parseRequestSchema = z.object({
  path: z.string().min(1).max(4096),
  mapping: z
    .object({
      name: z.string().max(200).nullable(),
      email: z.string().min(1).max(200)
    })
    .optional()
})

export const idSchema = z.string().regex(/^[a-z0-9-]{8,64}$/)

export const exportSchema = z.object({
  campaignId: idSchema,
  format: z.enum(['csv', 'xlsx']),
  filter: z.enum(['all', 'sent', 'failed']).default('all')
})
