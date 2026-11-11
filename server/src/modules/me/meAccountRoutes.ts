import { randomBytes } from 'node:crypto'
import type { Router } from 'express'
import express from 'express'
import bcrypt from 'bcrypt'
import type { Pool } from 'pg'
import type { UserRepository } from '../auth/userRepo.js'
import type { AuthRequest } from '../middleware/auth.js'
import { sendError, sendErrorCode } from '../errors/AppError.js'
import { deleteAccount } from './accountDeletion.js'

const SALT_ROUNDS = 12

export function meAccountRoutes(
  userRepo: UserRepository,
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
    if (!userId) {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Not authenticated')
      return
    }

    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
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
      await userRepo.updatePassword(userId, passwordHash)

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
      await deleteAccount(pool, userId, replacementHash)

      // The session cookie belongs to an account that no longer exists
      res.clearCookie('token')
      res.status(204).send()
    } catch (err: unknown) {
      sendError(res, err, 'Failed to delete account')
    }
  })

  return router
}
