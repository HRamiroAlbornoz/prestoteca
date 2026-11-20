import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import bcrypt from 'bcrypt'
import { authRoutes } from '../src/modules/auth/authRoutes.js'
import { resetRateLimiter } from '../src/modules/middleware/rateLimit.js'
import { authRateLimiter } from '../src/modules/middleware/rateLimit.js'
import type { UserRepository } from '../src/modules/auth/userRepo.js'
import { AppError } from '../src/modules/errors/AppError.js'
import { hashSessionToken, newSessionToken } from '../src/modules/auth/sessionToken.js'
import { createFakeTransaction } from './fakeTransaction.js'

// An old JWT: three dotted parts, never a value the server issues now
const OLD_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6InVzZXItMSJ9.c2lnbmF0dXJlLXRoYXQtaXMtbm90LXJlYWw'

// The value of the token cookie in a Set-Cookie header ("token=<value>; Path=/; …")
function cookieValue(setCookie: string | undefined): string {
  const firstPart = (setCookie ?? '').split(';')[0] ?? ''
  return firstPart.slice('token='.length)
}

function createMockApp() {
  const usersByEmail = new Map<string, { id: string; name: string; email: string; password_hash: string; neighborhood: string }>()
  let nextId = 1

  const mockRepo: Partial<UserRepository> = {
    findByEmail: vi.fn(async (email: string) => {
      return usersByEmail.get(email) ?? null
    }),
    create: vi.fn(async (input: { name: string; email: string; password_hash: string; neighborhood: string }) => {
      if (usersByEmail.has(input.email)) {
        // Same error the real UserRepository raises for a repeated email
        throw new AppError('EMAIL_TAKEN', 'Email already exists')
      }
      const user = {
        id: `uuid-${nextId++}`,
        name: input.name,
        email: input.email,
        password_hash: input.password_hash,
        neighborhood: input.neighborhood,
      }
      usersByEmail.set(input.email, user)
      return user
    }),
  }

  // Every method a test could expect NOT to be called is here, so "not called" is a real check
  const sessionRepo = {
    createIfPasswordCurrent: vi.fn(async () => true),
    deleteByTokenHash: vi.fn(async () => undefined),
    deleteOthers: vi.fn(async () => 0),
    deleteAllForUser: vi.fn(async () => 0),
  }
  const tx = createFakeTransaction()

  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(authRateLimiter)
  app.use('/api/auth', authRoutes(mockRepo as UserRepository, sessionRepo, tx.pool))

  return { app, usersByEmail, mockRepo, sessionRepo, tx }
}

