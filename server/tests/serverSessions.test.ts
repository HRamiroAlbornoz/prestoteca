import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcrypt'
import request from 'supertest'
import { Pool } from 'pg'
import { createApp } from '../src/index.js'
import { resetRateLimiter } from '../src/modules/middleware/rateLimit.js'
import { UserRepository } from '../src/modules/auth/userRepo.js'
import { SessionRepository } from '../src/modules/auth/sessionRepo.js'
import { hashSessionToken, idleCutoffs, newSessionToken } from '../src/modules/auth/sessionToken.js'
import { createFakeTransaction, type FakeTransaction } from './fakeTransaction.js'

// Step 7 of the plan: every server criterion that was only proven on a router mounted alone goes
// through the REAL app here (createApp: rate limits, cookie-parser, routes.ts wiring). Every request
// sends the allowed Origin; the origin check itself is tested in sessionWiring and originWiring.
// There is no local Postgres: the pool points at an invalid address and the app reaches the database
// only through the spies below. The criteria that live in the SQL (renewal across days, two requests
// at once, logout racing a request, the hourly purge) are fixed by sessionRepo.test.ts and
// sessionPurge.test.ts, and run for real on staging (T009).

const ALLOWED_ORIGIN = 'http://localhost:5173'
const SESSION_REQUIRED = { error: { code: 'SESSION_REQUIRED', message: 'Authentication required' } }
// An old JWT: three dotted parts, never a value the server issues now
const OLD_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6InVzZXItMSJ9.c2lnbmF0dXJlLXRoYXQtaXMtbm90LXJlYWw'
const CLEARED_COOKIE = /^token=;.*Expires=Thu, 01 Jan 1970/

// The value of the token cookie in a Set-Cookie header ("token=<value>; Path=/; …")
function cookieValue(setCookie: string | undefined): string {
  const firstPart = (setCookie ?? '').split(';')[0] ?? ''
  return firstPart.slice('token='.length)
}

