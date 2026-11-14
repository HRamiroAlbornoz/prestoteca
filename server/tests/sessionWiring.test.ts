import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { createApp } from '../src/index.js'
import { resetRateLimiter } from '../src/modules/middleware/rateLimit.js'
import { UserRepository } from '../src/modules/auth/userRepo.js'
import { passwordFingerprint, signSessionToken } from '../src/modules/auth/sessionToken.js'

const TEST_JWT_SECRET = vi.hoisted(() => {
  const secret = 'a'.repeat(32)
  process.env.JWT_SECRET = secret
  return secret
})

const ALLOWED_ORIGIN = 'http://localhost:5173'

describe('session wiring — real app end to end', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.PORT = '3002'
    process.env.DATABASE_URL = 'postgresql://invalid:invalid@localhost:9999/nonexistent'
    process.env.JWT_SECRET = 'a'.repeat(32)
    process.env.NODE_ENV = 'test'
    resetRateLimiter()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const key of Object.keys(process.env)) {
      delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  })

  // W1 — unauthenticated POST / PATCH / DELETE must return 401 SESSION_REQUIRED
  it('W1 POST /api/tools without cookie → 401 SESSION_REQUIRED', async () => {
    const app = await createApp()

    const res = await request(app).post('/api/tools').set('Origin', ALLOWED_ORIGIN).send({ name: 'Test' })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: { code: 'SESSION_REQUIRED', message: 'Authentication required' } })
  })

  it('W1 PATCH /api/tools/some-id without cookie → 401 SESSION_REQUIRED', async () => {
    const app = await createApp()

    const res = await request(app).patch('/api/tools/some-id').set('Origin', ALLOWED_ORIGIN).send({ name: 'Test' })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: { code: 'SESSION_REQUIRED', message: 'Authentication required' } })
  })

  it('W1 DELETE /api/tools/some-id without cookie → 401 SESSION_REQUIRED', async () => {
    const app = await createApp()

    const res = await request(app).delete('/api/tools/some-id').set('Origin', ALLOWED_ORIGIN)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: { code: 'SESSION_REQUIRED', message: 'Authentication required' } })
  })

  // W2 — GET /api/tools is public (no cookie needed)
  it('W2 GET /api/tools without cookie → NOT 401 SESSION_REQUIRED', async () => {
    const app = await createApp()

    const res = await request(app).get('/api/tools?page=1')

    expect(res.status).not.toBe(401)
    expect(res.body.error?.code).not.toBe('SESSION_REQUIRED')
  })

  // W3 — password change through the real app
  it('W3 password change sets a new cookie with the new fingerprint', async () => {
    const app = await createApp()

    const oldHash = await bcrypt.hash('oldpassword1', 4)

    vi.spyOn(UserRepository.prototype, 'findActiveById').mockImplementation(async () => ({
      id: 'user-1',
      name: 'Ana',
      email: 'ana@example.com',
      password_hash: oldHash,
      neighborhood: 'Centro',
      created_at: '2026-01-01',
    }))

    const updateSpy = vi.spyOn(UserRepository.prototype, 'updatePassword').mockResolvedValue(true)

    const oldToken = signSessionToken('user-1', oldHash, TEST_JWT_SECRET, 'http://localhost:5173')

    const res = await request(app)
      .patch('/api/me/password')
      .set('Cookie', `token=${oldToken}`)
      .set('Origin', ALLOWED_ORIGIN)
      .send({ currentPassword: 'oldpassword1', newPassword: 'newpassword12' })

    expect(res.status).toBe(204)

    const setCookie = res.headers['set-cookie']
    expect(setCookie).toBeDefined()
    const newTokenValue = setCookie![0].split(';')[0].split('=')[1]
    expect(newTokenValue).toBeDefined()

    const decoded = jwt.verify(newTokenValue, TEST_JWT_SECRET, { issuer: 'http://localhost:5173' }) as { id: string; pwf: string }
    expect(decoded.id).toBe('user-1')
    expect(decoded.pwf).toBe(passwordFingerprint(updateSpy.mock.calls[0][1]))
  })

  // W4 — after password change, new cookie works, old cookie is rejected
  it('W4 after password change: new cookie works, old cookie → 401', async () => {
    const app = await createApp()

    let currentHash = await bcrypt.hash('oldpassword1', 4)

    // Each call reads the CURRENT hash, so after the change the database "has" the new password
    vi.spyOn(UserRepository.prototype, 'findActiveById').mockImplementation(async () => ({
      id: 'user-1',
      name: 'Ana',
      email: 'ana@example.com',
      password_hash: currentHash,
      neighborhood: 'Centro',
      created_at: '2026-01-01',
    }))

    const updateSpy = vi.spyOn(UserRepository.prototype, 'updatePassword').mockImplementation(async (_id, hash) => {
      currentHash = hash
      return true
    })

    const oldToken = signSessionToken('user-1', currentHash, TEST_JWT_SECRET, 'http://localhost:5173')

    const change = await request(app)
      .patch('/api/me/password')
      .set('Cookie', `token=${oldToken}`)
      .set('Origin', ALLOWED_ORIGIN)
      .send({ currentPassword: 'oldpassword1', newPassword: 'newpassword12' })
    expect(change.status).toBe(204)
    expect(updateSpy).toHaveBeenCalledTimes(1)

    // The cookie the APP gave back, not one signed by the test
    const newToken = change.headers['set-cookie']![0].split(';')[0].split('=')[1]

    const resNew = await request(app).get('/api/me').set('Cookie', `token=${newToken}`)
    expect(resNew.status).toBe(200)
    expect(resNew.body).toEqual({ id: 'user-1', name: 'Ana' })

    const resOld = await request(app).get('/api/me').set('Cookie', `token=${oldToken}`)
    expect(resOld.status).toBe(401)
    expect(resOld.body.error.code).toBe('SESSION_REQUIRED')
  })
})
