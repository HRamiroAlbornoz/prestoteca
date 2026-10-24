import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import type { Pool } from 'pg'
import { UserRepository, type User } from '../src/modules/auth/userRepo.js'
import { meAccountRoutes } from '../src/modules/me/meAccountRoutes.js'

// Mock bcrypt — track known hashes for realistic compare
let knownHashes = new Set<string>()
vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(async (pw: string, hash: string) => {
      if (hash === 'hashed_old') return true
      if (pw === 'old123' && hash === 'hashed_old') return true
      return false
    }),
    hash: vi.fn(async (pw: string) => {
      const hash = `hashed_${pw}`
      knownHashes.add(hash)
      return hash
    }),
  },
}))

function createMockApp() {
  const usersById = new Map<string, User>()
  let nextUserId = 1

  const mockUserRepo: Partial<UserRepository> = {
    findById: vi.fn(async (id) => usersById.get(id) ?? null),
    updatePassword: vi.fn(async (id, hash) => {
      const user = usersById.get(id)
      if (user) {
        user.password_hash = hash
      }
    }),
    delete: vi.fn(async (id) => {
      return usersById.delete(id)
    }),
    create: vi.fn(async (input) => {
      const user: User = {
        id: `user-${nextUserId++}`,
        name: input.name,
        email: input.email,
        password_hash: input.password_hash,
        neighborhood: input.neighborhood,
        created_at: new Date().toISOString(),
      }
      usersById.set(user.id, user)
      return user
    }),
    findByEmail: vi.fn(async () => null),
    findAll: vi.fn(async () => Array.from(usersById.values())),
    update: vi.fn(async () => null),
  }

  const app = express()
  app.use(express.json())
  app.use(cookieParser())

  // Auth middleware
  app.use(['/api/me/password', '/api/me/account'], (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
      return
    }
    ;(req as any).userId = authHeader.replace('Bearer ', '')
    next()
  })

  // The password routes never touch the pool; account deletion has its own tests
  app.use('/api', meAccountRoutes(mockUserRepo as UserRepository, {} as Pool))

  return { app, usersById }
}

describe('meAccountRoutes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    knownHashes.clear()
    knownHashes.add('hashed_old')
  })

  describe('PATCH /api/me/password', () => {
    it('returns 401 without auth', async () => {
      const { app } = createMockApp()

      const res = await request(app).patch('/api/me/password')
        .send({ currentPassword: 'old123', newPassword: 'new123456' })

      expect(res.status).toBe(401)
    })

    it('returns 400 on missing fields', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ newPassword: 'new123456' })

      expect(res.status).toBe(400)
    })

    it('returns 400 on short password', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'short' })

      expect(res.status).toBe(400)
    })

    it('returns 400 on password too long', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'a'.repeat(73) })

      expect(res.status).toBe(400)
    })

    it('returns 400 on spaces-only password', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: '     ' })

      expect(res.status).toBe(400)
    })

    it('returns 204 on successful password change', async () => {
      const { app, usersById } = createMockApp()

      usersById.set('user-1', {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hashed_old',
        neighborhood: 'Centro',
        created_at: '2026-10-01',
      })

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'newpassword123' })

      expect(res.status).toBe(204)
    })

    it('old password fails after change (AC 116)', async () => {
      const { app, usersById } = createMockApp()

      usersById.set('user-1', {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hashed_old',
        neighborhood: 'Centro',
        created_at: '2026-10-01',
      })

      // Change password
      await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'newpassword123' })

      // Old password should fail
      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'anotherpassword' })

      expect(res.status).toBe(401)
    })
  })

  // DELETE /api/me/account is covered in accountDeletion.test.ts
})
