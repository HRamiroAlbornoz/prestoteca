import { describe, expect, it, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import type { LoanRepository } from '../src/modules/loans/loanRepo.js'
import { LoanService, type CreateLoanInput } from '../src/modules/loans/loanService.js'

const { loansRoutes } = await import('../src/modules/loans/loansRoutes.js')

// Dates relative to today: the endpoint rejects start dates in the past,
// so a fixed date turns invalid as soon as the calendar reaches it.
// The 5-day margin keeps the test independent of the time zone.
function daysFromToday(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const START_DATE = daysFromToday(5)
const END_DATE = daysFromToday(15)

// getToday lets a test fix "today"; without it the route uses the real date
function createMockApp(getToday?: () => string) {
  const loans = new Map<string, any>()
  // is_paused is optional so the existing tests can keep omitting it (an omitted value means "not paused")
  const tools = new Map<string, { id: string; owner_id: string; is_paused?: boolean }>()
  let nextLoanId = 1

  const query = vi.fn(async (text: string, values?: unknown[]) => {
    // Handle tool lookup for POST /tools/:id/loans
    if (text.includes('FROM tools WHERE id')) {
      const toolId = values?.[0] as string
      const tool = tools.get(toolId)
      if (tool) {
        const row = { owner_id: tool.owner_id, is_paused: tool.is_paused ?? false }
        return { rows: [row], rowCount: 1 } as { rows: unknown[]; rowCount: number | null }
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

  app.use('/api', loansRoutes(service, query, getToday))

  return { app, loans, tools, mockRepo }
}

// Mounts loansRoutes WITHOUT the inline auth middleware, so the route's own
// guard is exercised (the route checks req.userId itself).
function createMockAppNoAuth(getToday?: () => string) {
  const loans = new Map<string, any>()
  const tools = new Map<string, { id: string; owner_id: string; is_paused?: boolean }>()

  const query = vi.fn(async (text: string, values?: unknown[]) => {
    if (text.includes('FROM tools WHERE id')) {
      const toolId = values?.[0] as string
      const tool = tools.get(toolId)
      if (tool) {
        const row = { owner_id: tool.owner_id, is_paused: tool.is_paused ?? false }
        return { rows: [row], rowCount: 1 } as { rows: unknown[]; rowCount: number | null }
      }
      return { rows: [], rowCount: 0 } as { rows: unknown[]; rowCount: number | null }
    }
    return { rows: [], rowCount: 0 } as { rows: unknown[]; rowCount: number | null }
  })

  const mockRepo: Partial<LoanRepository> = {
    create: vi.fn(async (input: any) => {
      const id = `loan-uuid-${Date.now()}`
      return {
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
    }),
    findById: vi.fn(async () => null),
    findAllByTool: vi.fn(async () => []),
    findAllByBorrower: vi.fn(async () => []),
    findAllByOwner: vi.fn(async () => []),
    updateStatus: vi.fn(async () => null),
    hasActiveLoans: vi.fn(async () => false),
    hasOverlappingDates: vi.fn(async () => false),
  }

  const service = new LoanService(mockRepo as LoanRepository, query)

  const app = express()
  app.use(express.json())
  app.use('/api', loansRoutes(service, query, getToday))

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
          startDate: START_DATE,
          endDate: END_DATE,
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
          startDate: START_DATE,
          endDate: END_DATE,
        })

      expect(res.status).toBe(400)
      // The reason matters: a 400 for any other cause (e.g. a past date) must not pass this test
      expect(res.body.error.message).toMatch(/propia herramienta/)
    })

    it('returns 400 { code: LOAN_DATES_MISSING } when start or end date is missing', async () => {
      const { app, tools } = createMockApp()

      tools.set('tool-1', { id: 'tool-1', owner_id: 'user-1' })

      const res = await request(app)
        .post('/api/tools/tool-1/loans')
        .set('Authorization', 'Bearer user-2')
        .set('Origin', 'http://localhost:5173')
        .send({ startDate: START_DATE })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('LOAN_DATES_MISSING')
      expect(res.body.error.message).toBe('Missing start or end date')
    })

    it('returns 404 when tool not found', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .post('/api/tools/nonexistent/loans')
        .set('Authorization', 'Bearer user-2')
        .set('Origin', 'http://localhost:5173')
        .send({
          startDate: START_DATE,
          endDate: END_DATE,
        })

      expect(res.status).toBe(404)
      expect(res.body.error).toEqual({
        code: 'TOOL_NOT_FOUND',
        message: 'Tool not found',
      })
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
          startDate: START_DATE,
          endDate: END_DATE,
        })

      expect(res.status).toBe(409)
      expect(res.body.error).toEqual({
        code: 'LOAN_DATES_OVERLAP',
        message: 'La herramienta tiene un préstamo activo con fechas solapadas',
      })
    })

    it('returns 409 when the tool is paused and creates no loan', async () => {
      const { app, tools, mockRepo } = createMockApp()

      tools.set('tool-1', { id: 'tool-1', owner_id: 'user-1', is_paused: true })

      const res = await request(app)
        .post('/api/tools/tool-1/loans')
        .set('Authorization', 'Bearer user-2')
        .set('Origin', 'http://localhost:5173')
        .send({
          startDate: START_DATE,
          endDate: END_DATE,
        })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('TOOL_PAUSED')
      expect(res.body.error.message).toMatch(/pausada/)
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    describe('start date against "today" in the app time zone', () => {
      // A fixed "today" far from the real calendar: if the route ignored getToday, these would fail
      const TODAY = '2030-01-10'

      it('returns 400 when the start date is the day before today', async () => {
        const { app, tools, mockRepo } = createMockApp(() => TODAY)
        tools.set('tool-1', { id: 'tool-1', owner_id: 'user-1' })

        const res = await request(app)
          .post('/api/tools/tool-1/loans')
          .set('Authorization', 'Bearer user-2')
          .set('Origin', 'http://localhost:5173')
          .send({ startDate: '2030-01-09', endDate: '2030-01-12' })

        expect(res.status).toBe(400)
        expect(res.body.error).toEqual({
          code: 'LOAN_START_IN_PAST',
          message: 'The start date cannot be in the past',
        })
        expect(mockRepo.create).not.toHaveBeenCalled()
      })

      it('returns 201 when the start date is today', async () => {
        const { app, tools } = createMockApp(() => TODAY)
        tools.set('tool-1', { id: 'tool-1', owner_id: 'user-1' })

        const res = await request(app)
          .post('/api/tools/tool-1/loans')
          .set('Authorization', 'Bearer user-2')
          .set('Origin', 'http://localhost:5173')
          .send({ startDate: TODAY, endDate: '2030-01-12' })

        expect(res.status).toBe(201)
      })
    })

    it('returns 400 { code: LOAN_END_BEFORE_START } when end date is before start date', async () => {
      const { app, tools, mockRepo } = createMockApp()
      tools.set('tool-1', { id: 'tool-1', owner_id: 'user-1' })

      const res = await request(app)
        .post('/api/tools/tool-1/loans')
        .set('Authorization', 'Bearer user-2')
        .set('Origin', 'http://localhost:5173')
        .send({ startDate: '2026-12-01', endDate: '2026-11-01' })

      expect(res.status).toBe(400)
      expect(res.body.error).toEqual({
        code: 'LOAN_END_BEFORE_START',
        message: 'The end date cannot be before the start date',
      })
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('returns 400 { code: LOAN_NOTE_TOO_LONG } when note is 301 characters', async () => {
      const { app, tools, mockRepo } = createMockApp()
      tools.set('tool-1', { id: 'tool-1', owner_id: 'user-1' })

      const note301 = 'a'.repeat(301)

      const res = await request(app)
        .post('/api/tools/tool-1/loans')
        .set('Authorization', 'Bearer user-2')
        .set('Origin', 'http://localhost:5173')
        .send({ startDate: START_DATE, endDate: END_DATE, note: note301 })

      expect(res.status).toBe(400)
      expect(res.body.error).toEqual({
        code: 'LOAN_NOTE_TOO_LONG',
        message: 'The note must be at most 300 characters',
      })
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('returns 201 when note is exactly 300 characters', async () => {
      const { app, tools } = createMockApp()
      tools.set('tool-1', { id: 'tool-1', owner_id: 'user-1' })

      const note300 = 'a'.repeat(300)

      const res = await request(app)
        .post('/api/tools/tool-1/loans')
        .set('Authorization', 'Bearer user-2')
        .set('Origin', 'http://localhost:5173')
        .send({ startDate: START_DATE, endDate: END_DATE, note: note300 })

      expect(res.status).toBe(201)
      expect(res.body.note).toBe(note300)
    })

    it('returns 401 without auth', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .post('/api/tools/tool-1/loans')
        .send({
          startDate: START_DATE,
          endDate: END_DATE,
        })

      expect(res.status).toBe(401)
    })

    it('returns 401 { code: SESSION_REQUIRED } when the route guard fires (no auth middleware)', async () => {
      const { app } = createMockAppNoAuth()

      const res = await request(app)
        .post('/api/tools/tool-1/loans')
        .send({
          startDate: START_DATE,
          endDate: END_DATE,
        })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('SESSION_REQUIRED')
      expect(res.body.error.message).toBe('Not authenticated')
    })

    it.each([
      ['POST /api/tools/:id/loans', '/api/tools/tool-1/loans', 'post', { startDate: START_DATE, endDate: END_DATE }],
      ['GET /api/loans/:id', '/api/loans/loan-1', 'get', {}],
      ['PATCH /api/loans/:id/status', '/api/loans/loan-1/status', 'patch', { status: 'aceptado' }],
      ['GET /api/loans?type=pedidos', '/api/loans?type=pedidos', 'get', {}],
    ])('returns 401 { code: SESSION_REQUIRED } — %s (no auth middleware)', async (_, path, method, body) => {
      const { app } = createMockAppNoAuth()

      let res
      if (method === 'get') {
        res = await request(app).get(path)
      } else if (method === 'post') {
        res = await request(app).post(path).send(body)
      } else {
        res = await request(app).patch(path).send(body)
      }

      expect(res.status).toBe(401)
      expect(res.body.error).toEqual({ code: 'SESSION_REQUIRED', message: 'Not authenticated' })
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
      expect(res.body.error.code).toBe('LOAN_NOT_FOUND')
      expect(res.body.error.message).toBe('Préstamo no encontrado')
    })

    it('returns 404 when loan not found', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .get('/api/loans/nonexistent')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('LOAN_NOT_FOUND')
      expect(res.body.error.message).toBe('Préstamo no encontrado')
    })

    it('stranger and non-existent loan return identical body (GET)', async () => {
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

      const strangerRes = await request(app)
        .get('/api/loans/loan-1')
        .set('Authorization', 'Bearer user-99')
        .set('Origin', 'http://localhost:5173')

      const missingRes = await request(app)
        .get('/api/loans/nonexistent')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')

      expect(strangerRes.status).toBe(404)
      expect(missingRes.status).toBe(404)
      expect(strangerRes.body).toEqual(missingRes.body)
      expect(strangerRes.body).toEqual({
        error: { code: 'LOAN_NOT_FOUND', message: 'Préstamo no encontrado' },
      })
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
      expect(res.body.error.code).toBe('LOAN_TRANSITION_INVALID')
    })

    it('returns 403 when the borrower tries to accept their own request', async () => {
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
        .set('Authorization', 'Bearer user-2')
        .set('Origin', 'http://localhost:5173')
        .send({ status: 'aceptado' })

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('LOAN_TRANSITION_WRONG_ROLE')
      expect(loans.get('loan-1').status).toBe('pendiente')
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

    it('stranger and non-existent loan return identical body (PATCH)', async () => {
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

      const strangerRes = await request(app)
        .patch('/api/loans/loan-1/status')
        .set('Authorization', 'Bearer user-99')
        .set('Origin', 'http://localhost:5173')
        .send({ status: 'aceptado' })

      const missingRes = await request(app)
        .patch('/api/loans/nonexistent/status')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({ status: 'aceptado' })

      expect(strangerRes.status).toBe(404)
      expect(missingRes.status).toBe(404)
      expect(strangerRes.body).toEqual(missingRes.body)
      expect(strangerRes.body).toEqual({
        error: { code: 'LOAN_NOT_FOUND', message: 'Préstamo no encontrado' },
      })
    })

    it('returns 400 { code: BAD_REQUEST } when status is missing in body', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .patch('/api/loans/loan-1/status')
        .set('Authorization', 'Bearer user-1')
        .set('Origin', 'http://localhost:5173')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
      expect(res.body.error.message).toBe('Missing status')
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

  describe('GET /api/loans', () => {
    it('returns 401 without auth', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .get('/api/loans?type=pedidos')

      expect(res.status).toBe(401)
    })

    it('returns 400 when type is missing', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .get('/api/loans')
        .set('Authorization', 'Bearer user-1')

      expect(res.status).toBe(400)
    })

    it('returns 400 when type is invalid', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .get('/api/loans?type=invalid')
        .set('Authorization', 'Bearer user-1')

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('BAD_REQUEST')
      expect(res.body.error.message).toBe('Missing or invalid type (pedidos/recibidos)')
    })

    it('returns loans when type=pedidos (user is borrower)', async () => {
      const { app, mockRepo } = createMockApp()

      const mockLoans = [
        {
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
        },
      ]
      mockRepo.findAllByBorrower = vi.fn().mockResolvedValueOnce(mockLoans)

      const res = await request(app)
        .get('/api/loans?type=pedidos')
        .set('Authorization', 'Bearer user-2')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].id).toBe('loan-1')
      expect(mockRepo.findAllByBorrower).toHaveBeenCalledWith('user-2')
    })

    it('returns loans when type=recibidos (user is owner)', async () => {
      const { app, mockRepo } = createMockApp()

      const mockLoans = [
        {
          id: 'loan-2',
          tool_id: 'tool-1',
          borrower_id: 'user-3',
          owner_id: 'user-1',
          start_date: '2026-10-15',
          end_date: '2026-10-25',
          status: 'aceptado',
          note: 'Lo necesito',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]
      mockRepo.findAllByOwner = vi.fn().mockResolvedValueOnce(mockLoans)

      const res = await request(app)
        .get('/api/loans?type=recibidos')
        .set('Authorization', 'Bearer user-1')

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].id).toBe('loan-2')
      expect(mockRepo.findAllByOwner).toHaveBeenCalledWith('user-1')
    })

    it('returns empty array when no loans found', async () => {
      const { app, mockRepo } = createMockApp()

      mockRepo.findAllByBorrower = vi.fn().mockResolvedValueOnce([])

      const res = await request(app)
        .get('/api/loans?type=pedidos')
        .set('Authorization', 'Bearer user-99')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })
  })

})
