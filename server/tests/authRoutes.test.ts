import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { authRoutes } from '../src/modules/auth/authRoutes.js'
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
  app.use('/api/auth', authRoutes(mockRepo as UserRepository, 'test-secret', 'http://localhost:5173'))

  return { app, usersByEmail }
}

describe('auth routes', () => {
  let { app } = createMockApp()

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('POST /api/auth/register', () => {
    it('returns 201 with Set-Cookie header', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana', email: 'ana@example.com', password: 'ana123', neighborhood: 'Centro' })

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
    })

    it('returns 409 on duplicate email', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana', email: 'ana@example.com', password: 'ana123', neighborhood: 'Centro' })

      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Ana 2', email: 'ana@example.com', password: 'ana456', neighborhood: 'Norte' })

      expect(res.status).toBe(409)
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
    })

    it('returns 404 on non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.com', password: 'any' })

      expect(res.status).toBe(404)
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
})
