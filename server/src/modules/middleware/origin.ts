import type { Request, Response, NextFunction } from 'express'
import { sendErrorCode } from '../errors/AppError.js'

const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',')

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'DELETE'])

export function originChecker(req: Request, res: Response, next: NextFunction): void {
  // Only check mutating methods
  if (!MUTATING_METHODS.has(req.method)) {
    next()
    return
  }

  const origin = req.headers.origin

  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    sendErrorCode(res, 'ORIGIN_NOT_ALLOWED', 'Invalid origin')
    return
  }

  next()
}
