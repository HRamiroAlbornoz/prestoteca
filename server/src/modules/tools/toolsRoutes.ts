import type { Router } from 'express'
import express from 'express'
import type { ToolService } from './toolService.js'
import type { SearchService } from '../search/searchService.js'
import type { AuthRequest } from '../middleware/auth.js'
import { sendError, sendErrorCode } from '../errors/AppError.js'

export function toolsRoutes(service: ToolService, searchService: SearchService): Router {
  const router = express.Router()

  // GET /api/tools — list tools with pagination and filters
  router.get('/', (req: express.Request, res: express.Response) => {
    const { page, q, category, neighborhood } = req.query

    const pageNum = page ? parseInt(String(page), 10) : 1

    if (page !== undefined && (isNaN(pageNum) || pageNum < 1)) {
      sendErrorCode(res, 'BAD_REQUEST', 'Page must be a positive integer')
      return
    }

    searchService.search({
      q: q as string | undefined,
      category: category as string | undefined,
      neighborhood: neighborhood as string | undefined,
      page: pageNum,
    }).then((result) => {
      res.status(200).json(result)
    }).catch((err: unknown) => {
      sendError(res, err, 'Failed to list tools')
    })
  })

  // GET /api/tools/:id — get tool detail (no auth required)
  router.get('/:id', (req: express.Request, res: express.Response) => {
    const id = req.params.id
    if (typeof id !== 'string') {
      sendErrorCode(res, 'BAD_REQUEST', 'Invalid tool ID')
      return
    }

    service.getDetail(id)
      .then((tool) => {
        if (!tool) {
          sendErrorCode(res, 'TOOL_NOT_FOUND', 'Tool not found')
          return
        }
        res.status(200).json(tool)
      })
      .catch((err: unknown) => {
        sendError(res, err, 'Failed to get tool')
      })
  })

  // POST /api/tools — publish a new tool
  router.post('/', (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Not authenticated')
      return
    }

    const { name, description, category, condition } = req.body

    // Trim whitespace before validation
    const trimmedName = name?.trim()
    const trimmedDescription = description?.trim()

    if (!trimmedName || !trimmedDescription || !category || !condition) {
      sendErrorCode(res, 'TOOL_MISSING_FIELDS', 'Missing required fields')
      return
    }

    // Name validation: 3-60 characters
    if (trimmedName.length < 3 || trimmedName.length > 60) {
      sendErrorCode(res, 'TOOL_NAME_LENGTH', 'The tool name must be between 3 and 60 characters')
      return
    }

    // Description validation: max 500 characters
    if (trimmedDescription.length > 500) {
      sendErrorCode(res, 'TOOL_DESCRIPTION_TOO_LONG', 'The tool description must be at most 500 characters')
      return
    }

    service.publish({
      name: trimmedName,
      description: trimmedDescription,
      category,
      condition,
      ownerId: userId,
    }).then((tool) => {
      res.status(201).json(tool)
    }).catch((err: unknown) => {
      sendError(res, err, 'Failed to create tool')
    })
  })

  // PATCH /api/tools/:id — edit a tool (owner only)
  router.patch('/:id', (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Not authenticated')
      return
    }

    const id = req.params.id
    if (typeof id !== 'string') {
      sendErrorCode(res, 'BAD_REQUEST', 'Invalid tool ID')
      return
    }

    const { name, description, category, condition, is_paused } = req.body

    // Pausing is one-way: the spec has no "reactivate", so `true` is the only accepted value
    if (is_paused !== undefined && is_paused !== true) {
      sendErrorCode(res, 'BAD_REQUEST', 'is_paused only accepts true')
      return
    }

    // Trim whitespace before validation
    const updates: Record<string, string> = {}
    if (name !== undefined) updates.name = name.trim()
    if (description !== undefined) updates.description = description.trim()
    if (category !== undefined) updates.category = category
    if (condition !== undefined) updates.condition = condition

    const wantsPause = is_paused === true
    const hasEdits = Object.keys(updates).length > 0

    const run = async () => {
      if (!wantsPause) return service.edit(id, userId, updates as never)

      // Edit first: it validates every field, so an invalid edit fails before the tool gets paused
      if (hasEdits) {
        const edited = await service.edit(id, userId, updates as never)
        if (!edited) return null
      }

      // pause() checks that the user owns the tool before changing anything
      await service.pause(id, userId)
      return service.getDetail(id)
    }

    run()
      .then((tool) => {
        if (!tool) {
          sendErrorCode(res, 'TOOL_NOT_FOUND', 'Tool not found')
          return
        }
        res.status(200).json(tool)
      })
      .catch((err: unknown) => {
        sendError(res, err, 'Failed to update tool')
      })
  })

  // DELETE /api/tools/:id — soft delete a tool (owner only, no active loans)
  router.delete('/:id', (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      sendErrorCode(res, 'SESSION_REQUIRED', 'Not authenticated')
      return
    }

    const id = req.params.id
    if (typeof id !== 'string') {
      sendErrorCode(res, 'BAD_REQUEST', 'Invalid tool ID')
      return
    }

    service.delete(id, userId)
      .then(() => {
        res.status(204).send()
      })
      .catch((err: unknown) => {
        sendError(res, err, 'Failed to delete tool')
      })
  })

  return router
}
