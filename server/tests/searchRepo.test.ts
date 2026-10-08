import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { QueryResult } from 'pg'
import { SearchRepository, type SearchParams } from '../src/modules/search/searchRepo.js'

function createMockQuery() {
  const tools = [
    { id: 'tool-1', name: 'Taladro', description: 'Taladro percutor', category: 'electricas', condition: 'bueno', is_paused: false, owner_id: 'user-1', deleted_at: null, created_at: '2026-10-01' },
    { id: 'tool-2', name: 'Martillo', description: 'Martillo de acero', category: 'manuales', condition: 'nuevo', is_paused: false, owner_id: 'user-1', deleted_at: null, created_at: '2026-10-02' },
    { id: 'tool-3', name: 'Sierra circular', description: 'Sierra 71/2"', category: 'electricas', condition: 'usado', is_paused: false, owner_id: 'user-2', deleted_at: null, created_at: '2026-10-03' },
    { id: 'tool-4', name: 'Pala', description: 'Pala plana', category: 'jardineria', condition: 'bueno', is_paused: true, owner_id: 'user-1', deleted_at: null, created_at: '2026-10-04' },
    { id: 'tool-5', name: 'Cemento % special', description: 'Cemento', category: 'construccion', condition: 'nuevo', is_paused: false, owner_id: 'user-2', deleted_at: null, created_at: '2026-10-05' },
    { id: 'tool-6', name: 'Tornillo _extra', description: 'Tornillos', category: 'otros', condition: 'nuevo', is_paused: false, owner_id: 'user-2', deleted_at: null, created_at: '2026-10-06' },
  ]

  const mockQuery = vi.fn(async (text: string, values?: unknown[]) => {
    const isCountQuery = text.includes('SELECT COUNT')
    const isSelectQuery = text.includes('SELECT id, name')

    // Detect if first value is a search term (starts with %) or a category (exact match)
    const hasSearch = values?.[0] && typeof values[0] === 'string' && String(values[0]).startsWith('%')
    const hasCategory = !hasSearch && values?.[0] && typeof values[0] === 'string'

    // Build filter conditions from values
    const filtered = tools.filter((t) => {
      // Always exclude deleted and paused
      if (t.deleted_at) return false
      if (t.is_paused) return false

      if (hasSearch) {
        const searchTerm = String(values[0]).replace(/\\%/g, '%').replace(/\\_/g, '_').toLowerCase()
        const needle = searchTerm.slice(1, -1) // Remove % wildcards
        if (!t.name.toLowerCase().includes(needle)) return false
      }

      if (hasCategory) {
        if (t.category !== values[0]) return false
      }

      return true
    })

    if (isCountQuery) {
      return { rows: [{ count: filtered.length }], rowCount: 1 } as QueryResult
    }

    // SELECT with LIMIT/OFFSET — last two values
    const limit = values?.[values.length - 2] as number
    const offset = values?.[values.length - 1] as number
    const paginated = filtered.slice(offset, offset + limit)

    return { rows: paginated, rowCount: paginated.length } as QueryResult
  })

  return mockQuery
}

describe('SearchRepository', () => {
  let mockQuery: ReturnType<typeof createMockQuery>
  let repo: SearchRepository

  beforeEach(() => {
    mockQuery = createMockQuery()
    repo = new SearchRepository(mockQuery)
  })

  it('returns tools with no filters', async () => {
    const params: SearchParams = {}
    const result = await repo.search(params)

    expect(result).toHaveLength(5) // excludes only paused tool (Pala)
  })

  it('returns empty array when no tools match', async () => {
    const params: SearchParams = { q: 'nonexistent' }
    const result = await repo.search(params)

    expect(result).toEqual([])
  })

  it('filters by category', async () => {
    const params: SearchParams = { category: 'electricas' }
    const result = await repo.search(params)

    expect(result).toHaveLength(2)
    expect(result.every((t) => t.category === 'electricas')).toBe(true)
  })

  it('filters by name (case-insensitive)', async () => {
    const params: SearchParams = { q: 'taladro' }
    const result = await repo.search(params)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Taladro')
  })

  it('filters by name uppercase', async () => {
    const params: SearchParams = { q: 'TALADRO' }
    const result = await repo.search(params)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Taladro')
  })

  it('escapes % wildcard as literal', async () => {
    const params: SearchParams = { q: '%' }
    const result = await repo.search(params)

    // Should match "Cemento % special" which has literal % in name
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Cemento % special')
  })

  it('escapes _ wildcard as literal', async () => {
    const params: SearchParams = { q: '_' }
    const result = await repo.search(params)

    // Should match "Tornillo _extra" which has literal _ in name
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Tornillo _extra')
  })

  it('excludes paused tools', async () => {
    const params: SearchParams = {}
    const result = await repo.search(params)

    const paused = result.find((t) => t.name === 'Pala')
    expect(paused).toBeUndefined()
  })

  it('paginates results', async () => {
    const params: SearchParams = { page: 1, limit: 2 }
    const result = await repo.search(params)

    expect(result).toHaveLength(2)
  })

  it('returns correct offset for page 2', async () => {
    const params: SearchParams = { page: 2, limit: 2 }
    const result = await repo.search(params)

    expect(result).toHaveLength(2)
    // Should be different tools than page 1
    expect(result[0].id).not.toBe('tool-1')
  })

  it('throws error when page < 1', async () => {
    const params: SearchParams = { page: -1 }

    await expect(repo.search(params)).rejects.toThrow('Page must be >= 1')
  })

  it('counts total matching tools', async () => {
    const params: SearchParams = {}
    const count = await repo.count(params)

    expect(count).toBe(5)
  })

  it('counts filtered by category', async () => {
    const params: SearchParams = { category: 'electricas' }
    const count = await repo.count(params)

    expect(count).toBe(2)
  })
})
