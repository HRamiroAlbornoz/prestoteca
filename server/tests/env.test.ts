import { describe, expect, it, afterEach } from 'vitest'
import { loadEnv, envSchema } from '../src/modules/config/env'

describe('env validation', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    // Restore all env vars after each test
    for (const key of Object.keys(process.env)) {
      delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  })

  it('throws when PORT is missing', () => {
    delete process.env.PORT
    delete process.env.DATABASE_URL

    expect(() => loadEnv()).toThrow('Environment validation failed')
  })

  it('throws when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL

    expect(() => loadEnv()).toThrow('Environment validation failed')
  })

  it('AC-10 starts without JWT_SECRET or JWT_EXPIRES_IN: the server no longer signs tokens', () => {
    process.env.PORT = '3001'
    process.env.DATABASE_URL = 'postgresql://localhost/test'
    delete process.env.JWT_SECRET
    delete process.env.JWT_EXPIRES_IN

    const env = loadEnv()

    expect(env.PORT).toBe(3001)
    expect(env).not.toHaveProperty('JWT_SECRET')
    expect(env).not.toHaveProperty('JWT_EXPIRES_IN')
    expect(Object.keys(envSchema.shape)).not.toContain('JWT_SECRET')
    expect(Object.keys(envSchema.shape)).not.toContain('JWT_EXPIRES_IN')
  })

  it('AC-10 ignores a JWT_SECRET left in the environment, even a short one (Railway keeps it for a rollback)', () => {
    process.env.PORT = '3001'
    process.env.DATABASE_URL = 'postgresql://localhost/test'
    process.env.JWT_SECRET = 'short'
    process.env.JWT_EXPIRES_IN = '1h'

    const env = loadEnv()

    expect(env).not.toHaveProperty('JWT_SECRET')
    expect(env).not.toHaveProperty('JWT_EXPIRES_IN')
  })

  it('throws when PORT is not a number', () => {
    process.env.PORT = 'not-a-number'
    process.env.DATABASE_URL = 'postgresql://localhost/test'

    expect(() => loadEnv()).toThrow('Environment validation failed')
  })

  it('throws when NODE_ENV is invalid', () => {
    process.env.PORT = '3001'
    process.env.DATABASE_URL = 'postgresql://localhost/test'
    process.env.NODE_ENV = 'invalid'

    expect(() => loadEnv()).toThrow('Environment validation failed')
  })

  it('returns parsed env when all required vars are present', () => {
    process.env.PORT = '3001'
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/prestoteca'
    process.env.NODE_ENV = 'test'

    const env = loadEnv()

    expect(env.PORT).toBe(3001)
    expect(env.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/prestoteca')
    expect(env.NODE_ENV).toBe('test')
    expect(env.CORS_ORIGIN).toBe('http://localhost:5173')
    expect(env.TRUST_PROXY).toBe(true)
  })

  it('accepts valid NODE_ENV values', () => {
    process.env.PORT = '3001'
    process.env.DATABASE_URL = 'postgresql://localhost/test'

    for (const env of ['development', 'test', 'production'] as const) {
      process.env.NODE_ENV = env
      const result = loadEnv()
      expect(result.NODE_ENV).toBe(env)
    }
  })
})
