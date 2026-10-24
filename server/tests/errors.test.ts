import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import type { Pool } from 'pg'
import { createApp } from '../src/index.js'
import { resetRateLimiter } from '../src/modules/middleware/rateLimit.js'
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  sendError,
} from '../src/modules/errors/AppError.js'
import { UserRepository } from '../src/modules/auth/userRepo.js'
import { toolsRoutes } from '../src/modules/tools/toolsRoutes.js'
import type { ToolService } from '../src/modules/tools/toolService.js'
import type { SearchService } from '../src/modules/search/searchService.js'

const ALLOWED_ORIGIN = 'http://localhost:5173'

describe('sendError', () => {
  // Minimal stand-in for an Express response: records what the handler sends
  function fakeResponse() {
    const res = {
      statusCode: 0,
      body: undefined as unknown,
      status(code: number) {
        res.statusCode = code
        return res
      },
      json(payload: unknown) {
        res.body = payload
        return res
      },
    }
    return res
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    [new ValidationError('Invalid category'), 400, 'BAD_REQUEST'],
    [new ForbiddenError('You can only edit your own tools'), 403, 'FORBIDDEN'],
    [new NotFoundError('Tool not found'), 404, 'NOT_FOUND'],
    [new ConflictError('Cannot delete tool with active loans'), 409, 'CONFLICT'],
  ])('answers an expected %s with its own status, code and message', (err, status, code) => {
    const res = fakeResponse()

    sendError(res as unknown as express.Response, err as AppError, 'Fallback')

    expect(res.statusCode).toBe(status)
    expect(res.body).toEqual({ error: { code, message: (err as AppError).message } })
  })

  it('answers an unexpected error with a generic 500 and keeps the detail in the log only', () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = fakeResponse()
    const dbError = new Error('relation "tools" does not exist')

    sendError(res as unknown as express.Response, dbError, 'Failed to list tools')

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list tools' } })
    expect(JSON.stringify(res.body)).not.toContain('relation')
    expect(logSpy).toHaveBeenCalledWith(expect.any(String), dbError)
  })
})

describe('error responses of the real app', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.PORT = '3001'
    // Unreachable database: every query fails, like the staging DB without tables did
    process.env.DATABASE_URL = 'postgresql://invalid:invalid@localhost:9999/nonexistent'
    process.env.JWT_SECRET = 'a'.repeat(32)
    process.env.NODE_ENV = 'test'
    resetRateLimiter()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const key of Object.keys(process.env)) {
      delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  })

  it('returns a generic 500 when the database fails, without its error text', async () => {
    const app = await createApp()

    const res = await request(app).get('/api/tools?page=1')

    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|9999|connect/i)
  })

  it('returns a generic JSON 400 for a malformed JSON body', async () => {
    const app = await createApp()

    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{"email": ')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: { code: 'BAD_REQUEST', message: 'Malformed JSON body' } })
  })

  it('returns a JSON 413 for a body over 10 kb', async () => {
    const app = await createApp()

    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ email: 'a@example.com', password: 'x'.repeat(11 * 1024) })

    expect(res.status).toBe(413)
    expect(res.body).toEqual({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } })
  })
})

describe('tools routes with typed errors', () => {
  function appWith(service: Partial<ToolService>) {
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      ;(req as express.Request & { userId?: string }).userId = 'user-1'
      next()
    })
    app.use('/api/tools', toolsRoutes(service as ToolService, {} as SearchService))
    return app
  }

  it('returns 404 when editing a tool that does not exist', async () => {
    const app = appWith({
      edit: vi.fn().mockRejectedValue(new NotFoundError('Tool not found')),
    })

    const res = await request(app).patch('/api/tools/missing').send({ name: 'Taladro' })

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Tool not found' } })
  })
})

describe('UserRepository.create', () => {
  function poolWhoseInsertFails(error: unknown) {
    const client = {
      query: vi.fn().mockRejectedValue(error),
      release: vi.fn(),
    }
    return { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool
  }

  it('turns a duplicate-email violation from PostgreSQL into a 409 ConflictError', async () => {
    // 23505 = unique_violation: what PostgreSQL really raises for a repeated email
    const repo = new UserRepository(poolWhoseInsertFails(Object.assign(new Error('duplicate key'), { code: '23505' })))

    const attempt = repo.create({ name: 'Ana', email: 'ana@example.com', password_hash: 'x', neighborhood: 'Centro' })

    await expect(attempt).rejects.toBeInstanceOf(ConflictError)
    await expect(attempt).rejects.toThrow('Email already exists')
  })

  it('lets any other database error through unchanged', async () => {
    const otherError = Object.assign(new Error('connection lost'), { code: '08006' })
    const repo = new UserRepository(poolWhoseInsertFails(otherError))

    await expect(
      repo.create({ name: 'Ana', email: 'ana@example.com', password_hash: 'x', neighborhood: 'Centro' }),
    ).rejects.toBe(otherError)
  })
})
