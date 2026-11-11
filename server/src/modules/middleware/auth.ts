import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { sendErrorCode } from '../errors/AppError.js'

const JWT_SECRET = process.env.JWT_SECRET || ''

export interface AuthRequest extends Request {
  userId?: string
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const cookies = req.cookies || {}
  const token = cookies.token || req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    sendErrorCode(res, 'SESSION_REQUIRED', 'Authentication required')
    return
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string }
    req.userId = decoded.id
    next()
  } catch {
    sendErrorCode(res, 'SESSION_REQUIRED', 'Invalid or expired token')
  }
}
