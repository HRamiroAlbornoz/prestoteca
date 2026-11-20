import type { Request, Response, NextFunction } from 'express'
import type { SessionRepository } from '../auth/sessionRepo.js'
import {
  clearSessionCookie,
  hashSessionToken,
  idleCutoffs,
  readSessionCookie,
  setSessionCookie,
} from '../auth/sessionToken.js'
import { sendError, sendErrorCode } from '../errors/AppError.js'

export interface AuthRequest extends Request {
  userId?: string
  // The hash of the session making this request. Only this middleware sets it; the routes that
  // close "the other sessions" need it to know which one to keep.
  sessionTokenHash?: string
}

// Checks the session on every protected request. The browser sends a random value in the `token`
// cookie; the database must have a row for its hash that is still in use and whose account exists.
// Unknown, expired and revoked sessions all get the same answer (the response never says which).
export function createAuthMiddleware(sessionRepo: Pick<SessionRepository, 'touchActive'>) {
  return async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    const cookie = readSessionCookie(req)

    if (cookie.kind === 'none') {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Authentication required')
      return
    }

    // An old JWT or anything we could never have issued: no need to ask the database
    if (cookie.kind === 'malformed') {
      clearSessionCookie(res)
      sendErrorCode(res, 'SESSION_REQUIRED', 'Authentication required')
      return
    }

    const tokenHash = hashSessionToken(cookie.token)
    const now = new Date()

    let session: Awaited<ReturnType<SessionRepository['touchActive']>>
    try {
      // Checks AND renews the session in one statement
      session = await sessionRepo.touchActive(tokenHash, now, idleCutoffs(now))
    } catch (err: unknown) {
      // If the database fails, the request never goes through, and the cookie is left alone:
      // a database outage must not sign everybody out
      sendError(res, err, 'Failed to check session')
      return
    }

    if (!session) {
      clearSessionCookie(res)
      sendErrorCode(res, 'SESSION_REQUIRED', 'Authentication required')
      return
    }

    // A "Recordarme" session gets 7 more days in the browser on every use
    if (session.remember) {
      setSessionCookie(res, cookie.token, true)
    }

    req.userId = session.userId
    req.sessionTokenHash = tokenHash
    next()
  }
}
