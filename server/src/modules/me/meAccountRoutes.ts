import { randomBytes } from 'node:crypto'
import type { Router } from 'express'
import express from 'express'
import bcrypt from 'bcrypt'
import type { Pool } from 'pg'
import type { UserRepository } from '../auth/userRepo.js'
import type { SessionRepository } from '../auth/sessionRepo.js'
import type { AuthRequest } from '../middleware/auth.js'
import { AppError, sendError, sendErrorCode } from '../errors/AppError.js'
import { deleteAccount } from './accountDeletion.js'
import { clearSessionCookie } from '../auth/sessionToken.js'
import { withTransaction } from '../db/transaction.js'

const SALT_ROUNDS = 12

export function meAccountRoutes(
  userRepo: UserRepository,
  sessionRepo: Pick<SessionRepository, 'deleteOthers' | 'deleteAllForUser'>,
  pool: Pick<Pool, 'connect'>,
): Router {
  const router = express.Router()

  // GET /api/me — who is logged in. The session cookie is httpOnly, so the client cannot read it:
  // this is the only way it learns whether there is a session. Answers just id and name.
  router.get('/me', async (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Not authenticated')
      return
    }

    try {
      const user = await userRepo.findActiveById(userId)
      if (!user) {
        // A valid token for an account deleted after it was issued
        sendErrorCode(res, 'SESSION_REQUIRED', 'Not authenticated')
        return
      }
      res.status(200).json({ id: user.id, name: user.name })
    } catch (err: unknown) {
      sendError(res, err, 'Failed to get current user')
    }
  })

  // PATCH /api/me/password — change password
  router.patch('/me/password', async (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    const sessionTokenHash = req.sessionTokenHash
    // Without the hash of this session we cannot tell which session to keep: refuse before anything
    if (!userId || !sessionTokenHash) {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Not authenticated')
      return
    }

    // Express 5 leaves req.body undefined when there is no JSON body
    const { currentPassword, newPassword } = req.body ?? {}

    // typeof guard: non-string values (number, array, object) are treated as missing.
    // This route does not trim the passwords; the guard only checks their type.
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
      sendErrorCode(res, 'PASSWORD_CHANGE_MISSING_FIELDS', 'Missing current or new password')
      return
    }

    // Validate new password
    if (newPassword.length < 8 || newPassword.length > 72) {
      sendErrorCode(res, 'NEW_PASSWORD_LENGTH', 'Password must be between 8 and 72 characters')
      return
    }

    if (/^\s+$/.test(newPassword)) {
      sendErrorCode(res, 'NEW_PASSWORD_BLANK', 'Password cannot be only spaces')
      return
    }

    try {
      const user = await userRepo.findActiveById(userId)
      if (!user) {
        sendErrorCode(res, 'ACCOUNT_NOT_FOUND', 'User not found')
        return
      }

      const valid = await bcrypt.compare(currentPassword, user.password_hash)
      if (!valid) {
        sendErrorCode(res, 'CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect')
        return
      }

      const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)

      // The new password and the closing of every OTHER session happen together, or not at all
      await withTransaction(pool, async (client) => {
        const changed = await userRepo.updatePassword(userId, passwordHash, client)
        if (!changed) {
          // The account was deleted while this request was running
          throw new AppError('ACCOUNT_NOT_FOUND', 'User not found')
        }
        await sessionRepo.deleteOthers(userId, sessionTokenHash, client)
      })

      // THIS session stays exactly as it is (same cookie value, same mode): no cookie from here
      res.status(204).send()
    } catch (err: unknown) {
      sendError(res, err, 'Failed to change password')
    }
  })

  // DELETE /api/me/account — delete account
  router.delete('/me/account', async (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Not authenticated')
      return
    }

    try {
      // Hash a random value before opening the transaction: bcrypt takes ~200 ms,
      // and the user row stays locked for as long as the transaction is open
      const replacementHash = await bcrypt.hash(randomBytes(32).toString('hex'), SALT_ROUNDS)
      await deleteAccount(pool, sessionRepo, userId, replacementHash)

      // The session cookie belongs to an account that no longer exists
      clearSessionCookie(res)
      res.status(204).send()
    } catch (err: unknown) {
      sendError(res, err, 'Failed to delete account')
    }
  })

  // DELETE /api/me/other-sessions — "Cerrar sesión en los otros dispositivos": every session of this
  // account except the one making the request. 204 also when there was none to close.
  router.delete('/me/other-sessions', async (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    const sessionTokenHash = req.sessionTokenHash
    if (!userId || !sessionTokenHash) {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Not authenticated')
      return
    }

    try {
      await sessionRepo.deleteOthers(userId, sessionTokenHash)
      res.status(204).send()
    } catch (err: unknown) {
      sendError(res, err, 'Failed to close other sessions')
    }
  })

  return router
}
