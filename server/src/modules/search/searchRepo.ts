export type QueryFn = (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>

export interface SearchParams {
  q?: string
  category?: string
  page?: number
  limit?: number
}

export class SearchRepository {
  constructor(private readonly query: QueryFn) {}

  async search(params: SearchParams): Promise<Array<{ id: string; name: string; description: string; category: string; condition: string; is_paused: boolean; owner_id: string }>> {
    const page = params.page ?? 1
    const limit = params.limit ?? 12
    const offset = (page - 1) * limit

    if (page < 1) {
      throw new Error('Page must be >= 1')
    }

    const conditions: string[] = ['deleted_at IS NULL', 'is_paused = false']
    const values: unknown[] = []
    let paramIndex = 1

    if (params.q) {
      const escaped = params.q.replace(/%/g, '\\%').replace(/_/g, '\\_')
      conditions.push(`name ILIKE $${paramIndex}`)
      values.push(`%${escaped}%`)
      paramIndex++
    }

    if (params.category) {
      conditions.push(`category = $${paramIndex}`)
      values.push(params.category)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await this.query(
      `SELECT id, name, description, category, condition, is_paused, owner_id FROM tools ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset],
    )

    return result.rows as Array<{ id: string; name: string; description: string; category: string; condition: string; is_paused: boolean; owner_id: string }>
  }

  async count(params: SearchParams): Promise<number> {
    const conditions: string[] = ['deleted_at IS NULL', 'is_paused = false']
    const values: unknown[] = []
    let paramIndex = 1

    if (params.q) {
      const escaped = params.q.replace(/%/g, '\\%').replace(/_/g, '\\_')
      conditions.push(`name ILIKE $${paramIndex}`)
      values.push(`%${escaped}%`)
      paramIndex++
    }

    if (params.category) {
      conditions.push(`category = $${paramIndex}`)
      values.push(params.category)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await this.query(
      `SELECT COUNT(*)::int FROM tools ${whereClause}`,
      values,
    )

    return (result.rows[0] as { count: number })?.count ?? 0
  }
}
