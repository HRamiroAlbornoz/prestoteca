import { describe, expect, it, vi, beforeEach } from 'vitest'
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

describe('auth validation ACs', () => {
  beforeEach(() => {
    resetRateLimiter()
  })

  describe('email length validation', () => {
    it('rejects register with email > 254 characters', async () => {
      const longEmail = 'a'.repeat(250) + '@x.co' // 255 chars: one over the limit

      const res = await request(createMockApp().app)
        .post('/api/auth/register')
        .send({ name: 'Test', email: longEmail, password: 'password123', neighborhood: 'Centro' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: { code: 'REGISTER_EMAIL_TOO_LONG', message: 'Email demasiado largo' } })
    })
  })

  describe('case-insensitive email duplicate', () => {
    it('rejects register with same email different case', async () => {
      const app = createMockApp()
      // Register with lowercase
      await request(app.app)
        .post('/api/auth/register')
        .send({ name: 'Ana García', email: 'ana@example.com', password: 'ana12345', neighborhood: 'Centro' })

      // Try to register with uppercase
      const res = await request(app.app)
        .post('/api/auth/register')
        .send({ name: 'Ana López', email: 'ANA@EXAMPLE.COM', password: 'ana45678', neighborhood: 'Barrio Norte' })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('EMAIL_TAKEN')
    })
  })

  describe('neighborhood validation', () => {
    // N1a: invalid neighborhoods → 400 and no account created
    it.each<[string, string]>([
      ['Palermo', 'n1a-1@example.com'],
      ['centro', 'n1a-2@example.com'],
      ['Villa Lujan', 'n1a-3@example.com'],
      ['Barrio', 'n1a-4@example.com'],
      ['Centro Histórico', 'n1a-5@example.com'],
      ['Villa Luja\u0301n', 'n1a-6@example.com'],
    ])('N1a rejects neighborhood %s with 400 REGISTER_NEIGHBORHOOD_INVALID and no account', async (nb, email) => {
      const { app, usersByEmail } = createMockApp()

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test', email, password: 'ana12345', neighborhood: nb })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: { code: 'REGISTER_NEIGHBORHOOD_INVALID', message: 'Neighborhood must be one of the fixed list' } })
      expect(usersByEmail.size).toBe(0)
    })

    // N1b: each of the 8 valid neighborhoods → 201
    it.each<[string]>([
      ['Centro'],
      ['Barrio Norte'],
      ['Barrio Sur'],
      ['Ciudadela'],
      ['Villa Luján'],
      ['Barrio Jardín'],
      ['Villa 9 de Julio'],
      ['Yerba Buena'],
    ])('N1b accepts neighborhood %s with 201', async (nb) => {
      const { app } = createMockApp()

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana', email: `ana${nb.toLowerCase().replace(/\s/g, '')}@example.com`, password: 'ana12345', neighborhood: nb })

      expect(res.status).toBe(201)
    })

    // N1c: neighborhood with spaces is trimmed
    it('N1c accepts "  Centro  " (trimmed) with 201 and stores trimmed value', async () => {
      const { app, usersByEmail } = createMockApp()

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana', email: 'anacentro@example.com', password: 'ana12345', neighborhood: '  Centro  ' })

      expect(res.status).toBe(201)
      expect(usersByEmail.get('anacentro@example.com')?.neighborhood).toBe('Centro')
    })

    // N1d: neighborhood of only spaces → REGISTER_MISSING_FIELDS (unchanged)
    it('N1d rejects neighborhood of only spaces with 400 REGISTER_MISSING_FIELDS', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana', email: 'anaspaces@example.com', password: 'ana12345', neighborhood: '   ' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: { code: 'REGISTER_MISSING_FIELDS', message: 'Missing required fields' } })
    })
  })
})
