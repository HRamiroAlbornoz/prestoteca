import { describe, expect, it, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import type { LoanRepository } from '../src/modules/loans/loanRepo.js'
import { LoanService, type CreateLoanInput } from '../src/modules/loans/loanService.js'

const { loansRoutes } = await import('../src/modules/loans/loansRoutes.js')

function createMockApp() {
  const loans = new Map<string, any>()
  const tools = new Map<string, { id: string; owner_id: string }>()
  let nextLoanId = 1

  const query = vi.fn(async (text: string, values?: unknown[]) => {
    // Handle tool lookup for POST /tools/:id/loans
    if (text.includes('SELECT owner_id FROM tools WHERE id')) {
      const toolId = values?.[0] as string
      const tool = tools.get(toolId)
      if (tool) {
        return { rows: [{ owner_id: tool.owner_id }], rowCount: 1 } as { rows: unknown[]; rowCount: number | null }
      }
      return { rows: [], rowCount: 0 } as { rows: unknown[]; rowCount: number | null }
    }
    return { rows: [], rowCount: 0 } as { rows: unknown[]; rowCount: number | null }
  })

  const mockRepo: Partial<LoanRepository> = {
    create: vi.fn(async (input: any) => {
      const id = `loan-uuid-${nextLoanId++}`
      const loan = {
        id,
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
      loans.set(id, loan)
      return loan
    }),
    findById: vi.fn(async (id: string) => loans.get(id) ?? null),
    findAllByTool: vi.fn(async () => Array.from(loans.values())),
    findAllByBorrower: vi.fn(async () => Array.from(loans.values())),
    findAllByOwner: vi.fn(async () => Array.from(loans.values())),
    updateStatus: vi.fn(async (id: string, status: string) => {
      const loan = loans.get(id)
      if (loan) {
        loan.status = status
        loan.updated_at = new Date().toISOString()
      }
      return loan ?? null
    }),
    hasActiveLoans: vi.fn(async () => false),
    hasOverlappingDates: vi.fn(async () => false),
  }

  const service = new LoanService(mockRepo as LoanRepository, query)

  const app = express()
  app.use(express.json())
  app.use(cookieParser())

  // Inline auth middleware
  app.use('/api', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
      return
    }
    ;(req as any).userId = authHeader.replace('Bearer ', '')
    next()
  })

  // Set up tool data for routes
  ;(app as any).tools = tools
  ;(app as any).loans = loans

  app.use('/api', loansRoutes(service, query))

  return { app, loans, tools, mockRepo }
}

