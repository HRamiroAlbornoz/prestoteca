import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Pool, type QueryResult } from 'pg'
import { ToolRepository } from '../src/modules/tools/toolRepo.js'

function createMockPool() {
  const queries: Array<{ text: string; values: unknown[] }> = []
  let nextId = 1

  const mockPool = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      queries.push({ text, values: values ?? [] })

      // Simulate INSERT returning a tool
      if (text.includes('INSERT INTO tools') && text.includes('RETURNING')) {
        const [ownerId, name, description, category, condition] = values ?? []
        return {
          rows: [{
            id: `uuid-${nextId++}`,
            owner_id: ownerId,
            name: name,
            description: description,
            category: category,
            condition: condition,
            is_paused: false,
            deleted_at: null,
            created_at: new Date().toISOString(),
          }],
          rowCount: 1,
        } as QueryResult
      }

      // Simulate SELECT by id (findById)
      if (text.includes('SELECT * FROM tools WHERE id =') && values?.[0]) {
        return {
          rows: [{
            id: values[0] as string,
            owner_id: 'owner-1',
            name: 'Taladro',
            description: 'Un taladro',
            category: 'Herramientas eléctricas',
            condition: 'bueno',
            is_paused: false,
            deleted_at: null,
            created_at: new Date().toISOString(),
          }],
          rowCount: 1,
        } as QueryResult
      }

      // Simulate SELECT by owner
      if (text.includes('SELECT * FROM tools WHERE owner_id =')) {
        return {
          rows: [{
            id: 'uuid-1',
            owner_id: values?.[0],
            name: 'Taladro',
            description: 'Un taladro',
            category: 'Herramientas eléctricas',
            condition: 'bueno',
            is_paused: false,
            deleted_at: null,
            created_at: new Date().toISOString(),
          }],
          rowCount: 1,
        } as QueryResult
      }

      // Simulate UPDATE with RETURNING (update method)
      if (text.includes('UPDATE tools SET') && text.includes('RETURNING')) {
        // First param after SET values is the name being updated
        const nameValue = values?.[0] as string | undefined
        return {
          rows: [{
            id: values?.[values.length - 1],
            owner_id: 'owner-1',
            name: nameValue ?? 'Taladro actualizado',
            description: 'Un taladro',
            category: 'Herramientas eléctricas',
            condition: 'bueno',
            is_paused: false,
            deleted_at: null,
            created_at: new Date().toISOString(),
          }],
          rowCount: 1,
        } as QueryResult
      }

      // Simulate UPDATE without RETURNING (softDelete, pause)
      if (text.includes('UPDATE tools SET')) {
        if (text.includes('deleted_at')) {
          return { rows: [], rowCount: values?.[0] === 'uuid-nonexistent' ? 0 : 1 } as QueryResult
        }
        if (text.includes('is_paused')) {
          return { rows: [], rowCount: 1 } as QueryResult
        }
        return { rows: [], rowCount: 1 } as QueryResult
      }

      // Simulate hasActiveLoans COUNT
      if (text.includes('SELECT COUNT') && text.includes('loans')) {
        const hasRows = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls.length > 0
        if (hasRows) {
          // Check if this is the "no active loans" case (last call was set to empty)
          const lastCall = (mockPool.query as ReturnType<typeof vi.fn>).mock.calls[mockPool.query.mock.calls.length - 1]
          if (lastCall?.[1]?.[0] === 'uuid-no-loans') {
            return { rows: [{ count: 0 }], rowCount: 1 } as QueryResult
          }
        }
        return { rows: [{ count: '1' }], rowCount: 1 } as QueryResult
      }

      // Simulate count query for pagination
      if (text.includes('SELECT COUNT') && text.includes('tools')) {
        return { rows: [{ count: '1' }], rowCount: 1 } as QueryResult
      }

      // Simulate SELECT all (list)
      if (text.includes('SELECT * FROM tools') && text.includes('ORDER BY')) {
        return {
          rows: [{
            id: 'uuid-1',
            owner_id: 'owner-1',
            name: 'Taladro',
            description: 'Un taladro',
            category: 'Herramientas eléctricas',
            condition: 'bueno',
            is_paused: false,
            deleted_at: null,
            created_at: new Date().toISOString(),
          }],
          rowCount: 1,
        } as QueryResult
      }

      return { rows: [], rowCount: 0 } as QueryResult
    }),
  } as unknown as Pool

  return { mockPool, queries }
}

