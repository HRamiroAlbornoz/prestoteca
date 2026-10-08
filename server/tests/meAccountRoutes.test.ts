import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { UserRepository, type User } from '../src/modules/auth/userRepo.js'
import { ToolRepository, type Tool } from '../src/modules/tools/toolRepo.js'
import { meAccountRoutes } from '../src/modules/me/meAccountRoutes.js'

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(async () => true),
    hash: vi.fn(async (pw: string) => `hashed_${pw}`),
  },
}))

function createMockApp() {
  const usersById = new Map<string, User>()
  const toolsById = new Map<string, Tool>()
  let nextUserId = 1
  let nextToolId = 1

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

  const mockToolRepo: Partial<ToolRepository> = {
    findByOwner: vi.fn(async (ownerId) =>
      Array.from(toolsById.values()).filter((t) => t.owner_id === ownerId),
    ),
    softDelete: vi.fn(async (id) => {
      const tool = toolsById.get(id)
      if (tool) {
        tool.deleted_at = new Date().toISOString()
      }
      return true
    }),
    create: vi.fn(async () => ({ id: 'x', owner_id: '', name: '', description: '', category: '', condition: '', is_paused: false, deleted_at: null, created_at: '' })),
    findById: vi.fn(async () => null),
    findAll: vi.fn(async () => ({ items: [], total: 0, page: 1, pages: 1 })),
    update: vi.fn(async () => null),
    pause: vi.fn(async () => {}),
    hasActiveLoans: vi.fn(async () => false),
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

  app.use('/api', meAccountRoutes(mockUserRepo as UserRepository, mockToolRepo as ToolRepository))

  return { app, usersById, toolsById }
}

describe('meAccountRoutes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
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
  })

  describe('DELETE /api/me/account', () => {
    it('returns 401 without auth', async () => {
      const { app } = createMockApp()

      const res = await request(app).delete('/api/me/account')

      expect(res.status).toBe(401)
    })

    it('returns 204 on successful account deletion', async () => {
      const { app, usersById, toolsById } = createMockApp()

      usersById.set('user-1', {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hashed_old',
        neighborhood: 'Centro',
        created_at: '2026-10-01',
      })

      toolsById.set('tool-1', {
        id: 'tool-1',
        owner_id: 'user-1',
        name: 'Taladro',
        description: 'Un taladro',
        category: 'electricas',
        condition: 'bueno',
        is_paused: false,
        deleted_at: null,
        created_at: '2026-10-01',
      })

      const res = await request(app)
        .delete('/api/me/account')
        .set('Authorization', 'Bearer user-1')

      expect(res.status).toBe(204)
    })
  })
})
