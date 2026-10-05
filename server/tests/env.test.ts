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
    delete process.env.JWT_SECRET

    expect(() => loadEnv()).toThrow('Environment validation failed')
  })

  it('throws when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL
    delete process.env.JWT_SECRET

    expect(() => loadEnv()).toThrow('Environment validation failed')
  })

  it('throws when JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET

    expect(() => loadEnv()).toThrow('Environment validation failed')
  })

  it('throws when JWT_SECRET is too short', () => {
    process.env.PORT = '3001'
    process.env.DATABASE_URL = 'postgresql://localhost/test'
    process.env.JWT_SECRET = 'short'

    expect(() => loadEnv()).toThrow('JWT_SECRET must be at least 32 characters')
  })

  it('throws when PORT is not a number', () => {
    process.env.PORT = 'not-a-number'
    process.env.DATABASE_URL = 'postgresql://localhost/test'
    process.env.JWT_SECRET = 'a'.repeat(32)

    expect(() => loadEnv()).toThrow('Environment validation failed')
  })

  it('throws when NODE_ENV is invalid', () => {
    process.env.PORT = '3001'
    process.env.DATABASE_URL = 'postgresql://localhost/test'
    process.env.JWT_SECRET = 'a'.repeat(32)
    process.env.NODE_ENV = 'invalid'

    expect(() => loadEnv()).toThrow('Environment validation failed')
  })

  it('returns parsed env when all required vars are present', () => {
    process.env.PORT = '3001'
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/prestoteca'
    process.env.JWT_SECRET = 'a'.repeat(32)
    process.env.NODE_ENV = 'test'

    const env = loadEnv()

    expect(env.PORT).toBe(3001)
    expect(env.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/prestoteca')
    expect(env.JWT_SECRET).toBe('a'.repeat(32))
    expect(env.NODE_ENV).toBe('test')
    expect(env.JWT_EXPIRES_IN).toBe('1h')
    expect(env.CORS_ORIGIN).toBe('http://localhost:5173')
    expect(env.TRUST_PROXY).toBe(true)
  })

  it('accepts valid NODE_ENV values', () => {
    process.env.PORT = '3001'
    process.env.DATABASE_URL = 'postgresql://localhost/test'
    process.env.JWT_SECRET = 'a'.repeat(32)

    for (const env of ['development', 'test', 'production'] as const) {
      process.env.NODE_ENV = env
      const result = loadEnv()
      expect(result.NODE_ENV).toBe(env)
    }
  })
})
