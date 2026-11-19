import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import type { Pool } from 'pg'
import { UserRepository } from '../src/modules/auth/userRepo.js'

function createMockPool() {
  const usersByEmail = new Map<string, { id: string; name: string; email: string; password_hash: string; neighborhood: string; created_at: string }>()
  const usersById = new Map<string, { id: string; name: string; email: string; password_hash: string; neighborhood: string; created_at: string }>()

  let nextId = 1
  const generateId = () => `uuid-${nextId++}`

  const mockClient = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const stmt = String(sql).trim().toUpperCase()
      const p = params ?? []

      // INSERT INTO users
      if (stmt.startsWith('INSERT INTO USERS')) {
        const id = generateId()
        const name = String(p[0])
        const email = String(p[1])
        const passwordHash = String(p[2])
        const neighborhood = String(p[3])
        if (usersByEmail.has(email)) {
          // Like PostgreSQL: a repeated email raises a unique_violation (code 23505)
          throw Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), { code: '23505' })
        }
        const user = { id, name, email, password_hash: passwordHash, neighborhood, created_at: new Date().toISOString() }
        usersByEmail.set(email, user)
        usersById.set(id, user)
        return { rowCount: 1, rows: [user] }
      }

      // SELECT FROM users WHERE email
      if (stmt.startsWith('SELECT') && stmt.includes('FROM USERS') && stmt.includes('WHERE EMAIL')) {
        const email = String(p[0])
        const user = usersByEmail.get(email)
        if (user) return { rowCount: 1, rows: [user] }
        return { rowCount: 0, rows: [] }
      }

      // SELECT FROM users WHERE id
      if (stmt.startsWith('SELECT') && stmt.includes('FROM USERS') && stmt.includes('WHERE ID')) {
        const id = String(p[0])
        const user = usersById.get(id)
        if (user) return { rowCount: 1, rows: [user] }
        return { rowCount: 0, rows: [] }
      }

      // SELECT FROM users (findAll)
      if (stmt.startsWith('SELECT') && stmt.includes('FROM USERS')) {
        return { rowCount: usersById.size, rows: Array.from(usersById.values()) }
      }

      // UPDATE users WHERE id
      if (stmt.startsWith('UPDATE USERS')) {
        const id = String(p[p.length - 1])
        const user = usersById.get(id)
        if (user) {
          // Parse SET clause to map params to fields
          const setMatch = stmt.match(/SET\s+(.+?)\s+WHERE/i)
          if (setMatch) {
            const setParts = setMatch[1].split(',').map(s => s.trim().split(' = ')[0].trim().toLowerCase())
            for (let i = 0; i < setParts.length; i++) {
              const field = setParts[i]
              if (field === 'name') user.name = String(p[i])
              else if (field === 'email') user.email = String(p[i])
              else if (field === 'neighborhood') user.neighborhood = String(p[i])
            }
          }
          return { rowCount: 1, rows: [user] }
        }
        return { rowCount: 0, rows: [] }
      }

      // DELETE FROM users WHERE id
      if (stmt.startsWith('DELETE FROM USERS')) {
        const id = String(p[0])
        const user = Array.from(usersByEmail.values()).find(u => u.id === id)
        if (user) {
          usersById.delete(id)
          usersByEmail.delete(user.email)
          return { rowCount: 1 }
        }
        return { rowCount: 0 }
      }

      return { rowCount: 0, rows: [] }
    }),
    release: vi.fn(),
  }

  const mockPool = { connect: vi.fn(async () => mockClient) }
  return { mockPool, mockClient, usersByEmail, usersById }
}

// Tiny fake pool: checks the SQL and what the method does with the rows
function poolReturning(rows: unknown[]) {
  const client = { query: vi.fn(async () => ({ rows, rowCount: rows.length })), release: vi.fn() }
  return { pool: { connect: vi.fn(async () => client) }, client }
}

// The columns of the users table, read from EVERY migration in the folder (so a future migration
// that adds a column to users is taken into account). Comment lines ("-- ...") are skipped.
function usersColumnsFromMigrations(): Set<string> {
  const folder = new URL('../src/migrations/', import.meta.url)
  const sql = readdirSync(folder)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => readFileSync(new URL(file, folder), 'utf8'))
    .join('\n')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  // Inside "CREATE TABLE ... users ( ... );" every line starts with a column name
  const body = sql.match(/CREATE TABLE[^(]*\busers\s*\(([\s\S]*?)\);/i)?.[1] ?? ''
  const created = body.split('\n').map((line) => line.trim().split(/\s+/)[0]).filter((word) => /^[a-z_]+$/.test(word))
  // Only columns added to the users table, not to tools or loans
  const added = [...sql.matchAll(/ALTER TABLE users ADD COLUMN IF NOT EXISTS (\w+)/gi)].map((m) => m[1])
  return new Set([...created, ...added])
}

