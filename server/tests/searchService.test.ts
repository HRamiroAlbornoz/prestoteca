import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { PaginatedResult, Tool, ToolRepository } from '../src/modules/tools/toolRepo.js'
import { SearchService, type SearchInput } from '../src/modules/search/searchService.js'

function createMockRepo(): ToolRepository {
  const mockRepo = vi.fn<ToolRepository>()

  mockRepo.create = vi.fn(async (input) => ({
    id: 'tool-new',
    owner_id: input.ownerId,
    name: input.name,
    description: input.description,
    category: input.category,
    condition: input.condition,
    is_paused: false,
    deleted_at: null,
    created_at: '2026-10-01',
  }))

  mockRepo.findById = vi.fn(async (id) => {
    const tools: Tool[] = [
      { id: 'tool-1', owner_id: 'user-1', name: 'Taladro', description: 'Taladro percutor', category: 'electricas', condition: 'bueno', is_paused: false, deleted_at: null, created_at: '2026-10-01' },
      { id: 'tool-2', owner_id: 'user-1', name: 'Martillo', description: 'Martillo de acero', category: 'manuales', condition: 'nuevo', is_paused: false, deleted_at: null, created_at: '2026-10-02' },
      { id: 'tool-3', owner_id: 'user-2', name: 'Sierra circular', description: 'Sierra 71/2"', category: 'electricas', condition: 'usado', is_paused: false, deleted_at: null, created_at: '2026-10-03' },
      { id: 'tool-4', owner_id: 'user-3', name: 'Pala', description: 'Pala plana', category: 'jardineria', condition: 'bueno', is_paused: false, deleted_at: null, created_at: '2026-10-04' },
    ]
    return tools.find((t) => t.id === id) ?? null
  })

  mockRepo.findByOwner = vi.fn(async () => [])

  mockRepo.findAll = vi.fn(async (filters) => {
    const page = filters?.page ?? 1
    const limit = filters?.limit ?? 12
    const offset = (page - 1) * limit

    const allTools: Tool[] = [
      { id: 'tool-1', owner_id: 'user-1', name: 'Taladro', description: 'Taladro percutor', category: 'electricas', condition: 'bueno', is_paused: false, deleted_at: null, created_at: '2026-10-01' },
      { id: 'tool-2', owner_id: 'user-1', name: 'Martillo', description: 'Martillo de acero', category: 'manuales', condition: 'nuevo', is_paused: false, deleted_at: null, created_at: '2026-10-02' },
      { id: 'tool-3', owner_id: 'user-2', name: 'Sierra circular', description: 'Sierra 71/2"', category: 'electricas', condition: 'usado', is_paused: false, deleted_at: null, created_at: '2026-10-03' },
      { id: 'tool-4', owner_id: 'user-3', name: 'Pala', description: 'Pala plana', category: 'jardineria', condition: 'bueno', is_paused: false, deleted_at: null, created_at: '2026-10-04' },
      { id: 'tool-5', owner_id: 'user-4', name: 'Cemento', description: 'Cemento', category: 'construccion', condition: 'nuevo', is_paused: false, deleted_at: null, created_at: '2026-10-05' },
      { id: 'tool-6', owner_id: 'user-5', name: 'Tornillos', description: 'Tornillos', category: 'otros', condition: 'nuevo', is_paused: false, deleted_at: null, created_at: '2026-10-06' },
    ]

    let filtered = allTools

    // Apply search filter (case-insensitive)
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter((t) => t.name.toLowerCase().includes(searchLower))
    }

    // Apply category filter
    if (filters?.category) {
      filtered = filtered.filter((t) => t.category === filters.category)
    }

    // Apply neighborhood filter (simulated: owner_id mapping)
    if (filters?.neighborhood) {
      const neighborhoodOwners: Record<string, string[]> = {
        centro: ['user-1', 'user-2'],
        norte: ['user-3'],
        sur: ['user-4', 'user-5'],
      }
      const neighborhoodKey = Object.keys(neighborhoodOwners).find((k) => k.includes(filters.neighborhood!.toLowerCase()))
      if (neighborhoodKey) {
        const owners = neighborhoodOwners[neighborhoodKey]
        filtered = filtered.filter((t) => owners.includes(t.owner_id))
      } else {
        filtered = []
      }
    }

    const total = filtered.length
    const paginated = filtered.slice(offset, offset + limit)

    return {
      items: paginated,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    }
  })

  mockRepo.update = vi.fn(async () => null)
  mockRepo.softDelete = vi.fn(async () => false)
  mockRepo.pause = vi.fn(async () => {})
  mockRepo.hasActiveLoans = vi.fn(async () => false)

  return mockRepo
}

describe('SearchService', () => {
  let mockRepo: ToolRepository
  let service: SearchService

  beforeEach(() => {
    mockRepo = createMockRepo()
    service = new SearchService(mockRepo)
  })

  it('searches with no filters returns paginated results', async () => {
    const input: SearchInput = {}
    const result = await service.search(input)

    expect(result.items).toHaveLength(6)
    expect(result.page).toBe(1)
    expect(result.total).toBe(6)
  })

  it('filters by category returns only matching tools', async () => {
    const input: SearchInput = { category: 'electricas' }
    const result = await service.search(input)

    expect(result.items).toHaveLength(2)
    expect(result.items.every((t) => t.category === 'electricas')).toBe(true)
  })

  it('filters by neighborhood returns only matching tools', async () => {
    const input: SearchInput = { neighborhood: 'centro' }
    const result = await service.search(input)

    // user-1 (tool-1, tool-2) + user-2 (tool-3) = 3 tools in "centro"
    expect(result.items).toHaveLength(3)
    expect(result.items.every((t) => t.owner_id === 'user-1' || t.owner_id === 'user-2')).toBe(true)
  })

  it('filters by category AND neighborhood returns only matching', async () => {
    const input: SearchInput = { category: 'electricas', neighborhood: 'centro' }
    const result = await service.search(input)

    // user-1 and user-2 are in "centro"; user-1 has Taladro (electricas), user-2 has Sierra (electricas)
    expect(result.items).toHaveLength(2)
    expect(result.items.every((t) => t.category === 'electricas')).toBe(true)
  })

  it('pagination returns at most limit items', async () => {
    const input: SearchInput = { limit: 3 }
    const result = await service.search(input)

    expect(result.items).toHaveLength(3)
    expect(result.total).toBe(6)
  })

  it('pagination returns correct page 2', async () => {
    const input: SearchInput = { page: 2, limit: 2 }
    const result = await service.search(input)

    expect(result.items).toHaveLength(2)
    expect(result.page).toBe(2)
  })

  it('throws error when page < 1', async () => {
    const input: SearchInput = { page: -1 }

    await expect(service.search(input)).rejects.toThrow('Page must be >= 1')
  })

  it('defaults to page 1 and limit 12', async () => {
    const input: SearchInput = {}
    const result = await service.search(input)

    expect(result.page).toBe(1)
    expect(result.items).toHaveLength(6) // less than 12, so all returned
  })

  it('searches by name (case-insensitive)', async () => {
    const input: SearchInput = { q: 'taladro' }
    const result = await service.search(input)

    expect(result.items).toHaveLength(1)
    expect(result.items[0].name).toBe('Taladro')
  })

  it('returns correct page count', async () => {
    const input: SearchInput = { limit: 2 }
    const result = await service.search(input)

    expect(result.pages).toBe(3) // 6 total / 2 per page = 3 pages
  })
})
