import type { Pool } from 'pg'

export interface Tool {
  id: string
  owner_id: string
  name: string
  description: string
  category: string
  condition: string
  is_paused: boolean
  deleted_at: string | null
  created_at: string
}

export interface CreateToolInput {
  name: string
  description: string
  category: string
  condition: string
  ownerId: string
}

export interface SearchFilters {
  search?: string
  category?: string
  neighborhood?: string
  page?: number
  limit?: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pages: number
}

const VALID_CATEGORIES = [
  'Herramientas eléctricas',
  'Herramientas manuales',
  'Jardín',
  'Limpieza',
  'Escaleras y altura',
  'Otros',
] as const

const VALID_CONDITIONS = ['nuevo', 'bueno', 'usado'] as const

const DEFAULT_LIMIT = 12

export class ToolRepository {
  constructor(private pool: Pool) {}

  async create(input: CreateToolInput): Promise<Tool> {
    // Validate name length
    if (input.name.length < 3 || input.name.length > 60) {
      throw new Error('Name must be between 3 and 60 characters')
    }

    // Validate description length
    if (input.description.length > 500) {
      throw new Error('Description must be at most 500 characters')
    }

    // Validate category
    if (!(VALID_CATEGORIES as readonly string[]).includes(input.category)) {
      throw new Error('Invalid category')
    }

    // Validate condition
    if (!(VALID_CONDITIONS as readonly string[]).includes(input.condition)) {
      throw new Error('Invalid condition')
    }

    const res = await this.pool.query(
      `INSERT INTO tools (owner_id, name, description, category, condition)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.ownerId, input.name, input.description, input.category, input.condition],
    )

    return res.rows[0] as Tool
  }

  async findById(id: string): Promise<Tool | null> {
    const res = await this.pool.query(
      `SELECT * FROM tools WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    )
    return res.rows[0] ?? null
  }

  async findByOwner(ownerId: string): Promise<Tool[]> {
    const res = await this.pool.query(
      `SELECT * FROM tools WHERE owner_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
      [ownerId],
    )
    return res.rows as Tool[]
  }

  async findAll(filters: SearchFilters = {}): Promise<PaginatedResult<Tool>> {
    const { search, category, neighborhood, page = 1, limit = DEFAULT_LIMIT } = filters
    const offset = (page - 1) * limit

    // Build WHERE clause
    const whereClauses: string[] = ['deleted_at IS NULL', 'is_paused = false']
    const params: unknown[] = []
    let paramIndex = 1

    // Escape SQL wildcards: % → \%, _ → \_
    if (search) {
      const escaped = search
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_')
      whereClauses.push(`name ILIKE $${paramIndex++}`)
      params.push(`%${escaped}%`)
    }

    if (category) {
      whereClauses.push(`category = $${paramIndex++}`)
      params.push(category)
    }

    if (neighborhood) {
      whereClauses.push(`owner_id IN (SELECT id FROM users WHERE neighborhood ILIKE $${paramIndex++})`)
      params.push(`%${neighborhood}%`)
    }

    const whereClause = `WHERE ${whereClauses.join(' AND ')}`

    // Count query
    const countRes = await this.pool.query(
      `SELECT COUNT(*)::int FROM tools ${whereClause}`,
      params,
    )
    const total = parseInt(countRes.rows[0].count, 10)

    // Data query
    const dataRes = await this.pool.query(
      `SELECT * FROM tools ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    )

    return {
      items: dataRes.rows as Tool[],
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    }
  }

  async update(id: string, updates: Partial<Pick<Tool, 'name' | 'description' | 'category' | 'condition' | 'is_paused'>>): Promise<Tool | null> {
    const fields: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    if (updates.name !== undefined) {
      if (updates.name.length < 3 || updates.name.length > 60) {
        throw new Error('Name must be between 3 and 60 characters')
      }
      fields.push(`name = $${paramIndex++}`)
      params.push(updates.name)
    }

    if (updates.description !== undefined) {
      if (updates.description.length > 500) {
        throw new Error('Description must be at most 500 characters')
      }
      fields.push(`description = $${paramIndex++}`)
      params.push(updates.description)
    }

    if (updates.category !== undefined) {
      if (!(VALID_CATEGORIES as readonly string[]).includes(updates.category)) {
        throw new Error('Invalid category')
      }
      fields.push(`category = $${paramIndex++}`)
      params.push(updates.category)
    }

    if (updates.condition !== undefined) {
      if (!(VALID_CONDITIONS as readonly string[]).includes(updates.condition)) {
        throw new Error('Invalid condition')
      }
      fields.push(`condition = $${paramIndex++}`)
      params.push(updates.condition)
    }

    if (updates.is_paused !== undefined) {
      fields.push(`is_paused = $${paramIndex++}`)
      params.push(updates.is_paused)
    }

    if (fields.length === 0) {
      return null
    }

    params.push(id)
    const res = await this.pool.query(
      `UPDATE tools SET ${fields.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING *`,
      params,
    )
    return res.rows[0] ?? null
  }

  async softDelete(id: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE tools SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    )
    return (res.rowCount ?? 0) > 0
  }

  async pause(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE tools SET is_paused = true WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    )
  }

  async hasActiveLoans(toolId: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT COUNT(*)::int FROM loans WHERE tool_id = $1 AND status IN ('pendiente', 'aceptado', 'entregado', 'vencido')`,
      [toolId],
    )
    return parseInt(res.rows[0].count, 10) > 0
  }
}