// The column names an UPDATE writes: what comes between SET and WHERE, before each "="
function columnsWrittenBy(sql: string): string[] {
  const set = sql.match(/SET\s+([\s\S]+?)\s+WHERE/i)?.[1] ?? ''
  return set.split(',').map((part) => part.split('=')[0].trim())
}

describe('UserRepository', () => {
  let { mockPool, usersByEmail, usersById } = createMockPool()
  let repo: UserRepository

  beforeEach(() => {
    ;({ mockPool, usersByEmail, usersById } = createMockPool())
    repo = new UserRepository(mockPool)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('create', () => {
    it('inserts a new user and returns it with id', async () => {
      const user = await repo.create({ name: 'Ana García', email: 'ana@example.com', password_hash: '$2b$12$xxx', neighborhood: 'Centro' })
      expect(user.id).toBeDefined()
      expect(user.name).toBe('Ana García')
      expect(user.email).toBe('ana@example.com')
      expect(user.neighborhood).toBe('Centro')
    })

    it('throws on duplicate email', async () => {
      await repo.create({ name: 'Ana', email: 'ana@example.com', password_hash: '$2b$12$xxx', neighborhood: 'Centro' })
      await expect(
        repo.create({ name: 'Ana 2', email: 'ana@example.com', password_hash: '$2b$12$yyy', neighborhood: 'Norte' }),
      ).rejects.toThrow('Email already exists')
    })
  })

  describe('findById', () => {
    it('returns user by id', async () => {
      const created = await repo.create({ name: 'Carlos', email: 'carlos@example.com', password_hash: '$2b$12$xxx', neighborhood: 'Norte' })
      const found = await repo.findById(created.id)
      expect(found).toBeDefined()
      expect(found?.name).toBe('Carlos')
    })

    it('returns null when user not found', async () => {
      const found = await repo.findById('nonexistent-id')
      expect(found).toBeNull()
    })
  })

  describe('findActiveById', () => {
    it('skips deleted accounts in the query and returns the user', async () => {
      const { pool, client } = poolReturning([{ id: 'user-1', name: 'Ana' }])
      const activeRepo = new UserRepository(pool as never)

      const found = await activeRepo.findActiveById('user-1')

      expect(found?.name).toBe('Ana')
      const [sql, params] = client.query.mock.calls[0] as unknown as [string, unknown[]]
      expect(sql).toMatch(/deleted_at IS NULL/)
      expect(params).toEqual(['user-1'])
      expect(client.release).toHaveBeenCalled()
    })

    it('returns null when there is no active account', async () => {
      const { pool } = poolReturning([])
      const activeRepo = new UserRepository(pool as never)

      expect(await activeRepo.findActiveById('user-1')).toBeNull()
    })
  })

  describe('findByEmail', () => {
    it('returns user by email', async () => {
      await repo.create({ name: 'María', email: 'maria@example.com', password_hash: '$2b$12$xxx', neighborhood: 'Sur' })
      const found = await repo.findByEmail('maria@example.com')
      expect(found).toBeDefined()
      expect(found?.email).toBe('maria@example.com')
    })

    it('returns null when email not found', async () => {
      const found = await repo.findByEmail('unknown@example.com')
      expect(found).toBeNull()
    })

    // B1a — findByEmail must filter deleted accounts
    it('B1a findByEmail filters deleted accounts (SQL + params + release)', async () => {
      const { pool, client } = poolReturning([{ id: 'user-1', name: 'Ana', email: 'ana@example.com', password_hash: '$2b$12$xxx', neighborhood: 'Centro', created_at: '2026-01-01' }])
      const activeRepo = new UserRepository(pool as never)

      const found = await activeRepo.findByEmail('ana@example.com')

      expect(found?.name).toBe('Ana')
      const [sql, params] = client.query.mock.calls[0] as unknown as [string, unknown[]]
      // The whole condition, not just the words: "OR deleted_at IS NULL" or a comment would not filter anything
      expect(sql).toMatch(/WHERE email = \$1 AND deleted_at IS NULL/)
      expect(params).toEqual(['ana@example.com'])
      expect(client.release).toHaveBeenCalled()
    })

    // B1b — findByEmail returns null when no rows (deleted account)
    it('B1b findByEmail returns null when no rows', async () => {
      const { pool } = poolReturning([])
      const activeRepo = new UserRepository(pool as never)

      expect(await activeRepo.findByEmail('deleted@example.com')).toBeNull()
    })
  })

  describe('findAll', () => {
    it('returns all users', async () => {
      await repo.create({ name: 'User1', email: 'u1@example.com', password_hash: '$2b$12$xxx', neighborhood: 'A' })
      await repo.create({ name: 'User2', email: 'u2@example.com', password_hash: '$2b$12$yyy', neighborhood: 'B' })
      const users = await repo.findAll()
      expect(users.length).toBe(2)
    })

    it('returns empty array when no users', async () => {
      const users = await repo.findAll()
      expect(users).toEqual([])
    })
  })

  describe('update', () => {
    it('updates user fields', async () => {
      const created = await repo.create({ name: 'Original', email: 'orig@example.com', password_hash: '$2b$12$xxx', neighborhood: 'A' })
      await repo.update(created.id, { name: 'Updated', neighborhood: 'B' })
      const updated = await repo.findById(created.id)
      expect(updated?.name).toBe('Updated')
      expect(updated?.neighborhood).toBe('B')
    })

    it('returns null when user not found', async () => {
      const result = await repo.update('nonexistent-id', { name: 'Ghost' })
      expect(result).toBeNull()
    })
  })

  describe('delete', () => {
    it('removes user by id', async () => {
      const created = await repo.create({ name: 'ToDelete', email: 'del@example.com', password_hash: '$2b$12$xxx', neighborhood: 'A' })
      await repo.delete(created.id)
      const found = await repo.findById(created.id)
      expect(found).toBeNull()
    })

    it('returns true when deleted', async () => {
      const created = await repo.create({ name: 'X', email: 'x@example.com', password_hash: '$2b$12$xxx', neighborhood: 'A' })
      const result = await repo.delete(created.id)
      expect(result).toBe(true)
    })

    it('returns false when user not found', async () => {
      const result = await repo.delete('nonexistent-id')
      expect(result).toBe(false)
    })
  })

  describe('updatePassword', () => {
    // B2a — updatePassword must filter deleted accounts; returns true when a row changed
    it('B2a updatePassword filters deleted accounts (SQL + params + release + true)', async () => {
      const { pool, client } = poolReturning([])
      // An UPDATE returns no rows; rowCount says how many rows it changed
      client.query.mockImplementationOnce(async () => ({ rows: [], rowCount: 1 }))
      const pwRepo = new UserRepository(pool as never)

      const result = await pwRepo.updatePassword('user-1', 'hash-x')

      expect(result).toBe(true)
      const [sql, params] = client.query.mock.calls[0] as unknown as [string, unknown[]]
      // The whole condition, not just the words (see B1a)
      expect(sql).toMatch(/WHERE id = \$2 AND deleted_at IS NULL/)
      expect(params).toEqual(['hash-x', 'user-1'])
      expect(client.release).toHaveBeenCalled()
    })

    // B2b — updatePassword returns false when the account was deleted meanwhile
    it('B2b updatePassword returns false when deleted', async () => {
      // No rows and rowCount 0: what Postgres answers when the account was already deleted
      const { pool, client } = poolReturning([])
      const pwRepo = new UserRepository(pool as never)

      const result = await pwRepo.updatePassword('user-1', 'hash-x')

      expect(result).toBe(false)
      expect(client.release).toHaveBeenCalled()
    })

    // D1 — updatePassword must NOT write updated_at
    it('D1 updatePassword does not write updated_at (SQL + params + deleted_at filter)', async () => {
      const { pool, client } = poolReturning([])
      client.query.mockImplementationOnce(async () => ({ rows: [], rowCount: 1 }))
      const pwRepo = new UserRepository(pool as never)

      await pwRepo.updatePassword('user-1', 'hash-x')

      const [sql, params] = client.query.mock.calls[0] as unknown as [string, unknown[]]
      expect(sql).not.toMatch(/updated_at/)
      // It writes the password column and nothing else (writing "email = $1" would also be a real column)
      expect(sql).toMatch(/SET password_hash = \$1 WHERE id = \$2 AND deleted_at IS NULL/)
      expect(params).toEqual(['hash-x', 'user-1'])
    })

    // D2 — update must NOT write updated_at
    it('D2 update does not write updated_at (SQL)', async () => {
      const { pool, client } = poolReturning([{ id: 'user-1', name: 'Ana' }])
      const testRepo = new UserRepository(pool as never)

      await testRepo.update('user-1', { name: 'Ana', email: 'ana@example.com', neighborhood: 'Centro' })

      const [sql, params] = client.query.mock.calls[0] as unknown as [string, unknown[]]
      expect(sql).not.toMatch(/updated_at/)
      // Each value goes to its own column, in order
      expect(sql).toMatch(/SET name = \$1, email = \$2, neighborhood = \$3 WHERE id = \$4/)
      expect(params).toEqual(['Ana', 'ana@example.com', 'Centro', 'user-1'])
    })

    // D3c — the SET parser itself: it must return every column, not only the first one
    it('D3c columnsWrittenBy returns every column of the SET part', () => {
      expect(columnsWrittenBy('UPDATE t SET a = $1, b = now(), c = $2 WHERE id = $3')).toEqual(['a', 'b', 'c'])
    })

    // D3 helper — verify the guard reads the real columns
    it('D3 reads the 7 columns of users from the migrations', () => {
      expect(usersColumnsFromMigrations()).toEqual(
        new Set(['id', 'name', 'email', 'password_hash', 'neighborhood', 'created_at', 'deleted_at']),
      )
    })

    // D3a — schema guard for updatePassword
    it('D3a updatePassword only writes columns that exist in users (schema guard)', async () => {
      const { pool, client } = poolReturning([])
      client.query.mockImplementationOnce(async () => ({ rows: [], rowCount: 1 }))
      const pwRepo = new UserRepository(pool as never)

      await pwRepo.updatePassword('user-1', 'hash-x')

      const [sql] = client.query.mock.calls[0] as unknown as [string, unknown[]]
      const columns = columnsWrittenBy(sql)
      const valid = usersColumnsFromMigrations()
      columns.forEach((col) => expect(valid).toContain(col))
    })

    // D3b — schema guard for update
    it('D3b update only writes columns that exist in users (schema guard)', async () => {
      const { pool, client } = poolReturning([{ id: 'user-1', name: 'Ana' }])
      const testRepo = new UserRepository(pool as never)

      await testRepo.update('user-1', { name: 'Ana', email: 'ana@example.com', neighborhood: 'Centro' })

      const [sql] = client.query.mock.calls[0] as unknown as [string, unknown[]]
      const columns = columnsWrittenBy(sql)
      const valid = usersColumnsFromMigrations()
      columns.forEach((col) => expect(valid).toContain(col))
    })
  })
})

// --- server sessions (T003): updatePassword inside a transaction ----------------------------------

describe('updatePassword with a transaction client', () => {
  // The client of an open transaction: it answers like Postgres after changing one row
  function txClient(rowCount: number | null) {
    return { query: vi.fn(async () => ({ rows: [], rowCount })), release: vi.fn() }
  }

  it('AC-8 runs the same UPDATE on the given client, never opening a connection of its own', async () => {
    const { pool } = poolReturning([])
    const db = txClient(1)
    const pwRepo = new UserRepository(pool as never)

    const result = await pwRepo.updatePassword('user-1', 'hash-x', db as never)

    expect(result).toBe(true)
    expect(pool.connect).not.toHaveBeenCalled()
    const [sql, params] = db.query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toMatch(/SET password_hash = \$1 WHERE id = \$2 AND deleted_at IS NULL/)
    expect(params).toEqual(['hash-x', 'user-1'])
  })

  it('AC-8 does not release the transaction client (withTransaction does)', async () => {
    const { pool } = poolReturning([])
    const db = txClient(1)
    await new UserRepository(pool as never).updatePassword('user-1', 'hash-x', db as never)
    expect(db.release).not.toHaveBeenCalled()
  })

  it('AC-8 returns false on the given client when the account was deleted meanwhile (rowCount 0 or null)', async () => {
    const { pool } = poolReturning([])
    const pwRepo = new UserRepository(pool as never)
    expect(await pwRepo.updatePassword('user-1', 'hash-x', txClient(0) as never)).toBe(false)
    expect(await pwRepo.updatePassword('user-1', 'hash-x', txClient(null) as never)).toBe(false)
  })
})