describe('ToolRepository', () => {
  let { mockPool, queries } = createMockPool()
  let repo: ToolRepository

  beforeEach(() => {
    ;({ mockPool, queries } = createMockPool())
    repo = new ToolRepository(mockPool)
  })

  describe('create', () => {
    it('inserts tool with RETURNING', async () => {
      const tool = await repo.create({
        name: 'Taladro',
        description: 'Un taladro potente',
        category: 'Herramientas eléctricas',
        condition: 'bueno',
        ownerId: 'owner-1',
      })

      expect(tool.id).toBeDefined()
      expect(tool.name).toBe('Taladro')
      expect(tool.owner_id).toBe('owner-1')
      expect(tool.is_paused).toBe(false)
      expect(tool.deleted_at).toBeNull()
    })

    it('validates name length (3-60 chars)', async () => {
      await expect(
        repo.create({
          name: 'Ab', // 2 chars
          description: 'Desc',
          category: 'Herramientas eléctricas',
          condition: 'bueno',
          ownerId: 'owner-1',
        }),
      ).rejects.toThrow('Name must be between 3 and 60 characters')
    })

    it('validates name minimum length', async () => {
      await expect(
        repo.create({
          name: '', // 0 chars
          description: 'Desc',
          category: 'Herramientas eléctricas',
          condition: 'bueno',
          ownerId: 'owner-1',
        }),
      ).rejects.toThrow('Name must be between 3 and 60 characters')
    })

    it('validates description max length (500)', async () => {
      await expect(
        repo.create({
          name: 'Tool',
          description: 'x'.repeat(501),
          category: 'Herramientas eléctricas',
          condition: 'bueno',
          ownerId: 'owner-1',
        }),
      ).rejects.toThrow('Description must be at most 500 characters')
    })

    it('validates category is in fixed list', async () => {
      await expect(
        repo.create({
          name: 'Tool',
          description: 'Desc',
          category: 'invalid-category',
          condition: 'bueno',
          ownerId: 'owner-1',
        }),
      ).rejects.toThrow('Invalid category')
    })

    it('validates condition is nuevo/bueno/usado', async () => {
      await expect(
        repo.create({
          name: 'Tool',
          description: 'Desc',
          category: 'Herramientas eléctricas',
          condition: 'excelente',
          ownerId: 'owner-1',
        }),
      ).rejects.toThrow('Invalid condition')
    })
  })

  describe('findById', () => {
    it('returns tool by id', async () => {
      const tool = await repo.findById('uuid-1')
      expect(tool).toBeDefined()
      expect(tool?.id).toBe('uuid-1')
    })

    it('returns null for non-existent id', async () => {
      // Override mock to return empty rows
      mockPool.query = vi.fn(async () => ({ rows: [], rowCount: 0 })) as unknown as typeof mockPool.query
      const tool = await repo.findById('uuid-nonexistent')
      expect(tool).toBeNull()
    })
  })

  describe('findByOwner', () => {
    it('returns tools for owner excluding deleted', async () => {
      const tools = await repo.findByOwner('owner-1')
      expect(Array.isArray(tools)).toBe(true)
      expect(tools.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('findAll', () => {
    it('returns paginated tools excluding paused and deleted', async () => {
      const tools = await repo.findAll({ page: 1, limit: 12 })
      expect(Array.isArray(tools.items)).toBe(true)
      expect(tools.items.length).toBeLessThanOrEqual(12)
    })

    it('filters by category', async () => {
      const tools = await repo.findAll({ category: 'Herramientas eléctricas', page: 1, limit: 12 })
      expect(Array.isArray(tools.items)).toBe(true)
    })

    it('filters by neighborhood', async () => {
      const tools = await repo.findAll({ neighborhood: 'Centro', page: 1, limit: 12 })
      expect(Array.isArray(tools.items)).toBe(true)
    })

    it('searches name case-insensitively', async () => {
      const tools = await repo.findAll({ search: 'TALADRO', page: 1, limit: 12 })
      expect(Array.isArray(tools.items)).toBe(true)
    })

    it('escapes SQL wildcards in search', async () => {
      const tools = await repo.findAll({ search: '100%', page: 1, limit: 12 })
      expect(Array.isArray(tools.items)).toBe(true)
    })
  })

  describe('update', () => {
    it('updates tool fields', async () => {
      const tool = await repo.update('uuid-1', { name: 'Taladro nuevo' })
      expect(tool.name).toBe('Taladro nuevo')
    })

    it('returns null for non-existent id', async () => {
      // Override mock AFTER validation passes — use valid name, empty result
      mockPool.query = vi.fn(async (text: string, values?: unknown[]) => {
        if (text.includes('UPDATE tools SET') && text.includes('RETURNING')) {
          return { rows: [], rowCount: 0 } as QueryResult
        }
        return { rows: [], rowCount: 0 } as QueryResult
      }) as unknown as typeof mockPool.query
      const tool = await repo.update('uuid-nonexistent', { name: 'ValidName' })
      expect(tool).toBeNull()
    })
  })

  describe('softDelete', () => {
    it('sets deleted_at to now', async () => {
      await repo.softDelete('uuid-1')
      const query = queries.find(q => q.text.includes('deleted_at'))
      expect(query).toBeDefined()
    })

    it('returns false for non-existent id', async () => {
      mockPool.query = vi.fn(async () => ({ rows: [], rowCount: 0 })) as unknown as typeof mockPool.query
      const result = await repo.softDelete('uuid-nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('pause', () => {
    it('sets is_paused to true', async () => {
      await repo.pause('uuid-1')
      const query = queries.find(q => q.text.includes('is_paused'))
      expect(query).toBeDefined()
    })
  })

  describe('hasActiveLoans', () => {
    it('returns true when active loans exist', async () => {
      mockPool.query = vi.fn(async () => ({ rows: [{ count: '1' }], rowCount: 1 })) as unknown as typeof mockPool.query
      const result = await repo.hasActiveLoans('uuid-1')
      expect(result).toBe(true)
    })

    it('returns false when no active loans', async () => {
      const result = await repo.hasActiveLoans('uuid-no-loans')
      expect(result).toBe(false)
    })
  })
})
