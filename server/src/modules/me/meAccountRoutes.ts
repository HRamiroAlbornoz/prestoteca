import type { Router } from 'express'
import express from 'express'
import bcrypt from 'bcrypt'
import type { UserRepository } from '../auth/userRepo.js'
import type { ToolRepository } from '../tools/toolRepo.js'
import type { AuthRequest } from '../middleware/auth.js'

const SALT_ROUNDS = 12

export function meAccountRoutes(
  userRepo: UserRepository,
  toolRepo: ToolRepository,
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
    } catch {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to change password' } })
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
      // Soft delete all user's tools
      const tools = await toolRepo.findByOwner(userId)
      for (const tool of tools) {
        await toolRepo.softDelete(tool.id)
      }

      // Delete user account
      await userRepo.delete(userId)

      res.status(204).send()
    } catch {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete account' } })
    }
  })

  return router
}
