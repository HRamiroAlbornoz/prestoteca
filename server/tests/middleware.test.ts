import { describe, expect, it, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { authMiddleware } from '../src/modules/middleware/auth.js'
import { rateLimiter } from '../src/modules/middleware/rateLimit.js'
import { originChecker } from '../src/modules/middleware/origin.js'

describe('auth middleware', () => {
  it('returns 401 when no token is provided', async () => {
    const app = express()
    app.use(authMiddleware)
    app.get('/protected', (_req, res) => res.json({ ok: true }))

    const res = await request(app).get('/protected')
    expect(res.status).toBe(401)
  })

  it('returns 401 when token is invalid', async () => {
    const app = express()
    app.use(authMiddleware)
    app.get('/protected', (_req, res) => res.json({ ok: true }))

    const res = await request(app).get('/protected').set('Cookie', 'token=invalid.token.here')
    expect(res.status).toBe(401)
  })
})

describe('rate limiter middleware', () => {
  it('returns 429 after 5 requests per minute from same IP', async () => {
    const app = express()
    app.use(rateLimiter)
    app.post('/api', (_req, res) => res.json({ ok: true }))

    // Send 5 requests — all should pass
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api')
      expect(res.status).toBe(200)
    }

    // 6th request should be rate limited
    const res = await request(app).post('/api')
    expect(res.status).toBe(429)
  })
})

describe('origin checker middleware', () => {
  it('returns 403 on POST without Origin header', async () => {
    const app = express()
    app.use(originChecker)
    app.post('/api', (_req, res) => res.json({ ok: true }))

    const res = await request(app).post('/api')
    expect(res.status).toBe(403)
  })

  it('returns 403 on PATCH without Origin header', async () => {
    const app = express()
    app.use(originChecker)
    app.patch('/api', (_req, res) => res.json({ ok: true }))

    const res = await request(app).patch('/api')
    expect(res.status).toBe(403)
  })

  it('returns 403 on DELETE without Origin header', async () => {
    const app = express()
    app.use(originChecker)
    app.delete('/api', (_req, res) => res.json({ ok: true }))

    const res = await request(app).delete('/api')
    expect(res.status).toBe(403)
  })

  it('allows POST with valid Origin header', async () => {
    const app = express()
    app.use(originChecker)
    app.post('/api', (_req, res) => res.json({ ok: true }))

    const res = await request(app).post('/api').set('Origin', 'http://localhost:5173')
    expect(res.status).toBe(200)
  })

  it('allows GET requests without Origin header', async () => {
    const app = express()
    app.use(originChecker)
    app.get('/api', (_req, res) => res.json({ ok: true }))

    const res = await request(app).get('/api')
    expect(res.status).toBe(200)
  })
})
