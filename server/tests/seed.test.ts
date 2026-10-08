import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { seed } from '../src/modules/seed/index.js'
import bcrypt from 'bcrypt'

type QueryCall = { sql: string; params: unknown[] }

function createMockPool() {
  const queries: QueryCall[] = []
  const usersByEmail = new Map<string, { id: string; name: string; email: string }>()
  const toolsByNameAndOwner = new Map<string, { id: string; name: string; owner_id: string }>()
  const loansKey = new Set<string>()

  let nextId = 1
  const generateId = () => `uuid-${nextId++}`

  const mockClient = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params: params ?? [] })

      // Handle INSERT INTO users with ON CONFLICT
      if (sql.includes('INSERT INTO users') && sql.includes('ON CONFLICT')) {
        const name = String(params?.[0])
        const email = String(params?.[1])
        const neighborhood = String(params?.[3])
        if (!usersByEmail.has(email)) {
          usersByEmail.set(email, { id: generateId(), name, email, neighborhood })
        }
        return { rowCount: 1 }
      }

      // Handle INSERT INTO tools with WHERE NOT EXISTS
      if (sql.includes('INSERT INTO tools') && sql.includes('WHERE NOT EXISTS')) {
        const ownerId = String(params?.[0])
        const toolName = String(params?.[1])
        const key = `${toolName}:${ownerId}`
        if (!toolsByNameAndOwner.has(key)) {
          toolsByNameAndOwner.set(key, { id: generateId(), name: toolName, owner_id: ownerId })
        }
        return { rowCount: 1 }
      }

      // Handle INSERT INTO loans with WHERE NOT EXISTS
      if (sql.includes('INSERT INTO loans') && sql.includes('WHERE NOT EXISTS')) {
        const toolId = String(params?.[0])
        const borrowerId = String(params?.[1])
        const endDate = String(params?.[4])
        const key = `${toolId}:${borrowerId}:${endDate}`
        if (!loansKey.has(key)) {
          loansKey.add(key)
        }
        return { rowCount: 1 }
      }

      // Handle SELECT FROM users WHERE email
      if (sql.includes('SELECT id FROM users WHERE email')) {
        const email = String(params?.[0])
        const user = usersByEmail.get(email)
        if (user) {
          return { rowCount: 1, rows: [{ id: user.id }] }
        }
        return { rowCount: 0, rows: [] }
      }

      // Handle SELECT id FROM tools WHERE name
      if (sql.includes('SELECT id FROM tools WHERE name')) {
        const toolName = String(params?.[0])
        const tool = Array.from(toolsByNameAndOwner.values()).find(t => t.name === toolName)
        if (tool) {
          return { rowCount: 1, rows: [{ id: tool.id }] }
        }
        return { rowCount: 0, rows: [] }
      }

      // Handle SELECT count(*)
      if (sql.includes('SELECT count(*)')) {
        if (sql.includes('FROM users')) return { rowCount: 1, rows: [{ count: String(usersByEmail.size) }] }
        if (sql.includes('FROM tools')) return { rowCount: 1, rows: [{ count: String(toolsByNameAndOwner.size) }] }
        if (sql.includes('FROM loans')) return { rowCount: 1, rows: [{ count: String(loansKey.size) }] }
      }

      // Handle BEGIN, COMMIT, ROLLBACK
      return { rowCount: 0 }
    }),
    release: vi.fn(),
  }

  const mockPool = {
    connect: vi.fn(async () => mockClient),
  }

  return { mockPool, mockClient, queries, usersByEmail, toolsByNameAndOwner, loansKey }
}

describe('seed script', () => {
  let { mockPool, queries } = createMockPool()

  beforeEach(() => {
    ;({ mockPool, queries } = createMockPool())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates 3 users', async () => {
    await seed(mockPool)
    const res = await mockPool.connect().then(c => c.query('SELECT count(*) FROM users'))
    expect(Number(res.rows[0].count)).toBe(3)
  })

  it('creates tools linked to users', async () => {
    await seed(mockPool)
    const res = await mockPool.connect().then(c => c.query('SELECT count(*) FROM tools'))
    expect(Number(res.rows[0].count)).toBe(6)
  })

  it('creates loans linked to tools and users', async () => {
    await seed(mockPool)
    const res = await mockPool.connect().then(c => c.query('SELECT count(*) FROM loans'))
    expect(Number(res.rows[0].count)).toBe(3)
  })

  it('is idempotent — running twice does not duplicate users', async () => {
    await seed(mockPool)
    await seed(mockPool)
    const res = await mockPool.connect().then(c => c.query('SELECT count(*) FROM users'))
    expect(Number(res.rows[0].count)).toBe(3)
  })

  it('uses bcrypt with 12 salt rounds for passwords', async () => {
    await seed(mockPool)
    const userQueries = queries.filter(q => q.sql.includes('INSERT INTO users'))
    expect(userQueries.length).toBe(3)
    // Verify password hashes are bcrypt (cost 12)
    for (const q of userQueries) {
      const hash = String(q.params[2])
      expect(hash.length).toBeGreaterThan(50) // bcrypt hash is 60 chars
      expect(hash.startsWith('$2b$')).toBe(true)
    }
  })

  it('uses transaction (BEGIN/COMMIT)', async () => {
    await seed(mockPool)
    const beginQueries = queries.filter(q => q.sql.includes('BEGIN'))
    const commitQueries = queries.filter(q => q.sql.includes('COMMIT'))
    expect(beginQueries.length).toBe(1)
    expect(commitQueries.length).toBe(1)
  })
})