describe('auth routes', () => {
  const { app } = createMockApp()

  beforeEach(() => {
    resetRateLimiter()
    vi.restoreAllMocks()
  })

  describe('POST /api/auth/register', () => {
    it('returns 201 with Set-Cookie header', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana García', email: 'ana@example.com', password: 'ana12345', neighborhood: 'Centro' })

      expect(res.status).toBe(201)
      expect(res.headers['set-cookie']).toBeDefined()
      expect(Array.isArray(res.headers['set-cookie'])).toBe(true)
      expect(res.headers['set-cookie'][0]).toContain('token=')
    })

    it('returns 400 on missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: { code: 'REGISTER_MISSING_FIELDS', message: 'Missing required fields' } })
    })

    // One field missing (or only spaces) at a time, so each part of the check is pinned
    it.each([
      ['no name', { email: 'ana@example.com', password: 'ana12345', neighborhood: 'Centro' }],
      ['a name of only spaces', { name: '   ', email: 'ana@example.com', password: 'ana12345', neighborhood: 'Centro' }],
      ['no email', { name: 'Ana', password: 'ana12345', neighborhood: 'Centro' }],
      ['no password', { name: 'Ana', email: 'ana@example.com', neighborhood: 'Centro' }],
      ['no neighborhood', { name: 'Ana', email: 'ana@example.com', password: 'ana12345' }],
    ])('returns 400 REGISTER_MISSING_FIELDS with %s', async (_case, body) => {
      const res = await request(app).post('/api/auth/register').send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: { code: 'REGISTER_MISSING_FIELDS', message: 'Missing required fields' } })
    })

    it.each([
      ['a single-letter name', { name: 'A', password: 'ana12345' }],
      ['a 51-character name', { name: 'A'.repeat(51), password: 'ana12345' }],
    ])('returns 400 REGISTER_NAME_LENGTH for %s', async (_case, fields) => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'ana@example.com', neighborhood: 'Centro', ...fields })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({
        error: { code: 'REGISTER_NAME_LENGTH', message: 'El nombre debe tener entre 2 y 50 caracteres' },
      })
    })

    it.each([
      ['a 2-character name', { name: 'Al', email: 'al@example.com', password: 'ana12345' }],
      ['a 50-character name', { name: 'A'.repeat(50), email: 'long@example.com', password: 'ana12345' }],
      ['a 254-character email', { name: 'Ana', email: 'a'.repeat(249) + '@x.co', password: 'ana12345' }],
      ['an 8-character password', { name: 'Ana', email: 'ana8@example.com', password: 'a'.repeat(8) }],
      ['a 72-character password', { name: 'Ana', email: 'ana72@example.com', password: 'a'.repeat(72) }],
    ])('accepts %s (the limit itself is valid)', async (_case, fields) => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ neighborhood: 'Centro', ...fields })

      expect(res.status).toBe(201)
    })

    it.each([
      ['a 7-character password', 'a'.repeat(7)],
      ['a 73-character password', 'a'.repeat(73)],
    ])('returns 400 REGISTER_PASSWORD_LENGTH for %s', async (_case, password) => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana', email: 'ana@example.com', password, neighborhood: 'Centro' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({
        error: { code: 'REGISTER_PASSWORD_LENGTH', message: 'La contraseña debe tener entre 8 y 72 caracteres' },
      })
    })

    // A1a — non-string fields (number 5) must answer 400 REGISTER_MISSING_FIELDS
    it.each([
      ['name as number 5', { email: 'ana@example.com', password: 'ana12345', neighborhood: 'Centro', name: 5 }],
      ['email as number 5', { name: 'Ana', password: 'ana12345', neighborhood: 'Centro', email: 5 }],
      ['password as number 5', { name: 'Ana', email: 'ana@example.com', neighborhood: 'Centro', password: 5 }],
      ['neighborhood as number 5', { name: 'Ana', email: 'ana@example.com', password: 'ana12345', neighborhood: 5 }],
    ])('A1a returns 400 REGISTER_MISSING_FIELDS when %s', async (_case, body) => {
      const res = await request(app).post('/api/auth/register').send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: { code: 'REGISTER_MISSING_FIELDS', message: 'Missing required fields' } })
    })

    // A1b — non-string fields (array, object) must answer 400 REGISTER_MISSING_FIELDS
    it.each([
      ['email as array', { name: 'Ana', password: 'ana12345', neighborhood: 'Centro', email: ['ana@example.com'] }],
      ['email as object', { name: 'Ana', password: 'ana12345', neighborhood: 'Centro', email: {} }],
    ])('A1b returns 400 REGISTER_MISSING_FIELDS when %s', async (_case, body) => {
      const res = await request(app).post('/api/auth/register').send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: { code: 'REGISTER_MISSING_FIELDS', message: 'Missing required fields' } })
    })

    // A1e — non-string fields (array, object) for name, password, neighborhood
    it.each([
      ['name as array', { email: 'ana@example.com', password: 'ana12345', neighborhood: 'Centro', name: ['Ana'] }],
      ['name as object', { email: 'ana@example.com', password: 'ana12345', neighborhood: 'Centro', name: {} }],
      ['password as array', { name: 'Ana', email: 'ana@example.com', neighborhood: 'Centro', password: ['ana12345'] }],
      ['password as object', { name: 'Ana', email: 'ana@example.com', neighborhood: 'Centro', password: {} }],
      ['neighborhood as array', { name: 'Ana', email: 'ana@example.com', password: 'ana12345', neighborhood: ['Centro'] }],
      ['neighborhood as object', { name: 'Ana', email: 'ana@example.com', password: 'ana12345', neighborhood: {} }],
    ])('A1e returns 400 REGISTER_MISSING_FIELDS when %s', async (_case, body) => {
      const res = await request(app).post('/api/auth/register').send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: { code: 'REGISTER_MISSING_FIELDS', message: 'Missing required fields' } })
    })

    it('returns 409 on duplicate email', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana García', email: 'ana@example.com', password: 'ana12345', neighborhood: 'Centro' })

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana López', email: 'ana@example.com', password: 'ana45678', neighborhood: 'Barrio Norte' })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: { code: 'EMAIL_TAKEN', message: 'Email already exists' } })
    })
  })

  describe('POST /api/auth/login', () => {
    it('returns 200 with Set-Cookie header', async () => {
      // Register first
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Carlos', email: 'carlos@example.com', password: 'carlos123', neighborhood: 'Barrio Norte' })

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'carlos@example.com', password: 'carlos123' })

      expect(res.status).toBe(200)
      expect(res.headers['set-cookie']).toBeDefined()
      expect(res.headers['set-cookie'][0]).toContain('token=')
    })

    it('returns 401 on wrong password', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Maria', email: 'maria@example.com', password: 'maria123', neighborhood: 'Barrio Sur' })

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'maria@example.com', password: 'wrongpassword' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
    })

    it.each([
      ['no password', { email: 'maria@example.com' }],
      ['no email', { password: 'maria123' }],
      ['a blank email', { email: '   ', password: 'maria123' }],
    ])('returns 400 LOGIN_MISSING_FIELDS with %s', async (_case, body) => {
      const res = await request(app).post('/api/auth/login').send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: { code: 'LOGIN_MISSING_FIELDS', message: 'Missing required fields' } })
    })

    // A1c — non-string fields (number) must answer 400 LOGIN_MISSING_FIELDS
    it.each([
      ['email as number 5', { password: 'maria123', email: 5 }],
      ['password as number 5', { email: 'maria@example.com', password: 5 }],
    ])('A1c returns 400 LOGIN_MISSING_FIELDS when %s', async (_case, body) => {
      const res = await request(app).post('/api/auth/login').send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: { code: 'LOGIN_MISSING_FIELDS', message: 'Missing required fields' } })
    })

    // A1f — non-string fields (array, object) for email and password
    it.each([
      ['email as array', { password: 'maria123', email: ['maria@example.com'] }],
      ['email as object', { password: 'maria123', email: {} }],
      ['password as array', { email: 'maria@example.com', password: ['maria123'] }],
      ['password as object', { email: 'maria@example.com', password: {} }],
    ])('A1f returns 400 LOGIN_MISSING_FIELDS when %s', async (_case, body) => {
      const res = await request(app).post('/api/auth/login').send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: { code: 'LOGIN_MISSING_FIELDS', message: 'Missing required fields' } })
    })

    // A1j — a boolean is not a string either (panel nit T2-N2)
    it.each([
      ['email as true', { email: true, password: 'maria123' }],
      ['password as true', { email: 'maria@example.com', password: true }],
    ])('A1j returns 400 LOGIN_MISSING_FIELDS when %s', async (_case, body) => {
      const res = await request(app).post('/api/auth/login').send(body)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: { code: 'LOGIN_MISSING_FIELDS', message: 'Missing required fields' } })
    })

    // A1h — no body and text/plain must answer 400 missing-fields, not 500
    // plainText undefined = the request has no body at all
    it.each<[string, string, string | undefined, string]>([
      ['register with no body', '/api/auth/register', undefined, 'REGISTER_MISSING_FIELDS'],
      ['register with text/plain', '/api/auth/register', 'hola', 'REGISTER_MISSING_FIELDS'],
      ['login with no body', '/api/auth/login', undefined, 'LOGIN_MISSING_FIELDS'],
      ['login with text/plain', '/api/auth/login', 'hola', 'LOGIN_MISSING_FIELDS'],
    ])('A1h returns 400 for %s', async (_case, path, plainText, code) => {
      const res = plainText === undefined
        ? await request(app).post(path)
        : await request(app).post(path).set('Content-Type', 'text/plain').send(plainText)

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: { code, message: 'Missing required fields' } })
    })

    it('returns the same 401 response on non-existent email as on wrong password', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Lucia', email: 'lucia@example.com', password: 'lucia123', neighborhood: 'Centro' })

      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: 'lucia@example.com', password: 'wrongpassword' })
      const unknownEmail = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.com', password: 'any' })

      // Identical status and body: the response must not reveal whether the email is registered
      expect(unknownEmail.status).toBe(401)
      expect(unknownEmail.body).toEqual(wrongPassword.body)
      expect(unknownEmail.body).toEqual({
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
      })
    })
  })

  describe('POST /api/auth/logout', () => {
    it('returns 204 with cleared cookie', async () => {
      const res = await request(app).post('/api/auth/logout')

      expect(res.status).toBe(204)
      expect(res.headers['set-cookie']).toBeDefined()
      // Cookie should be expired (Expires in the past or Max-Age=0)
      const cookieHeader = res.headers['set-cookie'][0]
      expect(cookieHeader).toMatch(/(Expires=.*1970|Max-Age=0)/)
    })
  })

  // --- server sessions (T004). Each test builds its own app, so mock call histories never mix ---
  describe('server sessions', () => {
    const EMAIL = 'carlos@example.com'
    const PASSWORD = 'carlos123'
    let storedHash = ''

    beforeAll(async () => {
      // Cost 4 keeps the tests fast; login only compares against whatever hash is stored
      storedHash = await bcrypt.hash(PASSWORD, 4)
    })

    // An app with one registered user, Carlos
    function appWithUser() {
      const mock = createMockApp()
      mock.usersByEmail.set(EMAIL, {
        id: 'user-1',
        name: 'Carlos',
        email: EMAIL,
        password_hash: storedHash,
        neighborhood: 'Centro',
      })
      return mock
    }

    const REGISTER_BODY = { name: 'Ana', email: 'ana@example.com', password: 'ana12345', neighborhood: 'Centro' }

    describe('login', () => {
      it('AC-26 AC-22 AC-35 without "remember": a short session stored by its hash, cookie without Max-Age or Expires', async () => {
        const { app, sessionRepo, tx } = appWithUser()

        const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD })

        expect(res.status).toBe(200)
        expect(res.body).toEqual({ message: 'Logged in successfully' })
        const cookie = res.headers['set-cookie']![0]
        const value = cookieValue(cookie)
        expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(cookie).toContain('HttpOnly')
        expect(cookie).toContain('SameSite=Lax')
        expect(cookie).toContain('Path=/')
        expect(cookie).not.toContain('Max-Age')
        expect(cookie).not.toContain('Expires')

        expect(sessionRepo.createIfPasswordCurrent).toHaveBeenCalledTimes(1)
        const [userId, expectedHash, tokenHash, remember, now, db] = sessionRepo.createIfPasswordCurrent.mock
          .calls[0] as unknown as [string, string, string, boolean, Date, unknown]
        expect(userId).toBe('user-1')
        expect(expectedHash).toBe(storedHash)
        expect(tokenHash).toBe(hashSessionToken(value))
        expect(tokenHash).not.toBe(value)
        expect(remember).toBe(false)
        expect(now).toBeInstanceOf(Date)
        expect(db).toBe(tx.client)
        expect(tx.statements).toEqual(['BEGIN', 'COMMIT'])
        expect(tx.release).toHaveBeenCalledTimes(1)
      })

      it('AC-21 with remember: true → a "Recordarme" session and a cookie of 7 days', async () => {
        const { app, sessionRepo } = appWithUser()

        const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD, remember: true })

        expect(res.status).toBe(200)
        expect(res.headers['set-cookie']![0]).toContain('Max-Age=604800')
        expect(sessionRepo.createIfPasswordCurrent.mock.calls[0]).toHaveProperty('3', true)
      })

      it('AC-22 with remember: false → a short session', async () => {
        const { app, sessionRepo } = appWithUser()

        const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD, remember: false })

        expect(res.status).toBe(200)
        expect(res.headers['set-cookie']![0]).not.toContain('Max-Age')
        expect(sessionRepo.createIfPasswordCurrent.mock.calls[0]).toHaveProperty('3', false)
      })

      it.each([
        ['the text "si"', 'si'],
        ['null', null],
        ['the number 1', 1],
      ])('AC-25 remember as %s → 400 BAD_REQUEST, before checking the password, without a session', async (_case, remember) => {
        const { app, sessionRepo, mockRepo } = appWithUser()

        const res = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASSWORD, remember })

        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('BAD_REQUEST')
        expect(res.headers['set-cookie']).toBeUndefined()
        expect(sessionRepo.createIfPasswordCurrent).not.toHaveBeenCalled()
        expect(mockRepo.findByEmail).not.toHaveBeenCalled()
      })

      it('AC-28 a successful login with a valid incoming cookie revokes that session in the same transaction', async () => {
        const { app, sessionRepo, tx } = appWithUser()
        const incoming = newSessionToken()

        const res = await request(app)
          .post('/api/auth/login')
          .set('Cookie', `token=${incoming}`)
          .send({ email: EMAIL, password: PASSWORD })

        expect(res.status).toBe(200)
        expect(sessionRepo.deleteByTokenHash).toHaveBeenCalledTimes(1)
        expect(sessionRepo.deleteByTokenHash).toHaveBeenCalledWith(hashSessionToken(incoming), tx.client)
        expect(sessionRepo.createIfPasswordCurrent.mock.calls[0]).toHaveProperty('5', tx.client)
        expect(tx.statements).toEqual(['BEGIN', 'COMMIT'])
        expect(cookieValue(res.headers['set-cookie']![0])).not.toBe(incoming)
      })

      it.each([
        ['an old JWT', `token=${OLD_JWT}`],
        ['a j:{} value', 'token=j:{}'],
      ])('AC-28 AC-10 a successful login with %s as incoming cookie does not try to revoke it', async (_case, cookie) => {
        const { app, sessionRepo } = appWithUser()

        const res = await request(app).post('/api/auth/login').set('Cookie', cookie).send({ email: EMAIL, password: PASSWORD })

        expect(res.status).toBe(200)
        expect(sessionRepo.deleteByTokenHash).not.toHaveBeenCalled()
      })

      it.each([
        ['a wrong password (401)', { email: EMAIL, password: 'wrong-password' }, 401],
        ['a missing password (400)', { email: EMAIL }, 400],
        ['a bad remember (400)', { email: EMAIL, password: PASSWORD, remember: 'si' }, 400],
      ])('AC-28 a rejected login with %s leaves the incoming session alone', async (_case, body, status) => {
        const { app, sessionRepo } = appWithUser()

        const res = await request(app)
          .post('/api/auth/login')
          .set('Cookie', `token=${newSessionToken()}`)
          .send(body)

        expect(res.status).toBe(status)
        expect(res.headers['set-cookie']).toBeUndefined()
        expect(sessionRepo.deleteByTokenHash).not.toHaveBeenCalled()
        expect(sessionRepo.createIfPasswordCurrent).not.toHaveBeenCalled()
      })

      it('AC-28 revoking the incoming session fails → 500, rolled back, no new session and no cookie', async () => {
        const { app, sessionRepo, tx } = appWithUser()
        sessionRepo.deleteByTokenHash.mockRejectedValueOnce(new Error('db down'))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const res = await request(app)
          .post('/api/auth/login')
          .set('Cookie', `token=${newSessionToken()}`)
          .send({ email: EMAIL, password: PASSWORD })

        expect(res.status).toBe(500)
        expect(res.body.error.code).toBe('INTERNAL_ERROR')
        expect(res.headers['set-cookie']).toBeUndefined()
        // The new session was created INSIDE the transaction that was rolled back, so it was never saved
        expect(sessionRepo.createIfPasswordCurrent.mock.calls[0]).toHaveProperty('5', tx.client)
        expect(tx.statements).toEqual(['BEGIN', 'ROLLBACK'])
        errorSpy.mockRestore()
      })

      // Pins the ORDER of the app: the rate limit answers before the route runs, so nothing is revoked
      it('AC-28 a login stopped by the rate limit (429) leaves the incoming session alone', async () => {
        const { app, sessionRepo } = appWithUser()
        const cookie = `token=${newSessionToken()}`
        for (let i = 0; i < 5; i++) {
          await request(app).post('/api/auth/login').set('Cookie', cookie).send({})
        }

        const res = await request(app).post('/api/auth/login').set('Cookie', cookie).send({ email: EMAIL, password: PASSWORD })

        expect(res.status).toBe(429)
        expect(res.headers['set-cookie']).toBeUndefined()
        expect(sessionRepo.deleteByTokenHash).not.toHaveBeenCalled()
      })

      it('AC-8 AC-33 the password changed or the account was deleted during bcrypt → the same 401, rolled back, no cookie', async () => {
        const { app, sessionRepo, tx } = appWithUser()
        sessionRepo.createIfPasswordCurrent.mockResolvedValueOnce(false)

        const res = await request(app)
          .post('/api/auth/login')
          .set('Cookie', `token=${newSessionToken()}`)
          .send({ email: EMAIL, password: PASSWORD })

        expect(res.status).toBe(401)
        expect(res.body).toEqual({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } })
        expect(res.headers['set-cookie']).toBeUndefined()
        expect(tx.statements).toEqual(['BEGIN', 'ROLLBACK'])
        expect(tx.release).toHaveBeenCalledTimes(1)
      })
    })

    describe('register', () => {
      it('AC-24 opens a short session for the new account, even if the body asks for remember', async () => {
        const { app, sessionRepo, usersByEmail, tx } = createMockApp()

        const res = await request(app).post('/api/auth/register').send({ ...REGISTER_BODY, remember: true })

        expect(res.status).toBe(201)
        expect(res.body).toEqual({ message: 'Registered successfully' })
        const cookie = res.headers['set-cookie']![0]
        expect(cookie).not.toContain('Max-Age')
        expect(cookie).not.toContain('Expires')
        const created = usersByEmail.get('ana@example.com')!
        const [userId, expectedHash, tokenHash, remember, , db] = sessionRepo.createIfPasswordCurrent.mock
          .calls[0] as unknown as [string, string, string, boolean, Date, unknown]
        expect(userId).toBe(created.id)
        expect(expectedHash).toBe(created.password_hash)
        expect(tokenHash).toBe(hashSessionToken(cookieValue(cookie)))
        expect(remember).toBe(false)
        expect(db).toBe(tx.client)
        expect(tx.statements).toEqual(['BEGIN', 'COMMIT'])
      })

      it('AC-34 a successful register with a valid incoming cookie revokes that session in the same transaction', async () => {
        const { app, sessionRepo, tx } = createMockApp()
        const incoming = newSessionToken()

        const res = await request(app).post('/api/auth/register').set('Cookie', `token=${incoming}`).send(REGISTER_BODY)

        expect(res.status).toBe(201)
        expect(sessionRepo.deleteByTokenHash).toHaveBeenCalledTimes(1)
        expect(sessionRepo.deleteByTokenHash).toHaveBeenCalledWith(hashSessionToken(incoming), tx.client)
        expect(cookieValue(res.headers['set-cookie']![0])).not.toBe(incoming)
      })

      it('AC-34 revoking the incoming session fails → 500, rolled back, no cookie', async () => {
        const { app, sessionRepo, tx } = createMockApp()
        sessionRepo.deleteByTokenHash.mockRejectedValueOnce(new Error('db down'))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const res = await request(app).post('/api/auth/register').set('Cookie', `token=${newSessionToken()}`).send(REGISTER_BODY)

        expect(res.status).toBe(500)
        expect(res.body.error.code).toBe('INTERNAL_ERROR')
        expect(res.headers['set-cookie']).toBeUndefined()
        expect(tx.statements).toEqual(['BEGIN', 'ROLLBACK'])
        errorSpy.mockRestore()
      })

      it('AC-34 AC-10 a successful register with a j:{} incoming cookie does not try to revoke it', async () => {
        const { app, sessionRepo } = createMockApp()

        const res = await request(app).post('/api/auth/register').set('Cookie', 'token=j:{}').send(REGISTER_BODY)

        expect(res.status).toBe(201)
        expect(sessionRepo.deleteByTokenHash).not.toHaveBeenCalled()
      })

      it.each([
        ['a taken email (409)', 409],
        ['a missing field (400)', 400],
      ])('AC-34 a rejected register with %s leaves the incoming session alone', async (_case, status) => {
        const { app, sessionRepo, usersByEmail } = createMockApp()
        usersByEmail.set('ana@example.com', {
          id: 'user-9',
          name: 'Ana',
          email: 'ana@example.com',
          password_hash: storedHash,
          neighborhood: 'Centro',
        })
        const body = status === 409 ? REGISTER_BODY : { name: 'Ana' }

        const res = await request(app).post('/api/auth/register').set('Cookie', `token=${newSessionToken()}`).send(body)

        expect(res.status).toBe(status)
        expect(res.headers['set-cookie']).toBeUndefined()
        expect(sessionRepo.deleteByTokenHash).not.toHaveBeenCalled()
        expect(sessionRepo.createIfPasswordCurrent).not.toHaveBeenCalled()
      })

      it('AC-24 the account vanished right after it was created → 500 INTERNAL_ERROR (never 401), rolled back, no cookie', async () => {
        const { app, sessionRepo, tx } = createMockApp()
        sessionRepo.createIfPasswordCurrent.mockResolvedValueOnce(false)
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const res = await request(app).post('/api/auth/register').send(REGISTER_BODY)

        expect(res.status).toBe(500)
        expect(res.body.error.code).toBe('INTERNAL_ERROR')
        expect(res.headers['set-cookie']).toBeUndefined()
        expect(tx.statements).toEqual(['BEGIN', 'ROLLBACK'])
        errorSpy.mockRestore()
      })
    })

    describe('logout', () => {
      it('AC-4 AC-5 deletes ONLY this session, by its hash, and clears the cookie', async () => {
        const { app, sessionRepo } = createMockApp()
        const token = newSessionToken()

        const res = await request(app).post('/api/auth/logout').set('Cookie', `token=${token}`)

        expect(res.status).toBe(204)
        expect(sessionRepo.deleteByTokenHash).toHaveBeenCalledTimes(1)
        expect(sessionRepo.deleteByTokenHash).toHaveBeenCalledWith(hashSessionToken(token))
        expect(sessionRepo.deleteOthers).not.toHaveBeenCalled()
        expect(sessionRepo.deleteAllForUser).not.toHaveBeenCalled()
        expect(res.headers['set-cookie']?.at(-1)).toMatch(/^token=;.*Expires=Thu, 01 Jan 1970/)
      })

      it('AC-12 without a cookie → 204, the cookie is cleared, nothing is deleted', async () => {
        const { app, sessionRepo } = createMockApp()

        const res = await request(app).post('/api/auth/logout')

        expect(res.status).toBe(204)
        expect(res.headers['set-cookie']?.at(-1)).toMatch(/^token=;.*Expires=Thu, 01 Jan 1970/)
        expect(sessionRepo.deleteByTokenHash).not.toHaveBeenCalled()
      })

      it.each([
        ['an old JWT', `token=${OLD_JWT}`],
        ['a j:{} value', 'token=j:{}'],
      ])('AC-10 AC-12 with %s → 204 and cleared, without touching the database', async (_case, cookie) => {
        const { app, sessionRepo } = createMockApp()

        const res = await request(app).post('/api/auth/logout').set('Cookie', cookie)

        expect(res.status).toBe(204)
        expect(res.headers['set-cookie']?.at(-1)).toMatch(/^token=;.*Expires=Thu, 01 Jan 1970/)
        expect(sessionRepo.deleteByTokenHash).not.toHaveBeenCalled()
      })

      it('AC-30 the database fails → 500 INTERNAL_ERROR and the cookie is NOT cleared', async () => {
        const { app, sessionRepo } = createMockApp()
        sessionRepo.deleteByTokenHash.mockRejectedValueOnce(new Error('db down'))
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const res = await request(app).post('/api/auth/logout').set('Cookie', `token=${newSessionToken()}`)

        expect(res.status).toBe(500)
        expect(res.body.error.code).toBe('INTERNAL_ERROR')
        expect(res.headers['set-cookie']).toBeUndefined()
        errorSpy.mockRestore()
      })
    })
  })

  describe('rate limiting', () => {
    beforeEach(() => {
      resetRateLimiter()
    })

    it('returns 429 after 5 requests in 1 minute from same IP', async () => {
      // Register first to have a valid endpoint
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/register')
          .send({
            name: `RateUser${i}`,
            email: `rate${i}@example.com`,
            password: 'password123',
            neighborhood: 'Centro',
          })
      }

      // 6th request should be rate limited
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'RateUser6',
          email: 'rate6@example.com',
          password: 'password123',
          neighborhood: 'Centro',
        })

      expect(res.status).toBe(429)
      expect(res.body.error.code).toBe('RATE_LIMITED')
    })
  })
})
