import { describe, expect, it, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { ToolRepository, type Tool } from '../src/modules/tools/toolRepo.js'
import { ToolService } from '../src/modules/tools/toolService.js'
import { SearchService } from '../src/modules/search/searchService.js'
import { SearchRepository } from '../src/modules/search/searchRepo.js'

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

  // Mock SearchService
  const mockSearchRepo = {
    search: vi.fn(async () => ({ items: [], total: 0, page: 1, pages: 1 })),
    count: vi.fn(async () => 0),
  }
  const searchService = new SearchService(mockSearchRepo as never)

  const app = express()
  app.use(express.json())
  app.use(cookieParser())

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

describe('GET /api/tools/:id detail', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 200 with full tool detail', async () => {
    const { app, toolsById } = createMockApp('user-1')

    const toolId = 'uuid-1'
    toolsById.set(toolId, {
      id: toolId,
      owner_id: 'user-1',
      name: 'Taladro',
      description: 'Un taladro potente de 500W',
      category: 'electricas',
      condition: 'bueno',
      is_paused: false,
      deleted_at: null,
      created_at: '2026-10-01T00:00:00.000Z',
    })

    const res = await request(app)
      .get(`/api/tools/${toolId}`)
      .set('Authorization', 'Bearer user-1')
      .set('Origin', 'http://localhost:5173')

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(toolId)
    expect(res.body.name).toBe('Taladro')
    expect(res.body.description).toBe('Un taladro potente de 500W')
    expect(res.body.category).toBe('electricas')
    expect(res.body.condition).toBe('bueno')
    expect(res.body.is_paused).toBe(false)
  })

  it('returns 404 for non-existent tool', async () => {
    const { app } = createMockApp('user-1')

    const res = await request(app)
      .get('/api/tools/uuid-nonexistent')
      .set('Authorization', 'Bearer user-1')
      .set('Origin', 'http://localhost:5173')

    expect(res.status).toBe(404)
  })
})
