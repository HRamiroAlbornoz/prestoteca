import type express from 'express'
import { ERROR_CODES, type ServerErrorCode } from './errorCodes.js'

// An error we expect and know how to explain (bad input, missing resource, ...).
// It carries a code from the catalog; the HTTP status comes from that code, never by hand.
// `message` is for developers (English) and is never shown to the user: the client
// shows its own text for the code. Any other error is a bug or an outage: the client only
// gets INTERNAL_ERROR, and the detail goes to the log.
export class AppError extends Error {
  readonly status: number

  constructor(
    readonly code: ServerErrorCode,
    devMessage: string,
  ) {
    super(devMessage)
    this.name = new.target.name
    this.status = ERROR_CODES[code].status
  }
}

// Old generic errors, kept only until every route sends a specific code (task T009
// removes them). Each one is an AppError with the generic code it always had.
export class ValidationError extends AppError {
  constructor(message: string) {
    super('BAD_REQUEST', message)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super('UNAUTHORIZED', message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super('FORBIDDEN', message)
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super('NOT_FOUND', message)
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message)
  }
}

// The one place that writes an error body: { error: { code, message } }, with the status
// of the code. Middlewares and route validations call it instead of res.status().json().
export function sendErrorCode(res: express.Response, code: ServerErrorCode, devMessage: string): void {
  res.status(ERROR_CODES[code].status).json({ error: { code, message: devMessage } })
}

// Answers a caught error. An AppError keeps its code and message; anything else
// becomes INTERNAL_ERROR with `fallbackDevMessage`, and the original error is logged
// (never sent). The request body is never logged: it can carry passwords.
export function sendError(res: express.Response, err: unknown, fallbackDevMessage: string): void {
  if (err instanceof AppError) {
    sendErrorCode(res, err.code, err.message)
    return
  }

  console.error('[error] unexpected error:', err)
  sendErrorCode(res, 'INTERNAL_ERROR', fallbackDevMessage)
}

// For an /api/... route that does not exist: answers in the catalog format instead of
// Express's HTML 404 page. Mounted on /api after all the API routes.
export function apiNotFound(_req: express.Request, res: express.Response): void {
  sendErrorCode(res, 'API_ROUTE_NOT_FOUND', 'API route not found')
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
    sendErrorCode(res, 'BAD_REQUEST', 'Malformed JSON body')
    return
  }
  if (type === 'entity.too.large') {
    sendErrorCode(res, 'PAYLOAD_TOO_LARGE', 'Request body too large')
    return
  }

  sendError(res, err, 'Internal server error')
}
