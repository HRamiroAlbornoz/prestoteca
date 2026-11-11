import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { authRoutes } from '../src/modules/auth/authRoutes.js'
import { resetRateLimiter } from '../src/modules/middleware/rateLimit.js'
import { authRateLimiter } from '../src/modules/middleware/rateLimit.js'
import type { UserRepository } from '../src/modules/auth/userRepo.js'
import { AppError } from '../src/modules/errors/AppError.js'

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

  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(authRateLimiter)
  app.use('/api/auth', authRoutes(mockRepo as UserRepository, 'test-secret', 'http://localhost:5173'))

  return { app, usersByEmail }
}

describe('auth routes', () => {
  let { app } = createMockApp()

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

    it('returns 409 on duplicate email', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana García', email: 'ana@example.com', password: 'ana12345', neighborhood: 'Centro' })

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana López', email: 'ana@example.com', password: 'ana45678', neighborhood: 'Norte' })

      expect(res.status).toBe(409)
      expect(res.body).toEqual({ error: { code: 'EMAIL_TAKEN', message: 'Email already exists' } })
    })
  })

  describe('POST /api/auth/login', () => {
    it('returns 200 with Set-Cookie header', async () => {
      // Register first
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Carlos', email: 'carlos@example.com', password: 'carlos123', neighborhood: 'Norte' })

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
        .send({ name: 'Maria', email: 'maria@example.com', password: 'maria123', neighborhood: 'Sur' })

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
