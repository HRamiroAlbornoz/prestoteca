import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { ToolRepository } from '../src/modules/tools/toolRepo.js'
import { ToolService } from '../src/modules/tools/toolService.js'
import { SearchService } from '../src/modules/search/searchService.js'
import { originChecker } from '../src/modules/middleware/origin.js'
import { toolsRoutes } from '../src/modules/tools/toolsRoutes.js'

function createMockApp() {
  const toolsById = new Map()
  let nextId = 1

  const mockRepo: Partial<ToolRepository> = {
    create: vi.fn(async (input) => {
      const tool = {
        id: `tool-${nextId++}`,
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
  app.use(express.json({ limit: '10kb' }))
  app.use(cookieParser())

  // Apply origin checker to mutating methods
  app.use(['/api/tools'], (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      return originChecker(req, res, next)
    }
    next()
  })

  // Inline auth middleware
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

describe('Security ACs', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('AC 171: Body size > 10kb → 413', () => {
    it('returns 413 when JSON body exceeds 10kb', async () => {
      const { app } = createMockApp()

      // Create a payload larger than 10kb (10240 bytes)
      const largePayload = {
        name: 'x'.repeat(100),
        description: 'x'.repeat(10200),
        category: 'Herramientas eléctricas',
        condition: 'bueno',
      }

      const res = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send(largePayload)

      expect(res.status).toBe(413)
    })
  })

  describe('AC 172: Origin header required for mutating methods', () => {
    it('returns 403 on POST without Origin', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer user-1')
        .send({ name: 'Tool', description: 'Desc', category: 'Herramientas eléctricas', condition: 'bueno' })

      expect(res.status).toBe(403)
    })

    it('returns 403 on PATCH without Origin', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .patch('/api/tools/tool-1')
        .set('Authorization', 'Bearer user-1')
        .send({ name: 'Updated' })

      expect(res.status).toBe(403)
    })

    it('returns 403 on DELETE without Origin', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .delete('/api/tools/tool-1')
        .set('Authorization', 'Bearer user-1')

      expect(res.status).toBe(403)
    })

    it('allows POST with valid Origin', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Tool', description: 'Desc', category: 'Herramientas eléctricas', condition: 'bueno' })

      expect(res.status).toBe(201)
    })
  })

  describe('AC 173: Generic error messages (no stack traces)', () => {
    it('does not include stack trace in error response', async () => {
      const { app } = createMockApp()

      // Trigger an error by sending malformed data that causes a server error
      const res = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({
          name: 'Tool',
          description: 'Desc',
          category: 'invalid-category',
          condition: 'bueno',
        })

      const body = res.body
      expect(body.error).toBeDefined()
      expect(body.error.message).toBeDefined()
      expect(body.error.message).not.toContain('stack')
      expect(body.error.message).not.toContain('Error:')
      expect(body.error.message).not.toContain('at ')
    })

    it('returns generic message on 400 validation error', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({ name: 'Tool' })

      expect(res.status).toBe(400)
      expect(res.body.error.message).not.toContain('stack')
      expect(res.body.error.message).not.toContain('at ')
    })
  })
})
