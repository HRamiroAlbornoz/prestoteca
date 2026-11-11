import type { Router } from 'express'
import express from 'express'
import type { LoanService } from './loanService.js'
import type { AuthRequest } from '../middleware/auth.js'
import { sendError, sendErrorCode, AppError } from '../errors/AppError.js'
import { todayInAppTimeZone } from './appDate.js'

type QueryFn = (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>

export function loansRoutes(
  service: LoanService,
  query: QueryFn,
  // Tests pass a fixed "today"; the app uses the real date in the app time zone
  getToday: () => string = todayInAppTimeZone,
): Router {
  const router = express.Router()

  // POST /api/tools/:id/loans — create a loan for a tool
  router.post('/tools/:id/loans', async (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Not authenticated')
      return
    }

    const toolId = req.params.id
    if (typeof toolId !== 'string') {
      sendErrorCode(res, 'BAD_REQUEST', 'Invalid tool ID')
      return
    }

    const { startDate, endDate, note } = req.body

    // Trim whitespace before validation
    const trimmedStartDate = startDate?.trim()
    const trimmedEndDate = endDate?.trim()
    const trimmedNote = note?.trim()

    if (!trimmedStartDate || !trimmedEndDate) {
      sendErrorCode(res, 'LOAN_DATES_MISSING', 'Missing start or end date')
      return
    }

    // Note max 300 characters (RF-08)
    if (trimmedNote && trimmedNote.length > 300) {
      sendErrorCode(res, 'LOAN_NOTE_TOO_LONG', 'The note must be at most 300 characters')
      return
    }

    // Date validation: end >= start and start >= today in the app time zone (RF-08)
    const todayStr = getToday()
    if (trimmedStartDate < todayStr) {
      sendErrorCode(res, 'LOAN_START_IN_PAST', 'The start date cannot be in the past')
      return
    }
    if (trimmedEndDate < trimmedStartDate) {
      sendErrorCode(res, 'LOAN_END_BEFORE_START', 'The end date cannot be before the start date')
      return
    }

    try {
      // Look up the tool's owner and whether it is paused
      const toolResult = await query(
        `SELECT owner_id, is_paused FROM tools WHERE id = $1 AND deleted_at IS NULL`,
        [toolId],
      )
      const rows = toolResult.rows as Array<{ owner_id: string; is_paused: boolean }>
      if (!rows[0]) {
        sendErrorCode(res, 'TOOL_NOT_FOUND', 'Tool not found')
        return
      }

      // A paused tool accepts no new requests (spec: 409). It still exists, so this is not a 404.
      if (rows[0].is_paused) {
        throw new AppError('TOOL_PAUSED', 'La herramienta está pausada y no acepta pedidos')
      }

      const loan = await service.create({
        toolId,
        userId,
        ownerId: rows[0].owner_id,
        startDate: trimmedStartDate,
        endDate: trimmedEndDate,
        note: trimmedNote || null,
      })
      res.status(201).json(loan)
    } catch (err: unknown) {
      sendError(res, err, 'Failed to create loan')
    }
  })

  // GET /api/loans/:id — get loan detail
  router.get('/loans/:id', async (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Not authenticated')
      return
    }

    const loanId = req.params.id
    if (typeof loanId !== 'string') {
      sendErrorCode(res, 'BAD_REQUEST', 'Invalid loan ID')
      return
    }

    try {
      const loan = await service.getDetail(loanId, userId)
      res.status(200).json(loan)
    } catch (err: unknown) {
      sendError(res, err, 'Failed to get loan')
    }
  })

  // PATCH /api/loans/:id/status — transition loan status
  router.patch('/loans/:id/status', async (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Not authenticated')
      return
    }

    const loanId = req.params.id
    if (typeof loanId !== 'string') {
      sendErrorCode(res, 'BAD_REQUEST', 'Invalid loan ID')
      return
    }

    const { status: newStatus } = req.body

    if (!newStatus) {
      sendErrorCode(res, 'BAD_REQUEST', 'Missing status')
      return
    }

    try {
      const loan = await service.transition(loanId, newStatus, userId)
      res.status(200).json(loan)
    } catch (err: unknown) {
      sendError(res, err, 'Failed to transition loan')
    }
  })

  // GET /api/loans — list loans for a user
  router.get('/loans', async (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Not authenticated')
      return
    }

    const { type } = req.query as Record<string, string>

    if (type !== 'pedidos' && type !== 'recibidos') {
      sendErrorCode(res, 'BAD_REQUEST', 'Missing or invalid type (pedidos/recibidos)')
      return
    }

    try {
      const loans = type === 'pedidos'
        ? await service.findLoansByBorrower(userId)
        : await service.findLoansByOwner(userId)
      res.status(200).json(loans)
    } catch (err: unknown) {
      sendError(res, err, 'Failed to list loans')
    }
  })

  return router
}
