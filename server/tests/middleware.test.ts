import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { createAuthMiddleware, type AuthRequest } from '../src/modules/middleware/auth.js'
import { hashSessionToken, idleCutoffs, newSessionToken } from '../src/modules/auth/sessionToken.js'
import { authRateLimiter } from '../src/modules/middleware/rateLimit.js'
import { originChecker } from '../src/modules/middleware/origin.js'
import type { SessionRepository } from '../src/modules/auth/sessionRepo.js'

const SESSION_REQUIRED = { error: { code: 'SESSION_REQUIRED', message: 'Authentication required' } }
// An old JWT: three dotted parts, never a value the server issues now
const OLD_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6InVzZXItMSJ9.c2lnbmF0dXJlLXRoYXQtaXMtbm90LXJlYWw'

// A real app with cookie-parser (as index.ts mounts it), the middleware and one protected route
function createApp(touchActive: Mock) {
  const routeHandler = vi.fn((req: AuthRequest, res: express.Response) => {
    res.json({ userId: req.userId, sessionTokenHash: req.sessionTokenHash })
  })
  const app = express()
  app.use(cookieParser())
  app.use(createAuthMiddleware({ touchActive: touchActive as SessionRepository['touchActive'] }))
  app.get('/protected', routeHandler)
  return { app, routeHandler }
}

describe('auth middleware (server sessions)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('AC-16 no cookie → 401, no database call, and no cookie of its own', async () => {
    const touchActive = vi.fn()
    const { app, routeHandler } = createApp(touchActive)

    const res = await request(app).get('/protected')

    expect(res.status).toBe(401)
    expect(res.body).toEqual(SESSION_REQUIRED)
    expect(res.headers['set-cookie']).toBeUndefined()
    expect(touchActive).not.toHaveBeenCalled()
    expect(routeHandler).not.toHaveBeenCalled()
  })

  it('AC-10 an old JWT cookie and a j:{} cookie → 401 and the cookie is cleared, without touching the database', async () => {
    for (const cookie of [`token=${OLD_JWT}`, 'token=j:{}']) {
      const touchActive = vi.fn()
      const { app, routeHandler } = createApp(touchActive)

      const res = await request(app).get('/protected').set('Cookie', cookie)

      expect(res.status, cookie).toBe(401)
      expect(res.body, cookie).toEqual(SESSION_REQUIRED)
      expect(res.headers['set-cookie']?.at(-1), cookie).toMatch(/^token=;.*Expires=Thu, 01 Jan 1970/)
      expect(touchActive, cookie).not.toHaveBeenCalled()
      expect(routeHandler, cookie).not.toHaveBeenCalled()
    }
  })

  it('AC-10 the Authorization: Bearer header is no longer read', async () => {
    const touchActive = vi.fn()
    const { app } = createApp(touchActive)

    const res = await request(app).get('/protected').set('Authorization', `Bearer ${newSessionToken()}`)

    expect(res.status).toBe(401)
    expect(touchActive).not.toHaveBeenCalled()
  })

  it('AC-29 a well-formed cookie of an unknown, expired or revoked session → 401 and the cookie is cleared', async () => {
    const touchActive = vi.fn().mockResolvedValue(null)
    const { app, routeHandler } = createApp(touchActive)

    const res = await request(app).get('/protected').set('Cookie', `token=${newSessionToken()}`)

    expect(res.status).toBe(401)
    expect(res.body).toEqual(SESSION_REQUIRED)
    expect(res.headers['set-cookie']?.at(-1)).toMatch(/^token=;.*Expires=Thu, 01 Jan 1970/)
    expect(routeHandler).not.toHaveBeenCalled()
  })

  it('AC-35 AC-2 asks the repository with the hash of the cookie, the app clock and idleCutoffs(now)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const now = new Date('2026-11-19T10:00:00.000Z')
    vi.setSystemTime(now)
    const token = newSessionToken()
    const touchActive = vi.fn().mockResolvedValue({ userId: 'user-1', remember: false })
    const { app } = createApp(touchActive)

    await request(app).get('/protected').set('Cookie', `token=${token}`)

    expect(touchActive).toHaveBeenCalledTimes(1)
    expect(touchActive).toHaveBeenCalledWith(hashSessionToken(token), now, idleCutoffs(now))
    expect(touchActive.mock.calls[0]?.[0]).not.toBe(token)
  })

  it('AC-21 a valid "Recordarme" session goes through and the cookie is sent again with the same value and 7 days', async () => {
    const token = newSessionToken()
    const touchActive = vi.fn().mockResolvedValue({ userId: 'user-1', remember: true })
    const { app, routeHandler } = createApp(touchActive)

    const res = await request(app).get('/protected').set('Cookie', `token=${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ userId: 'user-1', sessionTokenHash: hashSessionToken(token) })
    expect(routeHandler).toHaveBeenCalledTimes(1)
    const cookies = res.headers['set-cookie']!
    expect(cookies).toHaveLength(1)
    expect(cookies[0]).toMatch(new RegExp(`^token=${token};`))
    expect(cookies[0]).toContain('Max-Age=604800')
  })

  it('AC-22 a valid short session goes through without any Set-Cookie', async () => {
    const token = newSessionToken()
    const touchActive = vi.fn().mockResolvedValue({ userId: 'user-1', remember: false })
    const { app } = createApp(touchActive)

    const res = await request(app).get('/protected').set('Cookie', `token=${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ userId: 'user-1', sessionTokenHash: hashSessionToken(token) })
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('AC-17 the database fails → 500 INTERNAL_ERROR, the route never runs and the cookie is left alone', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const touchActive = vi.fn().mockRejectedValue(new Error('db down'))
    const { app, routeHandler } = createApp(touchActive)

    const res = await request(app).get('/protected').set('Cookie', `token=${newSessionToken()}`)

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Failed to check session' } })
    expect(res.headers['set-cookie']).toBeUndefined()
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
