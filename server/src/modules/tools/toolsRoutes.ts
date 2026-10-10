import type { Router } from 'express'
import express from 'express'
import type { ToolService } from './toolService.js'
import type { SearchService } from '../search/searchService.js'
import type { AuthRequest } from '../middleware/auth.js'

export function toolsRoutes(service: ToolService, searchService: SearchService): Router {
  const router = express.Router()

  // GET /api/tools — list tools with pagination and filters
  router.get('/', (req: express.Request, res: express.Response) => {
    const { page, q, category, neighborhood } = req.query

    const pageNum = page ? parseInt(String(page), 10) : 1

    if (page !== undefined && (isNaN(pageNum) || pageNum < 1)) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Page must be a positive integer' } })
      return
    }

    searchService.search({
      q: q as string | undefined,
      category: category as string | undefined,
      neighborhood: neighborhood as string | undefined,
      page: pageNum,
    }).then((result) => {
      res.status(200).json(result)
    }).catch(() => {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list tools' } })
    })
  })

  // GET /api/tools/:id — get tool detail (no auth required)
  router.get('/:id', (req: express.Request, res: express.Response) => {
    const id = req.params.id
    if (typeof id !== 'string') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid tool ID' } })
      return
    }

    service.getDetail(id)
      .then((tool) => {
        if (!tool) {
          res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tool not found' } })
          return
        }
        res.status(200).json(tool)
      })
      .catch(() => {
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get tool' } })
      })
  })

  // POST /api/tools — publish a new tool
  router.post('/', (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
      return
    }

    const { name, description, category, condition } = req.body

    // Trim whitespace before validation
    const trimmedName = name?.trim()
    const trimmedDescription = description?.trim()

    if (!trimmedName || !trimmedDescription || !category || !condition) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing required fields' } })
      return
    }

    // Name validation: 3-60 characters
    if (trimmedName.length < 3 || trimmedName.length > 60) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'The tool name must be between 3 and 60 characters' } })
      return
    }

    // Description validation: max 500 characters
    if (trimmedDescription.length > 500) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'The tool description must be at most 500 characters' } })
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
      if (err instanceof Error) {
        res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } })
        return
      }
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create tool' } })
    })
  })

  // PATCH /api/tools/:id — edit a tool (owner only)
  router.patch('/:id', (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
      return
    }

    const id = req.params.id
    if (typeof id !== 'string') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid tool ID' } })
      return
    }

    const { name, description, category, condition } = req.body

    // Trim whitespace before validation
    const updates: Record<string, string> = {}
    if (name !== undefined) updates.name = name.trim()
    if (description !== undefined) updates.description = description.trim()
    if (category !== undefined) updates.category = category
    if (condition !== undefined) updates.condition = condition

    service.edit(id, userId, updates as never)
      .then((tool) => {
        if (!tool) {
          res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tool not found' } })
          return
        }
        res.status(200).json(tool)
      })
      .catch((err: unknown) => {
        if (err instanceof Error) {
          if (err.message.includes('only edit')) {
            res.status(403).json({ error: { code: 'FORBIDDEN', message: err.message } })
            return
          }
          res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } })
          return
        }
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update tool' } })
      })
  })

  // DELETE /api/tools/:id — soft delete a tool (owner only, no active loans)
  router.delete('/:id', (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
      return
    }

    const id = req.params.id
    if (typeof id !== 'string') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid tool ID' } })
      return
    }

    service.delete(id, userId)
      .then(() => {
        res.status(204).send()
      })
      .catch((err: unknown) => {
        if (err instanceof Error) {
          if (err.message.includes('only delete') || err.message.includes('not found')) {
            const status = err.message.includes('only delete') ? 403 : 404
            res.status(status).json({ error: { code: status === 403 ? 'FORBIDDEN' : 'NOT_FOUND', message: err.message } })
            return
          }
          if (err.message.includes('active loans')) {
            res.status(409).json({ error: { code: 'CONFLICT', message: err.message } })
            return
          }
          res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete tool' } })
          return
        }
        res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete tool' } })
      })
  })

  return router
}
