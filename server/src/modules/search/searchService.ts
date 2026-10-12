import type { ToolRepository, PaginatedResult, Tool } from '../tools/toolRepo.js'

export interface SearchInput {
  q?: string
  category?: string
  neighborhood?: string
  page?: number
  limit?: number
}

export class SearchService {
  constructor(private readonly toolRepo: ToolRepository) {}

  async search(input: SearchInput): Promise<PaginatedResult<Tool>> {
    const page = input.page ?? 1

    if (page < 1) {
      throw new Error('Page must be >= 1')
    }

    // RF-14: Search query max 60 characters
    if (input.q && input.q.length > 60) {
      throw new Error('Search query must be at most 60 characters')
    }

    const limit = input.limit ?? 12

    return this.toolRepo.findAll({
      search: input.q,
      category: input.category,
      neighborhood: input.neighborhood,
      page,
      limit,
    })
  }
}
