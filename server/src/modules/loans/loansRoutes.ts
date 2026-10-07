import type { Router } from 'express'
import express from 'express'
import type { LoanService } from './loanService.js'
import type { AuthRequest } from '../middleware/auth.js'

type QueryFn = (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>

export function loansRoutes(
  service: LoanService,
  query: QueryFn,
): Router {
  const router = express.Router()

  // POST /api/tools/:id/loans — create a loan for a tool
  router.post('/tools/:id/loans', async (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
      return
    }

    const toolId = req.params.id
    if (typeof toolId !== 'string') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid tool ID' } })
      return
    }

    const { startDate, endDate, note } = req.body

    if (!startDate || !endDate) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing start or end date' } })
      return
    }

    // Look up tool owner
    const toolResult = await query(
      `SELECT owner_id FROM tools WHERE id = $1 AND deleted_at IS NULL`,
      [toolId],
    )
    const rows = toolResult.rows as Array<{ owner_id: string }>
    if (!rows[0]) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tool not found' } })
      return
    }

    try {
      const loan = await service.create({
        toolId,
        userId,
        ownerId: rows[0].owner_id,
        startDate,
        endDate,
        note: note ?? null,
      })
      res.status(201).json(loan)
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes('solapada')) {
          res.status(409).json({ error: { code: 'CONFLICT', message: err.message } })
          return
        }
        res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } })
        return
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create loan' } })
    }
  })

  // GET /api/loans/:id — get loan detail
  router.get('/loans/:id', async (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
      return
    }

    const loanId = req.params.id
    if (typeof loanId !== 'string') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid loan ID' } })
      return
    }

    try {
      const loan = await service.getDetail(loanId, userId)
      res.status(200).json(loan)
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes('no encontrado') || err.message.includes('particip')) {
          res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } })
          return
        }
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get loan' } })
        return
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', 'message': 'Failed to get loan' } })
    }
  })

  // PATCH /api/loans/:id/status — transition loan status
  router.patch('/loans/:id/status', async (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
      return
    }

    const loanId = req.params.id
    if (typeof loanId !== 'string') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid loan ID' } })
      return
    }

    const { status: newStatus } = req.body

    if (!newStatus) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing status' } })
      return
    }

    try {
      const loan = await service.transition(loanId, newStatus, userId)
      res.status(200).json(loan)
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes('Transición inválida')) {
          res.status(409).json({ error: { code: 'CONFLICT', message: err.message } })
          return
        }
        if (err.message.includes('no encontrado') || err.message.includes('particip')) {
          res.status(404).json({ error: { code: 'NOT_FOUND', message: err.message } })
          return
        }
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to transition loan' } })
        return
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to transition loan' } })
    }
  })

  return router
}
