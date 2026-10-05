import { describe, expect, it, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { ToolRepository, type Tool } from '../src/modules/tools/toolRepo.js'
import { ToolService } from '../src/modules/tools/toolService.js'

// Dynamic import — routes now use req.userId directly (no authMiddleware import)
const { toolsRoutes } = await import('../src/modules/tools/toolsRoutes.js')

function createMockApp(authUserId = 'user-1') {
  const toolsById = new Map<string, Tool>()
  let nextId = 1

  const mockRepo: Partial<ToolRepository> = {
    create: vi.fn(async (input) => {
      const tool: Tool = {
        id: `uuid-${nextId++}`,
        owner_id: input.ownerId,
        name: input.name,
        description: input.description,
        category: input.category,
        condition: input.condition,
        is_paused: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
      }
      toolsById.set(tool.id, tool)
      return tool
    }),
    findById: vi.fn(async (id) => toolsById.get(id) ?? null),
    findByOwner: vi.fn(async () => Array.from(toolsById.values())),
    findAll: vi.fn(async () => ({ items: [], total: 0, page: 1, pages: 1 })),
    update: vi.fn(async (id, updates) => {
      const tool = toolsById.get(id)
      if (!tool) return null
      Object.assign(tool, updates)
      return tool
    }),
    softDelete: vi.fn(async (id) => {
      const tool = toolsById.get(id)
      if (!tool || tool.deleted_at) return false
      tool.deleted_at = new Date().toISOString()
      return true
    }),
    pause: vi.fn(async () => {}),
    hasActiveLoans: vi.fn(async () => false),
  }

  const service = new ToolService(mockRepo as ToolRepository)
  const app = express()
  app.use(express.json())
  app.use(cookieParser())

  // Inline auth middleware — matches toolsRoutes expectation of req.userId
  app.use('/api/tools', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
      return
    }
    ;(req as any).userId = authHeader.replace('Bearer ', '')
    next()
  })

  app.use('/api/tools', toolsRoutes(service))

  return { app, toolsById }
}

describe('tools CRUD routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('POST /api/tools', () => {
    it('returns 201 with created tool', async () => {
      const { app } = createMockApp('user-1')

      const res = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({
          name: 'Taladro',
          description: 'Un taladro potente',
          category: 'electricas',
          condition: 'bueno',
        })

      expect(res.status).toBe(201)
      expect(res.body.id).toBeDefined()
      expect(res.body.name).toBe('Taladro')
    })

    it('returns 400 on missing fields', async () => {
      const { app } = createMockApp('user-1')

      const res = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Taladro' })

      expect(res.status).toBe(400)
    })

    it('returns 401 without auth token', async () => {
      const { app } = createMockApp('user-1')

      const res = await request(app)
        .post('/api/tools')
        .send({
          name: 'Taladro',
          description: 'Desc',
          category: 'electricas',
          condition: 'bueno',
        })

      expect(res.status).toBe(401)
    })
  })

  describe('PATCH /api/tools/:id', () => {
    it('returns 200 with updated tool when owner', async () => {
      const { app, toolsById } = createMockApp('user-1')

      const toolId = 'uuid-1'
      toolsById.set(toolId, {
        id: toolId,
        owner_id: 'user-1',
        name: 'Taladro',
        description: 'Desc',
        category: 'electricas',
        condition: 'bueno',
        is_paused: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
      })

      const res = await request(app)
        .patch(`/api/tools/${toolId}`)
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Taladro nuevo' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Taladro nuevo')
    })

    it('returns 403 when non-owner tries to edit', async () => {
      const { app, toolsById } = createMockApp('user-2')

      const toolId = 'uuid-1'
      toolsById.set(toolId, {
        id: toolId,
        owner_id: 'user-1',
        name: 'Taladro',
        description: 'Desc',
        category: 'electricas',
        condition: 'bueno',
        is_paused: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
      })

      const res = await request(app)
        .patch(`/api/tools/${toolId}`)
        .set('Authorization', 'Bearer user-2')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Hacked' })

      expect(res.status).toBe(403)
    })
  })

  describe('DELETE /api/tools/:id', () => {
    it('returns 204 when owner with no active loans', async () => {
      const { app, toolsById } = createMockApp('user-1')

      const toolId = 'uuid-1'
      toolsById.set(toolId, {
        id: toolId,
        owner_id: 'user-1',
        name: 'Taladro',
        description: 'Desc',
        category: 'electricas',
        condition: 'bueno',
        is_paused: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
      })

      const res = await request(app)
        .delete(`/api/tools/${toolId}`)
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')

      expect(res.status).toBe(204)
    })

    it('returns 403 when non-owner tries to delete', async () => {
      const { app, toolsById } = createMockApp('user-2')

      const toolId = 'uuid-1'
      toolsById.set(toolId, {
        id: toolId,
        owner_id: 'user-1',
        name: 'Taladro',
        description: 'Desc',
        category: 'electricas',
        condition: 'bueno',
        is_paused: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
      })

      const res = await request(app)
        .delete(`/api/tools/${toolId}`)
        .set('Authorization', 'Bearer user-2')
        .set('Origin', 'http://localhost:5173')

      expect(res.status).toBe(403)
    })
  })
})
