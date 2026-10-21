import { randomBytes } from 'node:crypto'
import type { Router } from 'express'
import express from 'express'
import bcrypt from 'bcrypt'
import type { Pool } from 'pg'
import type { UserRepository } from '../auth/userRepo.js'
import type { AuthRequest } from '../middleware/auth.js'
import { sendError } from '../errors/AppError.js'
import { deleteAccount } from './accountDeletion.js'

const SALT_ROUNDS = 12

export function meAccountRoutes(
  userRepo: UserRepository,
  pool: Pick<Pool, 'connect'>,
): Router {
  const router = express.Router()

  // PATCH /api/me/password — change password
  router.patch('/me/password', async (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
      return
    }

    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing current or new password' } })
      return
    }

    // Validate new password
    if (newPassword.length < 8 || newPassword.length > 72) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Password must be between 8 and 72 characters' } })
      return
    }

    if (/^\s+$/.test(newPassword)) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Password cannot be only spaces' } })
      return
    }

    try {
      const user = await userRepo.findById(userId)
      if (!user) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } })
        return
      }

      const valid = await bcrypt.compare(currentPassword, user.password_hash)
      if (!valid) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Current password is incorrect' } })
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
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
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
