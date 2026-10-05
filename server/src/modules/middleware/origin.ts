import type { Request, Response, NextFunction } from 'express'

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
    res.status(403).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid origin',
      },
    })
    return
  }

  next()
}
