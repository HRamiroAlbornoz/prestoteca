import type express from 'express'

// Every error code the API can answer with, in one place.
export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

// An error we expect and know how to explain to the client (bad input, missing resource, ...).
// Its message is safe to show. Any other error is a bug or an outage: the client only gets
// a generic message, and the detail goes to the log.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, ERROR_CODES.BAD_REQUEST, message)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(401, ERROR_CODES.UNAUTHORIZED, message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(403, ERROR_CODES.FORBIDDEN, message)
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, ERROR_CODES.NOT_FOUND, message)
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, ERROR_CODES.CONFLICT, message)
  }
}

// Answers a caught error. Expected errors keep their status and message; anything else
// becomes a 500 with `fallbackMessage`, and the original error is logged (never sent).
// The request body is never logged: it can carry passwords.
export function sendError(res: express.Response, err: unknown, fallbackMessage: string): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } })
    return
  }

  console.error('[error] unexpected error:', err)
  res.status(500).json({ error: { code: ERROR_CODES.INTERNAL_ERROR, message: fallbackMessage } })
}

// Errors raised by express.json() when it reads the body
function bodyParserErrorType(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined
  const type = (err as { type?: unknown }).type
  return typeof type === 'string' ? type : undefined
}

// Last middleware of the app: catches whatever a route did not handle (a malformed JSON
// body, an error thrown outside a try/catch) and answers in the same JSON format.
// Express recognizes it as an error handler because it takes four arguments.
export function errorHandler(
  err: unknown,
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void {
  // If the response already started, Express has to close the connection itself
  if (res.headersSent) {
    next(err)
    return
  }

  const type = bodyParserErrorType(err)
  if (type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: ERROR_CODES.BAD_REQUEST, message: 'Malformed JSON body' } })
    return
  }
  if (type === 'entity.too.large') {
    res.status(413).json({ error: { code: ERROR_CODES.PAYLOAD_TOO_LARGE, message: 'Request body too large' } })
    return
  }

  sendError(res, err, 'Internal server error')
}
