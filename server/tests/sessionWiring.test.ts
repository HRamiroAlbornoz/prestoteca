import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcrypt'
import request from 'supertest'
import { Pool } from 'pg'
import { createApp } from '../src/index.js'
import { resetRateLimiter } from '../src/modules/middleware/rateLimit.js'
import { UserRepository } from '../src/modules/auth/userRepo.js'
import { SessionRepository } from '../src/modules/auth/sessionRepo.js'
import { hashSessionToken, newSessionToken } from '../src/modules/auth/sessionToken.js'
import { createFakeTransaction, type FakeTransaction } from './fakeTransaction.js'

const ALLOWED_ORIGIN = 'http://localhost:5173'

// The real app reaches the database only through these spies: the pool points at an invalid address
function spySessions(session: { userId: string; remember: boolean } | null) {
  return {
    touchActive: vi.spyOn(SessionRepository.prototype, 'touchActive').mockResolvedValue(session),
    deleteOthers: vi.spyOn(SessionRepository.prototype, 'deleteOthers').mockResolvedValue(0),
    deleteAllForUser: vi.spyOn(SessionRepository.prototype, 'deleteAllForUser').mockResolvedValue(0),
  }
}

// Routes with a transaction ask the real Pool for a connection: hand them the fake one
function fakeConnection(): FakeTransaction {
  const tx = createFakeTransaction()
  vi.spyOn(Pool.prototype, 'connect').mockImplementation(tx.connect as never)
  return tx
}

describe('session wiring — real app end to end', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.PORT = '3002'
    process.env.DATABASE_URL = 'postgresql://invalid:invalid@localhost:9999/nonexistent'
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

  // A user whose stored password is "oldpassword1"
  async function spyAna() {
    const oldHash = await bcrypt.hash('oldpassword1', 4)
    vi.spyOn(UserRepository.prototype, 'findActiveById').mockResolvedValue({
      id: 'user-1',
      name: 'Ana',
      email: 'ana@example.com',
      password_hash: oldHash,
      neighborhood: 'Centro',
      created_at: '2026-01-01',
    })
    return { updatePassword: vi.spyOn(UserRepository.prototype, 'updatePassword').mockResolvedValue(true) }
  }

  // W3 — password change through the real app keeps THIS session as it is (AC-27)
  it.each([
    ['"Recordarme"', true],
    ['a short session', false],
  ])('W3 AC-27 with %s the route sends no cookie of its own; only the middleware renews the same value', async (_case, remember) => {
    const app = await createApp()
    await spyAna()
    spySessions({ userId: 'user-1', remember })
    fakeConnection()
    const token = newSessionToken()

    const res = await request(app)
      .patch('/api/me/password')
      .set('Cookie', `token=${token}`)
      .set('Origin', ALLOWED_ORIGIN)
      .send({ currentPassword: 'oldpassword1', newPassword: 'newpassword12' })

    expect(res.status).toBe(204)
    const cookies = res.headers['set-cookie'] as string[] | undefined
    if (remember) {
      expect(cookies).toHaveLength(1)
      expect(cookies![0]).toMatch(new RegExp(`^token=${token};`))
      expect(cookies![0]).toContain('Max-Age=604800')
    } else {
      expect(cookies).toBeUndefined()
    }
  })

  // W4 — the real wiring: same transaction, and the hash of THIS cookie is the one kept
  it('W4 AC-8 password change closes the other sessions in the same transaction, keeping this cookie', async () => {
    const app = await createApp()
    const { updatePassword } = await spyAna()
    const sessions = spySessions({ userId: 'user-1', remember: false })
    const tx = fakeConnection()
    const token = newSessionToken()

    const res = await request(app)
      .patch('/api/me/password')
      .set('Cookie', `token=${token}`)
      .set('Origin', ALLOWED_ORIGIN)
      .send({ currentPassword: 'oldpassword1', newPassword: 'newpassword12' })

    expect(res.status).toBe(204)
    expect(updatePassword.mock.calls[0]?.[0]).toBe('user-1')
    expect(updatePassword.mock.calls[0]?.[2]).toBe(tx.client)
    expect(sessions.deleteOthers).toHaveBeenCalledWith('user-1', hashSessionToken(token), tx.client)
    expect(tx.statements).toEqual(['BEGIN', 'COMMIT'])
  })

  it('AC-16 DELETE /api/me/other-sessions without a cookie → 401 and nothing is closed', async () => {
    const app = await createApp()
    const sessions = spySessions(null)

    const res = await request(app).delete('/api/me/other-sessions').set('Origin', ALLOWED_ORIGIN)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: { code: 'SESSION_REQUIRED', message: 'Authentication required' } })
    expect(sessions.touchActive).not.toHaveBeenCalled()
    expect(sessions.deleteOthers).not.toHaveBeenCalled()
  })

  it('AC-13 DELETE /api/me/other-sessions without Origin → 403 before touching any session', async () => {
    const app = await createApp()
    const sessions = spySessions({ userId: 'user-1', remember: false })

    const res = await request(app).delete('/api/me/other-sessions').set('Cookie', `token=${newSessionToken()}`)

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('ORIGIN_NOT_ALLOWED')
    expect(sessions.touchActive).not.toHaveBeenCalled()
    expect(sessions.deleteOthers).not.toHaveBeenCalled()
  })

  it('AC-6 AC-19 DELETE /api/me/other-sessions closes the others with the user and the hash of THIS cookie → 204', async () => {
    const app = await createApp()
    const sessions = spySessions({ userId: 'user-1', remember: false })
    const token = newSessionToken()

    const res = await request(app)
      .delete('/api/me/other-sessions')
      .set('Cookie', `token=${token}`)
      .set('Origin', ALLOWED_ORIGIN)

    // deleteOthers resolves 0 here: 204 even when there was nothing to close
    expect(res.status).toBe(204)
    expect(sessions.deleteOthers).toHaveBeenCalledTimes(1)
    expect(sessions.deleteOthers).toHaveBeenCalledWith('user-1', hashSessionToken(token))
  })

  it('AC-9 AC-33 deleting the account in "Recordarme" mode: renewal first, clearing cookie last', async () => {
    const app = await createApp()
    spySessions({ userId: 'user-1', remember: true })
    const tx = fakeConnection()
    // The deletion statements of accountDeletion.ts against the fake connection
    vi.mocked(tx.client.query).mockImplementation((async (text: string) => {
      tx.statements.push(text)
      if (text.startsWith('SELECT id FROM users')) return { rows: [{ id: 'user-1' }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    }) as never)

    const res = await request(app)
      .delete('/api/me/account')
      .set('Cookie', `token=${newSessionToken()}`)
      .set('Origin', ALLOWED_ORIGIN)

    expect(res.status).toBe(204)
    const cookies = res.headers['set-cookie'] as unknown as string[]
    expect(cookies).toHaveLength(2)
    expect(cookies[0]).toContain('Max-Age=604800')
    expect(cookies[1]).toMatch(/^token=;.*Expires=Thu, 01 Jan 1970/)
  })
})
