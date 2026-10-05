import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Pool } from 'pg'
import { ToolRepository, type Tool } from '../src/modules/tools/toolRepo.js'
import { ToolService } from '../src/modules/tools/toolService.js'

function createMockRepo() {
  const toolsById = new Map<string, Tool>()
  let nextId = 1

  const mockRepo = {
    create: vi.fn(async (input: { name: string; description: string; category: string; condition: string; ownerId: string }) => {
      if (input.name.length < 3 || input.name.length > 60) {
        throw new Error('Name must be between 3 and 60 characters')
      }
      const tool: Tool = {
        id: `uuid-${nextId++}`,
        owner_id: input.ownerId,
        name: input.name,
        description: input.description,
        category: input.category,
        condition: input.condition,
        is_paused: false,
        deleted_at: null,
        created_at: new Date().toISOString(),
      }
      toolsById.set(tool.id, tool)
      return tool
    }),
    findById: vi.fn(async (id: string) => toolsById.get(id) ?? null),
    findByOwner: vi.fn(async (ownerId: string) =>
      Array.from(toolsById.values()).filter(t => t.owner_id === ownerId && t.deleted_at === null),
    ),
    findAll: vi.fn(async () => ({ items: [], total: 0, page: 1, pages: 1 })),
    update: vi.fn(async (id: string, updates: Partial<Tool>) => {
      const tool = toolsById.get(id)
      if (!tool) return null
      Object.assign(tool, updates)
      return tool
    }),
    softDelete: vi.fn(async (id: string) => {
      const tool = toolsById.get(id)
      if (!tool || tool.deleted_at) return false
      tool.deleted_at = new Date().toISOString()
      return true
    }),
    pause: vi.fn(async (id: string) => {
      const tool = toolsById.get(id)
      if (tool) tool.is_paused = true
    }),
    hasActiveLoans: vi.fn(async (id: string) => toolsById.get(id)?.id === 'tool-with-loans'),
  }

  return { mockRepo, toolsById }
}

describe('ToolService', () => {
  let { mockRepo } = createMockRepo()
  let service: ToolService

  beforeEach(() => {
    ;({ mockRepo } = createMockRepo())
    service = new ToolService(mockRepo as ToolRepository)
  })

  describe('publish', () => {
    it('creates a tool via repo', async () => {
      const tool = await service.publish({
        name: 'Taladro',
        description: 'Un taladro potente',
        category: 'electricas',
        condition: 'bueno',
        ownerId: 'owner-1',
      })

      expect(tool.id).toBeDefined()
      expect(tool.name).toBe('Taladro')
      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        ownerId: 'owner-1',
      }))
    })
  })

  describe('edit', () => {
    it('updates tool when user is owner', async () => {
      const tool = await service.publish({
        name: 'Taladro',
        description: 'Desc',
        category: 'electricas',
        condition: 'bueno',
        ownerId: 'owner-1',
      })

      const updated = await service.edit(tool.id, 'owner-1', { name: 'Taladro nuevo' })
      expect(updated?.name).toBe('Taladro nuevo')
    })

    it('throws 403 when user is not owner', async () => {
      const tool = await service.publish({
        name: 'Taladro',
        description: 'Desc',
        category: 'electricas',
        condition: 'bueno',
        ownerId: 'owner-1',
      })

      await expect(
        service.edit(tool.id, 'owner-2', { name: 'Hacked' }),
      ).rejects.toThrow('You can only edit your own tools')
    })

    it('throws 404 when tool not found', async () => {
      mockRepo.findById = vi.fn(async () => null)
      await expect(
        service.edit('uuid-nonexistent', 'owner-1', { name: 'X' }),
      ).rejects.toThrow('Tool not found')
    })
  })

  describe('delete', () => {
    it('throws 409 when tool has active loans', async () => {
      const tool = await service.publish({
        name: 'Taladro',
        description: 'Desc',
        category: 'electricas',
        condition: 'bueno',
        ownerId: 'owner-1',
      })

      // Override hasActiveLoans for this specific tool
      mockRepo.hasActiveLoans = vi.fn(async (id: string) => id === tool.id)

      await expect(
        service.delete(tool.id, 'owner-1'),
      ).rejects.toThrow('Cannot delete tool with active loans')
    })

    it('throws 403 when user is not owner', async () => {
      const tool = await service.publish({
        name: 'Taladro',
        description: 'Desc',
        category: 'electricas',
        condition: 'bueno',
        ownerId: 'owner-1',
      })

      await expect(
        service.delete(tool.id, 'owner-2'),
      ).rejects.toThrow('You can only delete your own tools')
    })

    it('soft deletes when no active loans and user is owner', async () => {
      // Override hasActiveLoans to return false
      mockRepo.hasActiveLoans = vi.fn(async () => false)

      const tool = await service.publish({
        name: 'Taladro',
        description: 'Desc',
        category: 'electricas',
        condition: 'bueno',
        ownerId: 'owner-1',
      })

      await service.delete(tool.id, 'owner-1')
      expect(mockRepo.softDelete).toHaveBeenCalledWith(tool.id)
    })
  })

  describe('pause', () => {
    it('pauses tool even with active loans', async () => {
      const tool = await service.publish({
        name: 'Taladro',
        description: 'Desc',
        category: 'electricas',
        condition: 'bueno',
        ownerId: 'owner-1',
      })

      await service.pause(tool.id, 'owner-1')
      expect(mockRepo.pause).toHaveBeenCalledWith(tool.id)
    })

    it('throws 403 when user is not owner', async () => {
      const tool = await service.publish({
        name: 'Taladro',
        description: 'Desc',
        category: 'electricas',
        condition: 'bueno',
        ownerId: 'owner-1',
      })

      await expect(
        service.pause(tool.id, 'owner-2'),
      ).rejects.toThrow('You can only pause your own tools')
    })
  })

  describe('getDetail', () => {
    it('returns tool detail', async () => {
      const tool = await service.publish({
        name: 'Taladro',
        description: 'Desc',
        category: 'electricas',
        condition: 'bueno',
        ownerId: 'owner-1',
      })

      const detail = await service.getDetail(tool.id)
      expect(detail?.id).toBe(tool.id)
      expect(detail?.name).toBe('Taladro')
    })

    it('returns null for non-existent tool', async () => {
      mockRepo.findById = vi.fn(async () => null)
      const detail = await service.getDetail('uuid-nonexistent')
      expect(detail).toBeNull()
    })
  })
})
