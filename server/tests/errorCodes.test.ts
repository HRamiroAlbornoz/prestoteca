import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type express from 'express'
import { ERROR_CODES, type ServerErrorCode } from '../src/modules/errors/errorCodes.js'
import { AppError, apiNotFound, errorHandler, sendError, sendErrorCode } from '../src/modules/errors/AppError.js'

// The catalog the client relies on: every code below must exist with exactly this status
// (plan error-codes §3.1). The status of each situation is the same as before this change.
const EXPECTED_STATUS: Record<string, number> = {
  // Situations from the spec (one row, one code)
  REGISTER_MISSING_FIELDS: 400,
  REGISTER_NAME_LENGTH: 400,
  REGISTER_PASSWORD_LENGTH: 400,
  REGISTER_EMAIL_TOO_LONG: 400,
  EMAIL_TAKEN: 409,
  LOGIN_MISSING_FIELDS: 400,
  INVALID_CREDENTIALS: 401,
  SESSION_REQUIRED: 401,
  PASSWORD_CHANGE_MISSING_FIELDS: 400,
  CURRENT_PASSWORD_INCORRECT: 401,
  NEW_PASSWORD_LENGTH: 400,
  NEW_PASSWORD_BLANK: 400,
  ACCOUNT_NOT_FOUND: 404,
  ACCOUNT_HAS_ACTIVE_LOANS: 409,
  TOOL_MISSING_FIELDS: 400,
  TOOL_NAME_LENGTH: 400,
  TOOL_DESCRIPTION_TOO_LONG: 400,
  TOOL_NOT_FOUND: 404,
  TOOL_NOT_OWNER: 403,
  TOOL_HAS_ACTIVE_LOANS: 409,
  TOOL_PAUSED: 409,
  LOAN_DATES_MISSING: 400,
  LOAN_START_IN_PAST: 400,
  LOAN_END_BEFORE_START: 400,
  LOAN_NOTE_TOO_LONG: 400,
  LOAN_OWN_TOOL: 400,
  LOAN_DATES_OVERLAP: 409,
  LOAN_TRANSITION_INVALID: 409,
  LOAN_TRANSITION_WRONG_ROLE: 403,
  LOAN_NOT_FOUND: 404,
  SEARCH_QUERY_TOO_LONG: 400,
  RATE_LIMITED: 429,
  // Situations only a bug or a broken client can cause
  BAD_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
  ORIGIN_NOT_ALLOWED: 403,
  TOOL_EDIT_EMPTY: 404,
  API_ROUTE_NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
}

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

describe('error catalog (errorCodes.ts)', () => {
  it.each(Object.entries(EXPECTED_STATUS))('has %s with status %i', (code, status) => {
    const entry = (ERROR_CODES as Record<string, { status: number }>)[code]

    expect(entry).toBeDefined()
    expect(entry.status).toBe(status)
  })

  it('gives every code exactly one numeric HTTP error status', () => {
    for (const [code, entry] of Object.entries(ERROR_CODES)) {
      expect(Object.keys(entry), code).toEqual(['status'])
      expect(Number.isInteger(entry.status), code).toBe(true)
      expect(entry.status, code).toBeGreaterThanOrEqual(400)
      expect(entry.status, code).toBeLessThan(600)
    }
  })

  it('imports nothing, so the client can read its types without pulling in server code', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../src/modules/errors/errorCodes.ts'),
      'utf-8',
    )

    expect(source).not.toMatch(/^\s*import\s/m) // import x from '...'
    expect(source).not.toMatch(/\bimport\(/) // await import('...')
    expect(source).not.toMatch(/\bfrom\s+['"]/) // export { x } from '...'
    expect(source).not.toMatch(/\brequire\(/)
  })
})

describe('AppError(code, devMessage)', () => {
  it.each(Object.keys(EXPECTED_STATUS))('derives the status of %s from the catalog', (code) => {
    const err = new AppError(code as ServerErrorCode, 'dev detail')

    expect(err.status).toBe(EXPECTED_STATUS[code])
    expect(err.code).toBe(code)
    expect(err.message).toBe('dev detail')
  })

  it('is a real Error, so it can be thrown and caught', () => {
    const err = new AppError('TOOL_NOT_OWNER', 'You can only edit your own tools')

    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AppError)
  })
})

describe('sendErrorCode', () => {
  it('answers with the status of the code and the { error: { code, message } } body', () => {
    const res = fakeResponse()

    sendErrorCode(res as unknown as express.Response, 'RATE_LIMITED', 'Too many requests')

    expect(res.statusCode).toBe(429)
    expect(res.body).toEqual({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } })
  })

  it.each(Object.keys(EXPECTED_STATUS))('answers %s with the status from the catalog', (code) => {
    const res = fakeResponse()

    sendErrorCode(res as unknown as express.Response, code as ServerErrorCode, 'dev detail')

    expect(res.statusCode).toBe(EXPECTED_STATUS[code])
    expect(res.body).toEqual({ error: { code, message: 'dev detail' } })
  })
})

describe('sendError with the new AppError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('answers an AppError with the status of its code and its dev message', () => {
    const res = fakeResponse()

    sendError(res as unknown as express.Response, new AppError('LOAN_DATES_OVERLAP', 'Dates overlap'), 'Fallback')

    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: { code: 'LOAN_DATES_OVERLAP', message: 'Dates overlap' } })
  })

  it('answers anything else with INTERNAL_ERROR 500 and keeps the detail in the server log only', () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = fakeResponse()
    const dbError = new Error('connect ECONNREFUSED 10.0.0.5:5432')

    sendError(res as unknown as express.Response, dbError, 'Failed to list tools')

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list tools' } })
    expect(logSpy).toHaveBeenCalledWith(expect.any(String), dbError)
  })
})

describe('errorHandler when the response already started', () => {
  it('hands the error to Express and writes nothing (a second write would throw)', () => {
    const res = { ...fakeResponse(), headersSent: true }
    const statusSpy = vi.spyOn(res, 'status')
    const next = vi.fn()
    const err = new AppError('TOOL_NOT_FOUND', 'Tool not found')

    errorHandler(err, {} as express.Request, res as unknown as express.Response, next)

    expect(next).toHaveBeenCalledWith(err)
    expect(statusSpy).not.toHaveBeenCalled()
  })
})

describe('apiNotFound', () => {
  it('answers an unknown /api route with 404 API_ROUTE_NOT_FOUND in the catalog format', () => {
    const res = fakeResponse()
    const req = { method: 'GET', originalUrl: '/api/does-not-exist' }

    apiNotFound(req as unknown as express.Request, res as unknown as express.Response)

    expect(res.statusCode).toBe(404)
    expect(res.body).toEqual({
      error: { code: 'API_ROUTE_NOT_FOUND', message: expect.any(String) },
    })
  })
})
