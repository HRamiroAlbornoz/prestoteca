import type { Router } from 'express'
import express from 'express'
import type { ToolService } from './toolService.js'
import type { AuthRequest } from '../middleware/auth.js'

export function toolsRoutes(service: ToolService): Router {
  const router = express.Router()

  // POST /api/tools — publish a new tool
  router.post('/', (req: AuthRequest, res: express.Response) => {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } })
      return
    }

    const { name, description, category, condition } = req.body

    if (!name || !description || !category || !condition) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing required fields' } })
      return
    }

    service.publish({
      name,
      description,
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
    const updates: Record<string, string> = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
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
