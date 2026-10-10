import { describe, expect, it, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { authRoutes } from '../src/modules/auth/authRoutes.js'
import { resetRateLimiter } from '../src/modules/middleware/rateLimit.js'
import { rateLimiter } from '../src/modules/middleware/rateLimit.js'
import type { UserRepository } from '../src/modules/auth/userRepo.js'

function createMockApp() {
  const usersByEmail = new Map<string, { id: string; name: string; email: string; password_hash: string; neighborhood: string }>()
  let nextId = 1

  const mockRepo: Partial<UserRepository> = {
    findByEmail: vi.fn(async (email: string) => {
      return usersByEmail.get(email) ?? null
    }),
    create: vi.fn(async (input: { name: string; email: string; password_hash: string; neighborhood: string }) => {
      if (usersByEmail.has(input.email)) {
        throw new Error('Email already exists')
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
  app.use(rateLimiter)
  app.use('/api/auth', authRoutes(mockRepo as UserRepository, 'test-secret', 'http://localhost:5173'))

  return { app, usersByEmail }
}

describe('auth validation ACs', () => {
  beforeEach(() => {
    resetRateLimiter()
  })

  describe('email length validation', () => {
    it('rejects register with email > 254 characters', async () => {
      const longEmail = 'a'.repeat(250) + '@x.co' // 254 chars total

      const res = await request(createMockApp().app)
        .post('/api/auth/register')
        .send({ name: 'Test', email: longEmail, password: 'password123', neighborhood: 'Centro' })

      expect(res.status).toBe(400)
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
        .send({ name: 'Ana López', email: 'ANA@EXAMPLE.COM', password: 'ana45678', neighborhood: 'Norte' })

      expect(res.status).toBe(409)
    })
  })
})
