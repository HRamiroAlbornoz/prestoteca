import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/index.js'
import { resetRateLimiter } from '../src/modules/middleware/rateLimit.js'

// These tests build the real app (createApp → wireRoutes), not a hand-made copy,
// so they check how the routes are actually wired in production.
// CORS_ORIGIN is not set here, so the allowed origin is the default http://localhost:5173.
const ALLOWED_ORIGIN = 'http://localhost:5173'

describe('origin check wiring on /api/auth', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.PORT = '3001'
    process.env.DATABASE_URL = 'postgresql://invalid:invalid@localhost:9999/nonexistent'
    process.env.JWT_SECRET = 'a'.repeat(32)
    process.env.NODE_ENV = 'test'
    // The auth rate limiter allows 5 requests per minute; start every test from zero
    resetRateLimiter()
  })

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  })

  it.each(['/api/auth/login', '/api/auth/register', '/api/auth/logout'])(
    'returns 403 on POST %s without an Origin header',
    async (path) => {
      const app = await createApp()

      const res = await request(app).post(path).send({})

      expect(res.status).toBe(403)
      expect(res.body.error.message).toBe('Invalid origin')
    },
  )

  it('returns 403 on POST /api/auth/login from a foreign origin', async () => {
    const app = await createApp()

    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({})

    expect(res.status).toBe(403)
  })

  it('lets POST /api/auth/login through to the handler with the allowed origin', async () => {
    const app = await createApp()

    // An empty body is rejected by the login handler itself (400), which proves the
    // request got past the origin check without needing a database
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', ALLOWED_ORIGIN)
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('Missing required fields')
  })
})
