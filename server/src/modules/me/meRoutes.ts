import type { Router } from 'express'
import express from 'express'
import type { ToolRepository } from '../tools/toolRepo.js'
import type { LoanRepository } from '../loans/loanRepo.js'
import type { AuthRequest } from '../middleware/auth.js'

export function meRoutes(
  toolRepo: ToolRepository,
  loanRepo: LoanRepository,
): Router {
  const router = express.Router()

  // GET /api/me/tools — user's tools + received loans + made loans
  router.get('/me/tools', async (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
      return
    }

    try {
      const tools = await toolRepo.findByOwner(userId)

      const receivedLoans = await loanRepo.findAllByOwner(userId)
      const madeLoans = await loanRepo.findAllByBorrower(userId)

      res.status(200).json({
        tools,
        receivedLoans,
        madeLoans,
      })
    } catch {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get user data' } })
    }
  })

  // GET /api/me/history — terminated loans
  router.get('/me/history', async (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
      return
    }

    try {
      const history = await loanRepo.findTerminatedByUserId(userId)
      res.status(200).json(history)
    } catch {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get history' } })
    }
  })

  return router
}
