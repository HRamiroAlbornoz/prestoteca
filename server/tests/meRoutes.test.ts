import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import type { ToolRepository } from '../src/modules/tools/toolRepo.js'
import type { LoanRepository } from '../src/modules/loans/loanRepo.js'
import type { Pool } from 'pg'
import type { UserRepository } from '../src/modules/auth/userRepo.js'
import { meRoutes } from '../src/modules/me/meRoutes.js'
import { meAccountRoutes } from '../src/modules/me/meAccountRoutes.js'

function createMockApp() {
  const mockToolRepo: Partial<ToolRepository> = {
    findByOwner: vi.fn(async () => []),
  }

  const mockLoanRepo: Partial<LoanRepository> = {
    findAllByOwner: vi.fn(async () => []),
    findAllByBorrower: vi.fn(async () => []),
    findTerminatedByUserId: vi.fn(async () => []),
  }

  const app = express()
  app.use(express.json())

  // Mount meRoutes WITHOUT any auth middleware so req.userId is missing
  app.use('/api', meRoutes(mockToolRepo as ToolRepository, mockLoanRepo as LoanRepository))

  return { app }
}

describe('meRoutes (no auth)', () => {
  it('GET /api/me/tools returns 401 SESSION_REQUIRED without userId', async () => {
    const { app } = createMockApp()

    const res = await request(app).get('/api/me/tools')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('SESSION_REQUIRED')
    expect(res.body.error.message).toBe('Not authenticated')
  })

  it('GET /api/me/history returns 401 SESSION_REQUIRED without userId', async () => {
    const { app } = createMockApp()

    const res = await request(app).get('/api/me/history')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('SESSION_REQUIRED')
    expect(res.body.error.message).toBe('Not authenticated')
  })
})

describe('meAccountRoutes (no auth)', () => {
  // Mounted without any auth middleware, so each route's own "no userId" guard answers
  function appWithoutAuth() {
    const app = express()
    app.use(express.json())
    app.use('/api', meAccountRoutes({} as UserRepository, {} as Pool))
    return app
  }

  it.each([
    ['GET', '/api/me'],
    ['PATCH', '/api/me/password'],
    ['DELETE', '/api/me/account'],
  ])('%s %s returns 401 SESSION_REQUIRED without userId', async (method, path) => {
    const agent = request(appWithoutAuth())
    const res = method === 'GET' ? await agent.get(path) : method === 'PATCH' ? await agent.patch(path).send({}) : await agent.delete(path)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: { code: 'SESSION_REQUIRED', message: 'Not authenticated' } })
  })
})
