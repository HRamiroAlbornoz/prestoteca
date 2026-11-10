import { describe, expect, it, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { ToolRepository, type Tool } from '../src/modules/tools/toolRepo.js'
import { ToolService } from '../src/modules/tools/toolService.js'
import { SearchService } from '../src/modules/search/searchService.js'

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
    pause: vi.fn(async (id) => {
      const tool = toolsById.get(id)
      if (tool) tool.is_paused = true
    }),
    hasActiveLoans: vi.fn(async () => false),
  }

  const service = new ToolService(mockRepo as ToolRepository)

  // Mock SearchService
  const mockSearchRepo = {
    search: vi.fn(async () => ({ items: [], total: 0, page: 1, pages: 1 })),
    count: vi.fn(async () => 0),
  }
  const searchService = new SearchService(mockSearchRepo as never)

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

  app.use('/api/tools', toolsRoutes(service, searchService))

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
          category: 'Herramientas eléctricas',
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
      expect(res.body.error.code).toBe('TOOL_MISSING_FIELDS')
      expect(res.body.error.message).toBe('Missing required fields')
    })

    it('returns 400 TOOL_NAME_LENGTH when name is 2 characters', async () => {
      const { app } = createMockApp('user-1')

      const res = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({
          name: 'Ab',
          description: 'A description',
          category: 'Herramientas eléctricas',
          condition: 'bueno',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('TOOL_NAME_LENGTH')
      expect(res.body.error.message).toBe('The tool name must be between 3 and 60 characters')
    })

    it('returns 400 TOOL_NAME_LENGTH when name is 61 characters', async () => {
      const { app } = createMockApp('user-1')

      const res = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({
          name: 'x'.repeat(61),
          description: 'A description',
          category: 'Herramientas eléctricas',
          condition: 'bueno',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('TOOL_NAME_LENGTH')
      expect(res.body.error.message).toBe('The tool name must be between 3 and 60 characters')
    })

    it('accepts a name of 3 characters', async () => {
      const { app } = createMockApp('user-1')

      const res = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({
          name: 'ABC',
          description: 'A description',
          category: 'Herramientas eléctricas',
          condition: 'bueno',
        })

      expect(res.status).toBe(201)
      expect(res.body.name).toBe('ABC')
    })

    it('accepts a name of 60 characters', async () => {
      const { app } = createMockApp('user-1')

      const res = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({
          name: 'x'.repeat(60),
          description: 'A description',
          category: 'Herramientas eléctricas',
          condition: 'bueno',
        })

      expect(res.status).toBe(201)
      expect(res.body.name).toBe('x'.repeat(60))
    })

    it('returns 400 TOOL_DESCRIPTION_TOO_LONG when description is 501 characters', async () => {
      const { app } = createMockApp('user-1')

      const res = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({
          name: 'Tool',
          description: 'x'.repeat(501),
          category: 'Herramientas eléctricas',
          condition: 'bueno',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('TOOL_DESCRIPTION_TOO_LONG')
      expect(res.body.error.message).toBe('The tool description must be at most 500 characters')
    })

    it('accepts a description of 500 characters', async () => {
      const { app } = createMockApp('user-1')

      const res = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({
          name: 'Tool',
          description: 'x'.repeat(500),
          category: 'Herramientas eléctricas',
          condition: 'bueno',
        })

      expect(res.status).toBe(201)
    })

    it('returns 400 on invalid category', async () => {
      const { app } = createMockApp('user-1')

      const res = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({
          name: 'Taladro',
          description: 'Un taladro',
          category: 'invalida',
          condition: 'bueno',
        })

      expect(res.status).toBe(400)
    })

    it('returns 401 without auth token', async () => {
      const { app } = createMockApp('user-1')

      const res = await request(app)
        .post('/api/tools')
        .send({
          name: 'Taladro',
          description: 'Desc',
          category: 'Herramientas eléctricas',
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
        category: 'Herramientas eléctricas',
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
        category: 'Herramientas eléctricas',
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

    it('returns 400 on invalid category in edit', async () => {
      const { app, toolsById } = createMockApp('user-1')

      const toolId = 'uuid-1'
      toolsById.set(toolId, {
        id: toolId,
        owner_id: 'user-1',
        name: 'Taladro',
        description: 'Desc',
        category: 'Herramientas eléctricas',
        condition: 'bueno',
        is_paused: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
      })

      const res = await request(app)
        .patch(`/api/tools/${toolId}`)
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({ category: 'invalida' })

      expect(res.status).toBe(400)
    })

    describe('empty PATCH', () => {
      it('returns 404 TOOL_EDIT_EMPTY when patching own tool with no fields', async () => {
        const { app, toolsById } = createMockApp('user-1')

        const toolId = 'uuid-1'
        toolsById.set(toolId, {
          id: toolId,
          owner_id: 'user-1',
          name: 'Taladro',
          description: 'Desc',
          category: 'Herramientas eléctricas',
          condition: 'bueno',
          is_paused: false,
          deleted_at: null,
          created_at: new Date().toISOString(),
        })

        const res = await request(app)
          .patch(`/api/tools/${toolId}`)
          .set('Authorization', 'Bearer user-1')
          .set('Origin', 'http://localhost:5173')
          .send({})

        expect(res.status).toBe(404)
        expect(res.body.error.code).toBe('TOOL_EDIT_EMPTY')
      })

      it('returns 403 TOOL_NOT_OWNER when patching someone else tool with no fields', async () => {
        const { app, toolsById } = createMockApp('user-2')

        const toolId = 'uuid-1'
        toolsById.set(toolId, {
          id: toolId,
          owner_id: 'user-1',
          name: 'Taladro',
          description: 'Desc',
          category: 'Herramientas eléctricas',
          condition: 'bueno',
          is_paused: false,
          deleted_at: null,
          created_at: new Date().toISOString(),
        })

        const res = await request(app)
          .patch(`/api/tools/${toolId}`)
          .set('Authorization', 'Bearer user-2')
          .set('Origin', 'http://localhost:5173')
          .send({})

        expect(res.status).toBe(403)
        expect(res.body.error.code).toBe('TOOL_NOT_OWNER')
      })
    })

    describe('PATCH when repo returns null (row vanished)', () => {
      it('returns 404 TOOL_NOT_FOUND when repo.update returns null with fields present', async () => {
        // The tool exists when it is checked, but its row is gone when the update runs
        const service = new ToolService({
          create: vi.fn(),
          findById: vi.fn(async () => ({
            id: 'uuid-1',
            owner_id: 'user-1',
            name: 'Taladro',
            description: 'Desc',
            category: 'Herramientas eléctricas',
            condition: 'bueno',
            is_paused: false,
            deleted_at: null,
            created_at: new Date().toISOString(),
          })),
          findByOwner: vi.fn(),
          findAll: vi.fn(),
          update: vi.fn(async () => null),
          softDelete: vi.fn(),
          pause: vi.fn(),
          hasActiveLoans: vi.fn(),
        } as never)

        const mockSearchRepo = {
          search: vi.fn(async () => ({ items: [], total: 0, page: 1, pages: 1 })),
          count: vi.fn(async () => 0),
        }
        const searchService = new SearchService(mockSearchRepo as never)

        const app2 = express()
        app2.use(express.json())
        app2.use(cookieParser())
        app2.use('/api/tools', (req: express.Request, res: express.Response, next: express.NextFunction) => {
          ;(req as any).userId = 'user-1'
          next()
        })
        app2.use('/api/tools', toolsRoutes(service, searchService))

        const res = await request(app2)
          .patch('/api/tools/uuid-1')
          .set('Authorization', 'Bearer user-1')
          .set('Origin', 'http://localhost:5173')
          .send({ name: 'Changed' })

        expect(res.status).toBe(404)
        expect(res.body.error.code).toBe('TOOL_NOT_FOUND')
        expect(res.body.error.message).toBe('Tool not found')
      })
    })

    describe('GET /api/tools?q= with a search text that is too long', () => {
      it('answers 400 SEARCH_QUERY_TOO_LONG over HTTP, distinct from "no results"', async () => {
        const { app } = createMockApp('user-1')

        const res = await request(app).get(`/api/tools?q=${'x'.repeat(61)}`).set('Authorization', 'Bearer user-1')

        expect(res.status).toBe(400)
        expect(res.body).toEqual({
          error: { code: 'SEARCH_QUERY_TOO_LONG', message: 'Search query must be at most 60 characters' },
        })
      })
    })

    describe('pausing with { is_paused: true }', () => {
      // An active tool owned by user-1, the same shape the other tests use
      function addActiveTool(toolsById: Map<string, Tool>): string {
        const toolId = 'uuid-1'
        toolsById.set(toolId, {
          id: toolId,
          owner_id: 'user-1',
          name: 'Taladro',
          description: 'Desc',
          category: 'Herramientas eléctricas',
          condition: 'bueno',
          is_paused: false,
          deleted_at: null,
          created_at: new Date().toISOString(),
        })
        return toolId
      }

      it('returns 200 with the paused tool when the owner pauses it', async () => {
        const { app, toolsById } = createMockApp('user-1')
        const toolId = addActiveTool(toolsById)

        const res = await request(app)
          .patch(`/api/tools/${toolId}`)
          .set('Authorization', 'Bearer user-1')
          .set('Origin', 'http://localhost:5173')
          .send({ is_paused: true })

        expect(res.status).toBe(200)
        expect(res.body.is_paused).toBe(true)
        expect(toolsById.get(toolId)?.is_paused).toBe(true)
      })

      it('returns 403 and leaves the tool active when a non-owner tries to pause it', async () => {
        const { app, toolsById } = createMockApp('user-2')
        const toolId = addActiveTool(toolsById)

        const res = await request(app)
          .patch(`/api/tools/${toolId}`)
          .set('Authorization', 'Bearer user-2')
          .set('Origin', 'http://localhost:5173')
          .send({ is_paused: true })

        expect(res.status).toBe(403)
        expect(toolsById.get(toolId)?.is_paused).toBe(false)
      })

      // Reactivating is not in the spec, and anything other than `true` is a client mistake
      it.each([false, 'true', 1])('returns 400 and changes nothing when is_paused is %j', async (value) => {
        const { app, toolsById } = createMockApp('user-1')
        const toolId = addActiveTool(toolsById)

        const res = await request(app)
          .patch(`/api/tools/${toolId}`)
          .set('Authorization', 'Bearer user-1')
          .set('Origin', 'http://localhost:5173')
          .send({ is_paused: value })

        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('BAD_REQUEST')
        expect(toolsById.get(toolId)?.is_paused).toBe(false)
      })
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
        category: 'Herramientas eléctricas',
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

    it('returns 409 TOOL_HAS_ACTIVE_LOANS when deleting a tool with active loans', async () => {
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
        update: vi.fn(async () => null),
        softDelete: vi.fn(async () => false),
        pause: vi.fn(async () => {}),
        hasActiveLoans: vi.fn(async () => true),
      }

      const service = new ToolService(mockRepo as ToolRepository)

      const mockSearchRepo = {
        search: vi.fn(async () => ({ items: [], total: 0, page: 1, pages: 1 })),
        count: vi.fn(async () => 0),
      }
      const searchService = new SearchService(mockSearchRepo as never)

      const app = express()
      app.use(express.json())
      app.use(cookieParser())
      app.use('/api/tools', (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const authHeader = req.headers.authorization
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
          return
        }
        ;(req as any).userId = authHeader.replace('Bearer ', '')
        next()
      })
      app.use('/api/tools', toolsRoutes(service, searchService))

      const toolId = 'uuid-1'
      toolsById.set(toolId, {
        id: toolId,
        owner_id: 'user-1',
        name: 'Taladro',
        description: 'Desc',
        category: 'Herramientas eléctricas',
        condition: 'bueno',
        is_paused: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
      })

      const res = await request(app)
        .delete(`/api/tools/${toolId}`)
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('TOOL_HAS_ACTIVE_LOANS')
      expect(res.body.error.message).toBe('Cannot delete tool with active loans')
    })

    it('returns 403 when non-owner tries to delete', async () => {
      const { app, toolsById } = createMockApp('user-2')

      const toolId = 'uuid-1'
      toolsById.set(toolId, {
        id: toolId,
        owner_id: 'user-1',
        name: 'Taladro',
        description: 'Desc',
        category: 'Herramientas eléctricas',
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

  describe('routes without auth middleware (SESSION_REQUIRED guards)', () => {
    function createMockAppNoAuth() {
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
        update: vi.fn(async () => null),
        softDelete: vi.fn(async () => false),
        pause: vi.fn(async () => {}),
        hasActiveLoans: vi.fn(async () => false),
      }

      const service = new ToolService(mockRepo as ToolRepository)

      const mockSearchRepo = {
        search: vi.fn(async () => ({ items: [], total: 0, page: 1, pages: 1 })),
        count: vi.fn(async () => 0),
      }
      const searchService = new SearchService(mockSearchRepo as never)

      const app = express()
      app.use(express.json())
      app.use(cookieParser())
      // No auth middleware — toolsRoutes checks req.userId directly
      app.use('/api/tools', toolsRoutes(service, searchService))

      return { app, toolsById }
    }

    it('POST returns 401 SESSION_REQUIRED when no userId', async () => {
      const { app } = createMockAppNoAuth()

      const res = await request(app)
        .post('/api/tools')
        .send({
          name: 'Taladro',
          description: 'Desc',
          category: 'Herramientas eléctricas',
          condition: 'bueno',
        })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('SESSION_REQUIRED')
      expect(res.body.error.message).toBe('Not authenticated')
    })

    it('PATCH returns 401 SESSION_REQUIRED when no userId', async () => {
      const { app } = createMockAppNoAuth()

      const res = await request(app)
        .patch('/api/tools/uuid-1')
        .send({ name: 'Changed' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('SESSION_REQUIRED')
      expect(res.body.error.message).toBe('Not authenticated')
    })

    it('DELETE returns 401 SESSION_REQUIRED when no userId', async () => {
      const { app } = createMockAppNoAuth()

      const res = await request(app)
        .delete('/api/tools/uuid-1')

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('SESSION_REQUIRED')
      expect(res.body.error.message).toBe('Not authenticated')
    })
  })
})
