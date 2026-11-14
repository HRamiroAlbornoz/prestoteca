import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import type { UserRepository } from '../auth/userRepo.js'
import { passwordFingerprint } from '../auth/sessionToken.js'
import { sendError, sendErrorCode } from '../errors/AppError.js'

export interface AuthRequest extends Request {
  userId?: string
}

// Checks the session on every protected request: the token must be valid AND still belong to an
// active account whose password has not changed since the token was issued.
export function createAuthMiddleware(
  userRepo: Pick<UserRepository, 'findActiveById'>,
  jwtSecret: string,
) {
  return async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    const cookies = req.cookies || {}
    const token = cookies.token || req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Authentication required')
      return
    }

    let decoded: { id?: unknown; pwf?: unknown }
    try {
      decoded = jwt.verify(token, jwtSecret) as { id?: unknown; pwf?: unknown }
    } catch {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Invalid or expired token')
      return
    }

    // Tokens issued before this check existed have no fingerprint: they are no longer accepted
    if (typeof decoded.id !== 'string' || typeof decoded.pwf !== 'string') {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Invalid or expired token')
      return
    }

    try {
      const user = await userRepo.findActiveById(decoded.id)
      // No user: the account was deleted. Another fingerprint: the password changed.
      if (!user || passwordFingerprint(user.password_hash) !== decoded.pwf) {
        sendErrorCode(res, 'SESSION_REQUIRED', 'Invalid or expired token')
        return
      }
    } catch (err: unknown) {
      // If the database fails, the request never goes through
      sendError(res, err, 'Failed to check session')
      return
    }

    req.userId = decoded.id
    next()
  }
}
