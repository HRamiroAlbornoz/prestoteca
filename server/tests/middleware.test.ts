import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'
import { createAuthMiddleware, type AuthRequest } from '../src/modules/middleware/auth.js'
import { passwordFingerprint } from '../src/modules/auth/sessionToken.js'
import { authRateLimiter } from '../src/modules/middleware/rateLimit.js'
import { originChecker } from '../src/modules/middleware/origin.js'

const SECRET = 'a'.repeat(32)

function createFakeRepo() {
  return {
    findActiveById: vi.fn(),
  }
}

describe('auth middleware', () => {
  it('returns 401 when no token is provided', async () => {
    const fakeRepo = createFakeRepo()
    const authMiddleware = createAuthMiddleware(fakeRepo, SECRET)
    const app = express()
    app.use(authMiddleware)
    app.get('/protected', (_req, res) => res.json({ ok: true }))

    const res = await request(app).get('/protected')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: { code: 'SESSION_REQUIRED', message: 'Authentication required' } })
  })

  it('returns 401 when token is invalid', async () => {
    const fakeRepo = createFakeRepo()
    const authMiddleware = createAuthMiddleware(fakeRepo, SECRET)
    const app = express()
    app.use(authMiddleware)
    app.get('/protected', (_req, res) => res.json({ ok: true }))

    // This app has no cookie parser, so the token goes in the header the middleware also reads
    const res = await request(app).get('/protected').set('Authorization', 'Bearer invalid.token.here')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: { code: 'SESSION_REQUIRED', message: 'Invalid or expired token' } })
  })

  it('R3a valid token with matching fingerprint returns 200 and calls findActiveById', async () => {
    const fakeRepo = {
      findActiveById: vi.fn().mockResolvedValue({
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hash-1',
        neighborhood: 'Centro',
        created_at: '2026-01-01',
      }),
    }
    const authMiddleware = createAuthMiddleware(fakeRepo, SECRET)
    const routeHandler = vi.fn((_req: AuthRequest, res) => res.json({ userId: _req.userId }))
    const app = express()
    app.use(authMiddleware)
    app.get('/protected', routeHandler)

    const token = jwt.sign({ id: 'user-1', pwf: passwordFingerprint('hash-1') }, SECRET)
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ userId: 'user-1' })
    expect(fakeRepo.findActiveById).toHaveBeenCalledWith('user-1')
    expect(routeHandler).toHaveBeenCalledTimes(1)
  })

  it('R3b token valid but findActiveById returns null (deleted account) returns 401', async () => {
    const fakeRepo = {
      findActiveById: vi.fn().mockResolvedValue(null),
    }
    const authMiddleware = createAuthMiddleware(fakeRepo, SECRET)
    const routeHandler = vi.fn((_req, res) => res.json({ ok: true }))
    const app = express()
    app.use(authMiddleware)
    app.get('/protected', routeHandler)

    const token = jwt.sign({ id: 'user-1', pwf: passwordFingerprint('hash-1') }, SECRET)
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: { code: 'SESSION_REQUIRED', message: 'Invalid or expired token' } })
    expect(routeHandler).not.toHaveBeenCalled()
  })

  it('R3c token with wrong fingerprint (password changed) returns 401', async () => {
    const fakeRepo = {
      findActiveById: vi.fn().mockResolvedValue({
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hash-2',
        neighborhood: 'Centro',
        created_at: '2026-01-01',
      }),
    }
    const authMiddleware = createAuthMiddleware(fakeRepo, SECRET)
    const routeHandler = vi.fn((_req: AuthRequest, res) => res.json({ ok: true }))
    const app = express()
    app.use(authMiddleware)
    app.get('/protected', routeHandler)

    const token = jwt.sign({ id: 'user-1', pwf: passwordFingerprint('hash-1') }, SECRET)
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: { code: 'SESSION_REQUIRED', message: 'Invalid or expired token' } })
    expect(routeHandler).not.toHaveBeenCalled()
  })

  it('R3d token without pwf (old token) returns 401 without calling findActiveById', async () => {
    const fakeRepo = {
      findActiveById: vi.fn(),
    }
    const authMiddleware = createAuthMiddleware(fakeRepo, SECRET)
    const routeHandler = vi.fn((_req: AuthRequest, res) => res.json({ ok: true }))
    const app = express()
    app.use(authMiddleware)
    app.get('/protected', routeHandler)

    const token = jwt.sign({ id: 'user-1' }, SECRET)
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: { code: 'SESSION_REQUIRED', message: 'Invalid or expired token' } })
    expect(routeHandler).not.toHaveBeenCalled()
    expect(fakeRepo.findActiveById).not.toHaveBeenCalled()
  })

  it('R3e database error returns 500 INTERNAL_ERROR', async () => {
    const fakeRepo = {
      findActiveById: vi.fn().mockRejectedValue(new Error('db down')),
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const authMiddleware = createAuthMiddleware(fakeRepo, SECRET)
    const routeHandler = vi.fn((_req: AuthRequest, res) => res.json({ ok: true }))
    const app = express()
    app.use(authMiddleware)
    app.get('/protected', routeHandler)

    const token = jwt.sign({ id: 'user-1', pwf: passwordFingerprint('hash-1') }, SECRET)
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Failed to check session' } })
    expect(routeHandler).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('rate limiter middleware', () => {
  it('returns 429 after 5 requests per minute from same IP', async () => {
    const app = express()
    app.use(authRateLimiter)
    app.post('/api', (_req, res) => res.json({ ok: true }))

    // Send 5 requests — all should pass
    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api')
      expect(res.status).toBe(200)
    }

    // 6th request should be rate limited
    const res = await request(app).post('/api')
    expect(res.status).toBe(429)
    expect(res.body).toEqual({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    })
  })
})

describe('origin checker middleware', () => {
  it('returns 403 on POST without Origin header', async () => {
    const app = express()
    app.use(originChecker)
    app.post('/api', (_req, res) => res.json({ ok: true }))

    const res = await request(app).post('/api')
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Invalid origin' } })
  })

  it('returns 403 on PATCH without Origin header', async () => {
    const app = express()
    app.use(originChecker)
    app.patch('/api', (_req, res) => res.json({ ok: true }))

    const res = await request(app).patch('/api')
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Invalid origin' } })
  })

  it('returns 403 on DELETE without Origin header', async () => {
    const app = express()
    app.use(originChecker)
    app.delete('/api', (_req, res) => res.json({ ok: true }))

    const res = await request(app).delete('/api')
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Invalid origin' } })
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