// Every session method the app may call, so "not called" is a real check
function spySessions(session: { userId: string; remember: boolean } | null) {
  return {
    touchActive: vi.spyOn(SessionRepository.prototype, 'touchActive').mockResolvedValue(session),
    createIfPasswordCurrent: vi.spyOn(SessionRepository.prototype, 'createIfPasswordCurrent').mockResolvedValue(true),
    deleteByTokenHash: vi.spyOn(SessionRepository.prototype, 'deleteByTokenHash').mockResolvedValue(undefined),
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

// Ana, registered with the password "ana12345" (cost 4: only the speed of the test changes)
async function spyAna() {
  const passwordHash = await bcrypt.hash('ana12345', 4)
  const findByEmail = vi.spyOn(UserRepository.prototype, 'findByEmail').mockResolvedValue({
    id: 'user-1',
    name: 'Ana',
    email: 'ana@example.com',
    password_hash: passwordHash,
    neighborhood: 'Centro',
    created_at: '2026-01-01',
  })
  return { passwordHash, findByEmail }
}

function login(app: Awaited<ReturnType<typeof createApp>>, body: object, cookie?: string) {
  const req = request(app).post('/api/auth/login').set('Origin', ALLOWED_ORIGIN)
  if (cookie) req.set('Cookie', cookie)
  return req.send({ email: 'ana@example.com', password: 'ana12345', ...body })
}

// A protected route of the real app that needs only the session spies
function closeOtherSessions(app: Awaited<ReturnType<typeof createApp>>, cookie: string) {
  return request(app).delete('/api/me/other-sessions').set('Origin', ALLOWED_ORIGIN).set('Cookie', cookie)
}

describe('server sessions — every server criterion through the real app', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.PORT = '3003'
    process.env.DATABASE_URL = 'postgresql://invalid:invalid@localhost:9999/nonexistent'
    process.env.NODE_ENV = 'test'
    resetRateLimiter()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    for (const key of Object.keys(process.env)) {
      delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  })

  describe('login', () => {
    it('AC-22 AC-26 without "remember": a short session stored by the hash of the cookie, in a transaction', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const now = new Date('2026-11-19T10:00:00.000Z')
      vi.setSystemTime(now)
      const app = await createApp()
      const { passwordHash } = await spyAna()
      const sessions = spySessions(null)
      const tx = fakeConnection()

      const res = await login(app, {})

      expect(res.status).toBe(200)
      const cookies = res.headers['set-cookie'] as unknown as string[]
      expect(cookies).toHaveLength(1)
      expect(cookies[0]).not.toContain('Max-Age')
      expect(cookies[0]).not.toContain('Expires')
      const token = cookieValue(cookies[0])
      expect(sessions.createIfPasswordCurrent).toHaveBeenCalledTimes(1)
      const [userId, expectedHash, tokenHash, remember, createdAt, client] = sessions.createIfPasswordCurrent.mock.calls[0]!
      expect(userId).toBe('user-1')
      expect(expectedHash).toBe(passwordHash)
      expect(tokenHash).toBe(hashSessionToken(token))
      expect(remember).toBe(false)
      // The session is born at the app clock: a wrong date would make the first request look idle
      expect(createdAt).toEqual(now)
      expect(client).toBe(tx.client)
      expect(tx.statements).toEqual(['BEGIN', 'COMMIT'])
    })

    it('AC-21 with remember: true → a "Recordarme" session and a cookie of 7 days', async () => {
      const app = await createApp()
      await spyAna()
      const sessions = spySessions(null)
      fakeConnection()

      const res = await login(app, { remember: true })

      expect(res.status).toBe(200)
      const cookies = res.headers['set-cookie'] as unknown as string[]
      expect(cookies).toHaveLength(1)
      expect(cookies[0]).toContain('Max-Age=604800')
      expect(sessions.createIfPasswordCurrent.mock.calls[0]?.[3]).toBe(true)
    })

    it('AC-25 remember with a value that is not true or false → 400 BAD_REQUEST and no session', async () => {
      const app = await createApp()
      await spyAna()
      const sessions = spySessions(null)
      fakeConnection()

      const res = await login(app, { remember: 'yes' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
      expect(res.headers['set-cookie']).toBeUndefined()
      expect(sessions.createIfPasswordCurrent).not.toHaveBeenCalled()
    })

    it('AC-35 two logins in a row of the same account get two different values', async () => {
      const app = await createApp()
      await spyAna()
      spySessions(null)
      fakeConnection()

      const first = await login(app, {})
      const second = await login(app, {})

      const firstToken = cookieValue((first.headers['set-cookie'] as unknown as string[])[0])
      const secondToken = cookieValue((second.headers['set-cookie'] as unknown as string[])[0])
      expect(firstToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(secondToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(secondToken).not.toBe(firstToken)
    })

    it('AC-28 a login with a valid incoming cookie revokes that session in the same transaction', async () => {
      const app = await createApp()
      await spyAna()
      const sessions = spySessions(null)
      const tx = fakeConnection()
      const incoming = newSessionToken()

      const res = await login(app, {}, `token=${incoming}`)

      expect(res.status).toBe(200)
      expect(sessions.deleteByTokenHash).toHaveBeenCalledTimes(1)
      expect(sessions.deleteByTokenHash).toHaveBeenCalledWith(hashSessionToken(incoming), tx.client)
      expect(cookieValue((res.headers['set-cookie'] as unknown as string[])[0])).not.toBe(incoming)
      expect(tx.statements).toEqual(['BEGIN', 'COMMIT'])
    })

    it('AC-28 a login stopped by the rate limit (429) leaves the incoming session alone', async () => {
      const app = await createApp()
      await spyAna()
      const sessions = spySessions(null)
      fakeConnection()

      // The real app allows 5 requests per minute on /api/auth: the sixth is refused
      for (let i = 0; i < 5; i++) {
        const ok = await login(app, {})
        expect(ok.status).toBe(200)
      }
      sessions.deleteByTokenHash.mockClear()
      sessions.createIfPasswordCurrent.mockClear()

      const res = await login(app, {}, `token=${newSessionToken()}`)

      expect(res.status).toBe(429)
      expect(res.headers['set-cookie']).toBeUndefined()
      expect(sessions.createIfPasswordCurrent).not.toHaveBeenCalled()
      expect(sessions.deleteByTokenHash).not.toHaveBeenCalled()
    })

    it('AC-8 (stale login) the password changed during bcrypt → 401 INVALID_CREDENTIALS, rolled back, no cookie', async () => {
      const app = await createApp()
      await spyAna()
      const sessions = spySessions(null)
      sessions.createIfPasswordCurrent.mockResolvedValue(false)
      const tx = fakeConnection()

      const res = await login(app, {})

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
      expect(res.headers['set-cookie']).toBeUndefined()
      expect(tx.statements).toEqual(['BEGIN', 'ROLLBACK'])
    })

    it('AC-14 in production the cookie is httpOnly, SameSite=Lax, Secure and for the whole site', async () => {
      process.env.NODE_ENV = 'production'
      const app = await createApp()
      await spyAna()
      spySessions(null)
      fakeConnection()

      const res = await login(app, {})

      expect(res.status).toBe(200)
      const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('SameSite=Lax')
      expect(cookie).toContain('Secure')
      // The whole site: exactly "Path=/", never a narrower path such as "Path=/api"
      expect(cookie).toMatch(/; Path=\/(;|$)/)
      // The value is random: 43 base64url characters that carry nothing of the account
      // ("@" and "." can never appear in it, so the email check cannot fail by chance)
      expect(cookieValue(cookie)).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(cookieValue(cookie)).not.toContain('ana@example.com')
    })

    it('AC-14 outside production the cookie is not Secure (local http)', async () => {
      const app = await createApp()
      await spyAna()
      spySessions(null)
      fakeConnection()

      const res = await login(app, {})

      const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!
      expect(cookie).toContain('HttpOnly')
      expect(cookie).not.toContain('Secure')
    })
  })

  describe('register', () => {
    function register(app: Awaited<ReturnType<typeof createApp>>, cookie?: string) {
      const req = request(app).post('/api/auth/register').set('Origin', ALLOWED_ORIGIN)
      if (cookie) req.set('Cookie', cookie)
      // "remember" in the body must be ignored: the register screen has no such box
      return req.send({ name: 'Ana García', email: 'ana@example.com', password: 'ana12345', neighborhood: 'Centro', remember: true })
    }

    function spyCreate() {
      return vi.spyOn(UserRepository.prototype, 'create').mockImplementation(async (input) => ({
        id: 'user-1',
        name: input.name,
        email: input.email,
        password_hash: input.password_hash,
        neighborhood: input.neighborhood,
        created_at: '2026-01-01',
      }))
    }

    it('AC-24 a successful register opens a short session, even if the body asks for remember', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const now = new Date('2026-11-19T10:00:00.000Z')
      vi.setSystemTime(now)
      const app = await createApp()
      const create = spyCreate()
      const sessions = spySessions(null)
      const tx = fakeConnection()

      const res = await register(app)

      expect(res.status).toBe(201)
      const cookies = res.headers['set-cookie'] as unknown as string[]
      expect(cookies).toHaveLength(1)
      expect(cookies[0]).not.toContain('Max-Age')
      const [userId, expectedHash, tokenHash, remember, createdAt, client] = sessions.createIfPasswordCurrent.mock.calls[0]!
      expect(userId).toBe('user-1')
      expect(expectedHash).toBe(create.mock.calls[0]?.[0].password_hash)
      expect(tokenHash).toBe(hashSessionToken(cookieValue(cookies[0])))
      expect(remember).toBe(false)
      expect(createdAt).toEqual(now)
      expect(client).toBe(tx.client)
    })

    it('AC-34 a register with a valid incoming cookie revokes that session in the same transaction', async () => {
      const app = await createApp()
      spyCreate()
      const sessions = spySessions(null)
      const tx = fakeConnection()
      const incoming = newSessionToken()

      const res = await register(app, `token=${incoming}`)

      expect(res.status).toBe(201)
      expect(sessions.deleteByTokenHash).toHaveBeenCalledTimes(1)
      expect(sessions.deleteByTokenHash).toHaveBeenCalledWith(hashSessionToken(incoming), tx.client)
      expect(tx.statements).toEqual(['BEGIN', 'COMMIT'])
    })
  })

  describe('logout', () => {
    it('AC-4 AC-5 deletes ONLY this session, by its hash, and clears the cookie', async () => {
      const app = await createApp()
      const sessions = spySessions({ userId: 'user-1', remember: false })
      const token = newSessionToken()

      const res = await request(app).post('/api/auth/logout').set('Origin', ALLOWED_ORIGIN).set('Cookie', `token=${token}`)

      expect(res.status).toBe(204)
      expect(sessions.deleteByTokenHash).toHaveBeenCalledTimes(1)
      expect(sessions.deleteByTokenHash).toHaveBeenCalledWith(hashSessionToken(token))
      // The other devices keep their sessions: nothing closes them
      expect(sessions.deleteOthers).not.toHaveBeenCalled()
      expect(sessions.deleteAllForUser).not.toHaveBeenCalled()
      expect((res.headers['set-cookie'] as unknown as string[]).at(-1)).toMatch(CLEARED_COOKIE)
    })

    it('AC-12 with the cookie of a session already revoked or expired → 204 and the cookie is cleared', async () => {
      const app = await createApp()
      // deleteByTokenHash finds no row: it resolves all the same, and the answer does not change
      const sessions = spySessions(null)
      const token = newSessionToken()

      const res = await request(app).post('/api/auth/logout').set('Origin', ALLOWED_ORIGIN).set('Cookie', `token=${token}`)

      expect(res.status).toBe(204)
      expect(sessions.deleteByTokenHash).toHaveBeenCalledTimes(1)
      expect(sessions.deleteByTokenHash).toHaveBeenCalledWith(hashSessionToken(token))
      expect((res.headers['set-cookie'] as unknown as string[]).at(-1)).toMatch(CLEARED_COOKIE)
    })

    it.each([
      ['no cookie', undefined],
      ['an old JWT cookie', `token=${OLD_JWT}`],
      // The real cookie-parser turns "j:{}" into an object: still never a value we issued
      ['a j:{} cookie', 'token=j:{}'],
    ])('AC-12 with %s → 204, the cookie is cleared, nothing is deleted', async (_case, cookie) => {
      const app = await createApp()
      const sessions = spySessions(null)

      const req = request(app).post('/api/auth/logout').set('Origin', ALLOWED_ORIGIN)
      if (cookie) req.set('Cookie', cookie)
      const res = await req

      expect(res.status).toBe(204)
      expect(sessions.deleteByTokenHash).not.toHaveBeenCalled()
      expect((res.headers['set-cookie'] as unknown as string[]).at(-1)).toMatch(CLEARED_COOKIE)
    })

    it('AC-30 the database fails → 500 INTERNAL_ERROR and the cookie is NOT cleared', async () => {
      const app = await createApp()
      const sessions = spySessions(null)
      sessions.deleteByTokenHash.mockRejectedValue(new Error('db down'))

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Cookie', `token=${newSessionToken()}`)

      expect(res.status).toBe(500)
      expect(res.body.error.code).toBe('INTERNAL_ERROR')
      expect(res.headers['set-cookie']).toBeUndefined()
    })
  })

  describe('protected requests', () => {
    it('AC-1 AC-2 AC-23 the session is checked with the hash of the cookie, the app clock and both idle cutoffs', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const now = new Date('2026-11-19T10:00:00.000Z')
      vi.setSystemTime(now)
      const app = await createApp()
      const sessions = spySessions({ userId: 'user-1', remember: false })
      const token = newSessionToken()

      const res = await closeOtherSessions(app, `token=${token}`)

      expect(res.status).toBe(204)
      expect(sessions.touchActive).toHaveBeenCalledTimes(1)
      expect(sessions.touchActive).toHaveBeenCalledWith(hashSessionToken(token), now, idleCutoffs(now))
      // 7 days for "Recordarme", 12 hours without it
      const cutoffs = sessions.touchActive.mock.calls[0]![2]
      expect(cutoffs.rememberCutoff.toISOString()).toBe('2026-11-12T10:00:00.000Z')
      expect(cutoffs.shortCutoff.toISOString()).toBe('2026-11-18T22:00:00.000Z')
    })

    it('AC-2 AC-29 a session the database no longer accepts (expired or revoked) → 401 and the cookie is cleared', async () => {
      const app = await createApp()
      const sessions = spySessions(null)

      const res = await closeOtherSessions(app, `token=${newSessionToken()}`)

      expect(res.status).toBe(401)
      expect(res.body).toEqual(SESSION_REQUIRED)
      expect((res.headers['set-cookie'] as unknown as string[]).at(-1)).toMatch(CLEARED_COOKIE)
      expect(sessions.deleteOthers).not.toHaveBeenCalled()
    })

    it('AC-21 a "Recordarme" session is renewed in the browser: same value, 7 more days', async () => {
      const app = await createApp()
      spySessions({ userId: 'user-1', remember: true })
      const token = newSessionToken()

      const res = await closeOtherSessions(app, `token=${token}`)

      expect(res.status).toBe(204)
      const cookies = res.headers['set-cookie'] as unknown as string[]
      expect(cookies).toHaveLength(1)
      expect(cookies[0]).toMatch(new RegExp(`^token=${token};`))
      expect(cookies[0]).toContain('Max-Age=604800')
    })

    it('AC-22 a short session goes through without any Set-Cookie', async () => {
      const app = await createApp()
      spySessions({ userId: 'user-1', remember: false })

      const res = await closeOtherSessions(app, `token=${newSessionToken()}`)

      expect(res.status).toBe(204)
      expect(res.headers['set-cookie']).toBeUndefined()
    })

    it.each([
      ['an old JWT cookie', `token=${OLD_JWT}`],
      // The real cookie-parser turns "j:{}" into an object: still never a value we issued
      ['a j:{} cookie', 'token=j:{}'],
    ])('AC-10 %s → 401, the cookie is cleared, the database is never asked', async (_case, cookie) => {
      const app = await createApp()
      const sessions = spySessions({ userId: 'user-1', remember: false })

      const res = await closeOtherSessions(app, cookie)

      expect(res.status).toBe(401)
      expect(res.body).toEqual(SESSION_REQUIRED)
      expect((res.headers['set-cookie'] as unknown as string[]).at(-1)).toMatch(CLEARED_COOKIE)
      expect(sessions.touchActive).not.toHaveBeenCalled()
    })

    // Guards T006 (the env check no longer knows JWT_SECRET): the old variable stays on Railway for a
    // rollback, and the new code must start and serve sessions with it still set, even a short one
    it('AC-10 the app starts and serves a session with a short JWT_SECRET left in the environment (as on Railway)', async () => {
      process.env.JWT_SECRET = 'short'
      const app = await createApp()
      spySessions({ userId: 'user-1', remember: false })

      const res = await closeOtherSessions(app, `token=${newSessionToken()}`)

      expect(res.status).toBe(204)
    })

    it('AC-17 the database fails while checking the session → 500, nothing runs, the cookie is left alone', async () => {
      const app = await createApp()
      const sessions = spySessions(null)
      sessions.touchActive.mockRejectedValue(new Error('db down'))

      const res = await closeOtherSessions(app, `token=${newSessionToken()}`)

      expect(res.status).toBe(500)
      expect(res.body.error.code).toBe('INTERNAL_ERROR')
      expect(res.headers['set-cookie']).toBeUndefined()
      expect(sessions.deleteOthers).not.toHaveBeenCalled()
    })
  })
})