describe('loans routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('POST /api/tools/:id/loans', () => {
    it('returns 201 with created loan as pendiente', async () => {
      const { app, tools } = createMockApp()

      tools.set('tool-1', { id: 'tool-1', owner_id: 'user-1' })

      const res = await request(app)
        .post('/api/tools/tool-1/loans')
        .set('Authorization', 'Bearer user-2')
        .set('Origin', 'http://localhost:5173')
        .send({
          startDate: '2026-10-10',
          endDate: '2026-10-20',
          note: 'Necesito el taladro',
        })

      expect(res.status).toBe(201)
      expect(res.body.status).toBe('pendiente')
      expect(res.body.note).toBe('Necesito el taladro')
    })

    it('returns 400 when borrower is the tool owner', async () => {
      const { app, tools } = createMockApp()

      tools.set('tool-1', { id: 'tool-1', owner_id: 'user-1' })

      const res = await request(app)
        .post('/api/tools/tool-1/loans')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({
          startDate: '2026-10-10',
          endDate: '2026-10-20',
        })

      expect(res.status).toBe(400)
    })

    it('returns 404 when tool not found', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .post('/api/tools/nonexistent/loans')
        .set('Authorization', 'Bearer user-2')
        .set('Origin', 'http://localhost:5173')
        .send({
          startDate: '2026-10-10',
          endDate: '2026-10-20',
        })

      expect(res.status).toBe(404)
    })

    it('returns 409 when dates overlap', async () => {
      const { app, tools, mockRepo } = createMockApp()

      tools.set('tool-1', { id: 'tool-1', owner_id: 'user-1' })
      mockRepo.hasOverlappingDates = vi.fn().mockResolvedValueOnce(true)

      const res = await request(app)
        .post('/api/tools/tool-1/loans')
        .set('Authorization', 'Bearer user-2')
        .set('Origin', 'http://localhost:5173')
        .send({
          startDate: '2026-10-10',
          endDate: '2026-10-20',
        })

      expect(res.status).toBe(409)
    })

    it('returns 401 without auth', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .post('/api/tools/tool-1/loans')
        .send({
          startDate: '2026-10-10',
          endDate: '2026-10-20',
        })

      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/loans/:id', () => {
    it('returns 200 with loan detail when borrower', async () => {
      const { app, loans } = createMockApp()

      loans.set('loan-1', {
        id: 'loan-1',
        tool_id: 'tool-1',
        borrower_id: 'user-2',
        owner_id: 'user-1',
        start_date: '2026-10-10',
        end_date: '2026-10-20',
        status: 'pendiente',
        note: 'Necesito el taladro',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const res = await request(app)
        .get('/api/loans/loan-1')
        .set('Authorization', 'Bearer user-2')
        .set('Origin', 'http://localhost:5173')

      expect(res.status).toBe(200)
      expect(res.body.id).toBe('loan-1')
      expect(res.body.status).toBe('pendiente')
    })

    it('returns 404 when non-participant tries to get loan', async () => {
      const { app, loans } = createMockApp()

      loans.set('loan-1', {
        id: 'loan-1',
        tool_id: 'tool-1',
        borrower_id: 'user-2',
        owner_id: 'user-1',
        start_date: '2026-10-10',
        end_date: '2026-10-20',
        status: 'pendiente',
        note: 'Necesito el taladro',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const res = await request(app)
        .get('/api/loans/loan-1')
        .set('Authorization', 'Bearer user-99')
        .set('Origin', 'http://localhost:5173')

      expect(res.status).toBe(404)
    })

    it('returns 404 when loan not found', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .get('/api/loans/nonexistent')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')

      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/loans/:id/status', () => {
    it('returns 200 with updated status when valid transition (owner)', async () => {
      const { app, loans } = createMockApp()

      loans.set('loan-1', {
        id: 'loan-1',
        tool_id: 'tool-1',
        borrower_id: 'user-2',
        owner_id: 'user-1',
        start_date: '2026-10-10',
        end_date: '2026-10-20',
        status: 'pendiente',
        note: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const res = await request(app)
        .patch('/api/loans/loan-1/status')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({ status: 'aceptado' })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('aceptado')
    })

    it('returns 409 on invalid transition', async () => {
      const { app, loans } = createMockApp()

      loans.set('loan-1', {
        id: 'loan-1',
        tool_id: 'tool-1',
        borrower_id: 'user-2',
        owner_id: 'user-1',
        start_date: '2026-10-10',
        end_date: '2026-10-20',
        status: 'pendiente',
        note: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const res = await request(app)
        .patch('/api/loans/loan-1/status')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({ status: 'devuelto' })

      expect(res.status).toBe(409)
    })

    it('returns 404 when non-participant tries to transition', async () => {
      const { app, loans } = createMockApp()

      loans.set('loan-1', {
        id: 'loan-1',
        tool_id: 'tool-1',
        borrower_id: 'user-2',
        owner_id: 'user-1',
        start_date: '2026-10-10',
        end_date: '2026-10-20',
        status: 'pendiente',
        note: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const res = await request(app)
        .patch('/api/loans/loan-1/status')
        .set('Authorization', 'Bearer user-99')
        .set('Origin', 'http://localhost:5173')
        .send({ status: 'aceptado' })

      expect(res.status).toBe(404)
    })

    it('returns 401 without auth', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .patch('/api/loans/loan-1/status')
        .send({ status: 'aceptado' })

      expect(res.status).toBe(401)
    })

    it('returns 200 when borrower cancels (aceptado → cancelado)', async () => {
      const { app, loans } = createMockApp()

      loans.set('loan-1', {
        id: 'loan-1',
        tool_id: 'tool-1',
        borrower_id: 'user-2',
        owner_id: 'user-1',
        start_date: '2026-10-10',
        end_date: '2026-10-20',
        status: 'aceptado',
        note: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const res = await request(app)
        .patch('/api/loans/loan-1/status')
        .set('Authorization', 'Bearer user-2')
        .set('Origin', 'http://localhost:5173')
        .send({ status: 'cancelado' })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('cancelado')
    })
  })
})
