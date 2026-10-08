import { describe, expect, it, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { ToolRepository, type Tool } from '../src/modules/tools/toolRepo.js'
import { ToolService } from '../src/modules/tools/toolService.js'
import { SearchService } from '../src/modules/search/searchService.js'
import { SearchRepository } from '../src/modules/search/searchRepo.js'
import { meRoutes } from '../src/modules/me/meRoutes.js'
import { loansRoutes } from '../src/modules/loans/loansRoutes.js'
import { toolsRoutes } from '../src/modules/tools/toolsRoutes.js'
import { LoanRepository, type Loan } from '../src/modules/loans/loanRepo.js'

function createMockApp() {
  const toolsById = new Map<string, Tool>()
  const loansById = new Map<string, Loan>()
  let nextToolId = 1
  let nextLoanId = 1

  const mockToolRepo: Partial<ToolRepository> = {
    create: vi.fn(async (input) => {
      const tool: Tool = {
        id: `tool-${nextToolId++}`,
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
    findByOwner: vi.fn(async (ownerId) =>
      Array.from(toolsById.values()).filter((t) => t.owner_id === ownerId),
    ),
    findAll: vi.fn(async () => ({ items: [], total: 0, page: 1, pages: 1 })),
    update: vi.fn(async () => null),
    softDelete: vi.fn(async () => false),
    pause: vi.fn(async () => {}),
    hasActiveLoans: vi.fn(async () => false),
  }

  const mockSearchRepo: Partial<SearchRepository> = {
    search: vi.fn(async () => ({
      items: [],
      total: 0,
      page: 1,
      pages: 1,
    })),
    count: vi.fn(async () => 0),
  }

  const toolService = new ToolService(mockToolRepo as ToolRepository)
  // SearchService espera ToolRepository (llama a findAll)
  const searchService = new SearchService(mockToolRepo as ToolRepository)

  const mockLoanRepo: Partial<LoanRepository> = {
    create: vi.fn(async (input) => {
      const loan: Loan = {
        id: `loan-${nextLoanId++}`,
        tool_id: input.toolId,
        borrower_id: input.borrowerId,
        owner_id: input.ownerId,
        start_date: input.startDate,
        end_date: input.endDate,
        status: input.status,
        note: input.note ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      loansById.set(loan.id, loan)
      return loan
    }),
    findById: vi.fn(async (id) => loansById.get(id) ?? null),
    findAllByTool: vi.fn(async () => []),
    findAllByBorrower: vi.fn(async (borrowerId) =>
      Array.from(loansById.values()).filter((l) => l.borrower_id === borrowerId),
    ),
    findAllByOwner: vi.fn(async (ownerId) =>
      Array.from(loansById.values()).filter((l) => l.owner_id === ownerId),
    ),
    updateStatus: vi.fn(async () => null),
    hasActiveLoans: vi.fn(async () => false),
    hasOverlappingDates: vi.fn(async () => false),
    findTerminatedByUserId: vi.fn(async (userId) =>
      Array.from(loansById.values()).filter(
        (l) => (l.borrower_id === userId || l.owner_id === userId) && ['devuelto', 'rechazado', 'cancelado'].includes(l.status),
      ),
    ),
  }

  const mockQuery = vi.fn(async () => ({ rows: [], rowCount: 0 }))

  const app = express()
  app.use(express.json())
  app.use(cookieParser())

  // Auth middleware — GET /api/tools (no auth required)
  // Auth middleware — POST/PATCH/DELETE /api/tools
  app.use('/api/tools', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method === 'GET' && req.path === '/') {
      return next()
    }
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
      return
    }
    ;(req as any).userId = authHeader.replace('Bearer ', '')
    next()
  })

  // Auth middleware — /api/loans and /api/me
  app.use(['/api/loans', '/api/me'], (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
      return
    }
    ;(req as any).userId = authHeader.replace('Bearer ', '')
    next()
  })

  app.use('/api/tools', toolsRoutes(toolService, searchService))
  app.use('/api', loansRoutes(toolService, mockQuery))
  app.use('/api', meRoutes(mockToolRepo as ToolRepository, mockLoanRepo as LoanRepository))

  return { app, toolsById, loansById }
}

describe('T030 routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('GET /api/tools', () => {
    it('returns 400 when page is -1', async () => {
      const { app } = createMockApp()

      const res = await request(app).get('/api/tools?page=-1')

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
    })

    it('returns 400 when page is 0', async () => {
      const { app } = createMockApp()

      const res = await request(app).get('/api/tools?page=0')

      expect(res.status).toBe(400)
    })

    it('returns 400 when page is not a number', async () => {
      const { app } = createMockApp()

      const res = await request(app).get('/api/tools?page=abc')

      expect(res.status).toBe(400)
    })

    it('returns 200 with paginated tools (default page 1)', async () => {
      const { app } = createMockApp()

      const res = await request(app).get('/api/tools')

      expect(res.status).toBe(200)
      expect(res.body.items).toBeDefined()
      expect(res.body.total).toBeDefined()
      expect(res.body.page).toBe(1)
    })

    it('filters by category', async () => {
      const { app } = createMockApp()

      const res = await request(app).get('/api/tools?category=electricas')

      expect(res.status).toBe(200)
      expect(res.body.items).toBeDefined()
    })

    it('filters by neighborhood', async () => {
      const { app } = createMockApp()

      const res = await request(app).get('/api/tools?neighborhood=centro')

      expect(res.status).toBe(200)
      expect(res.body.items).toBeDefined()
    })

    it('searches by name', async () => {
      const { app } = createMockApp()

      const res = await request(app).get('/api/tools?q=taladro')

      expect(res.status).toBe(200)
      expect(res.body.items).toBeDefined()
    })
  })

  describe('GET /api/me/tools', () => {
    it('returns 401 without auth', async () => {
      const { app } = createMockApp()

      const res = await request(app).get('/api/me/tools')

      expect(res.status).toBe(401)
    })

    it('returns 200 with tools + receivedLoans + madeLoans', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .get('/api/me/tools')
        .set('Authorization', 'Bearer user-1')

      expect(res.status).toBe(200)
      expect(res.body.tools).toBeDefined()
      expect(res.body.receivedLoans).toBeDefined()
      expect(res.body.madeLoans).toBeDefined()
    })
  })

  describe('GET /api/me/history', () => {
    it('returns 401 without auth', async () => {
      const { app } = createMockApp()

      const res = await request(app).get('/api/me/history')

      expect(res.status).toBe(401)
    })

    it('returns 200 with terminated loans', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .get('/api/me/history')
        .set('Authorization', 'Bearer user-1')

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
    })
  })
})
