import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
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
          // Simulate PG unique violation: return rowCount 0 so impl throws "Email already exists"
          return { rowCount: 0, rows: [] }
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
})
