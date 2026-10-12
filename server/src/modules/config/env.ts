import { z } from 'zod'

export const envSchema = z.object({
  PORT: z.string().min(1).transform(val => {
    const num = Number(val)
    if (!Number.isFinite(num)) {
      throw new Error(`PORT must be a valid number, got "${val}"`)
    }
    return num
  }),
  DATABASE_URL: z.string().min(1).url(),
  TEST_DATABASE_URL: z.string().min(1).url().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().min(1).default('1h'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  TRUST_PROXY: z.string().min(1).transform(val => val === 'true').default('true'),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(): Env {
  const raw: Record<string, string | undefined> = {}
  for (const key of [
    'PORT',
    'DATABASE_URL',
    'TEST_DATABASE_URL',
    'JWT_SECRET',
    'JWT_EXPIRES_IN',
    'NODE_ENV',
    'CORS_ORIGIN',
    'TRUST_PROXY',
  ]) {
    raw[key] = process.env[key]
  }

  try {
    const result = envSchema.parse(raw)
    return result
  } catch (err) {
    const missing: string[] = []
    const validation: string[] = []

    if (err instanceof z.ZodError) {
      for (const e of err.errors) {
        if (e.code === 'invalid_type' && e.expected === 'string') {
          missing.push(String(e.path[0]))
        } else {
          validation.push(`${e.path.join('.')}: ${e.message}`)
        }
      }
    } else {
      // Transform errors or other Zod errors
      validation.push(err instanceof Error ? err.message : String(err))
    }

    const parts: string[] = []
    if (missing.length) parts.push(`Missing env vars: ${missing.join(', ')}`)
    if (validation.length) parts.push(`Invalid values: ${validation.join('; ')}`)

    throw new Error(`Environment validation failed:\n${parts.join('\n')}`)
  }
}
