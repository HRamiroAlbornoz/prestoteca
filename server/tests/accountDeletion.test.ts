import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import bcrypt from 'bcrypt'
import type { Pool } from 'pg'
import { deleteAccount, DELETED_USER_NAME } from '../src/modules/me/accountDeletion.js'
import { meAccountRoutes } from '../src/modules/me/meAccountRoutes.js'
import type { UserRepository } from '../src/modules/auth/userRepo.js'
import { ConflictError, NotFoundError } from '../src/modules/errors/AppError.js'

interface FakeUser { id: string; name: string; email: string; password_hash: string; deleted_at: string | null }
interface FakeTool { id: string; owner_id: string; deleted_at: string | null }
interface FakeLoan { id: string; owner_id: string; borrower_id: string; status: string }

// A small stand-in for PostgreSQL. Like a real database, writes made inside a
// transaction only become visible on COMMIT and are discarded on ROLLBACK.
// `failOn` makes the statement containing that text throw, to test the rollback.
function createFakePool(options: { failOn?: string } = {}) {
  const users = new Map<string, FakeUser>()
  const tools = new Map<string, FakeTool>()
  const loans = new Map<string, FakeLoan>()
  const statements: string[] = []

  const client = {
    pending: [] as Array<() => void>,
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const text = sql.replace(/\s+/g, ' ').trim()
      statements.push(text.split(' ').slice(0, 2).join(' '))

      if (options.failOn && text.includes(options.failOn)) {
        throw new Error('connection lost')
      }
      if (text === 'BEGIN') {
        client.pending = []
        return { rows: [], rowCount: null }
      }
      if (text === 'COMMIT') {
        client.pending.forEach((apply) => apply())
        client.pending = []
        return { rows: [], rowCount: null }
      }
      if (text === 'ROLLBACK') {
        client.pending = []
        return { rows: [], rowCount: null }
      }
      if (text.startsWith('SELECT id FROM users')) {
        const user = users.get(params[0] as string)
        const rows = user && user.deleted_at === null ? [{ id: user.id }] : []
        return { rows, rowCount: rows.length }
      }
      if (text.startsWith('SELECT 1 FROM loans')) {
        const [userId, ...activeStatuses] = params as string[]
        const rows = [...loans.values()].filter(
          (loan) => (loan.owner_id === userId || loan.borrower_id === userId) && activeStatuses.includes(loan.status),
        )
        return { rows: rows.slice(0, 1), rowCount: Math.min(rows.length, 1) }
      }
      if (text.startsWith('UPDATE tools')) {
        const ownerId = params[0] as string
        client.pending.push(() => {
          for (const tool of tools.values()) {
            if (tool.owner_id === ownerId && tool.deleted_at === null) tool.deleted_at = 'now'
          }
        })
        return { rows: [], rowCount: null }
      }
      if (text.startsWith('UPDATE users')) {
        const [id, name, email, passwordHash] = params as string[]
        client.pending.push(() => {
          const user = users.get(id)
          if (user) Object.assign(user, { name, email, password_hash: passwordHash, deleted_at: 'now' })
        })
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL in fake pool: ${text}`)
    }),
    release: vi.fn(),
  }

  const pool = { connect: vi.fn(async () => client) } as unknown as Pool

  return { pool, client, users, tools, loans, statements }
}

function seed(db: ReturnType<typeof createFakePool>) {
  db.users.set('user-1', { id: 'user-1', name: 'Ana', email: 'ana@example.com', password_hash: 'old-hash', deleted_at: null })
  db.tools.set('tool-1', { id: 'tool-1', owner_id: 'user-1', deleted_at: null })
  db.tools.set('tool-2', { id: 'tool-2', owner_id: 'user-1', deleted_at: null })
  db.tools.set('tool-other', { id: 'tool-other', owner_id: 'user-2', deleted_at: null })
}

describe('deleteAccount', () => {
  it('anonymizes the user row and soft-deletes their tools in one transaction', async () => {
    const db = createFakePool()
    seed(db)
    // A finished loan stays in the history and does not block the deletion
    db.loans.set('loan-1', { id: 'loan-1', owner_id: 'user-1', borrower_id: 'user-2', status: 'devuelto' })

    await deleteAccount(db.pool, 'user-1', 'new-random-hash')

    const user = db.users.get('user-1')!
    expect(user.name).toBe(DELETED_USER_NAME)
    expect(user.email).toBe('deleted-user-1@invalid')
    expect(user.password_hash).toBe('new-random-hash')
    expect(user.deleted_at).not.toBeNull()
    expect(db.tools.get('tool-1')!.deleted_at).not.toBeNull()
    expect(db.tools.get('tool-2')!.deleted_at).not.toBeNull()
    // Another user's tool is untouched, and the loan keeps both participants
    expect(db.tools.get('tool-other')!.deleted_at).toBeNull()
    expect(db.loans.get('loan-1')).toEqual({ id: 'loan-1', owner_id: 'user-1', borrower_id: 'user-2', status: 'devuelto' })
    expect(db.statements[0]).toBe('BEGIN')
    expect(db.statements.at(-1)).toBe('COMMIT')
    expect(db.client.release).toHaveBeenCalledTimes(1)
  })

  it.each(['pendiente', 'aceptado', 'entregado', 'vencido'])(
    'rejects with a ConflictError and changes nothing when the user has a %s loan',
    async (status) => {
      const db = createFakePool()
      seed(db)
      db.loans.set('loan-1', { id: 'loan-1', owner_id: 'user-2', borrower_id: 'user-1', status })

      await expect(deleteAccount(db.pool, 'user-1', 'new-random-hash')).rejects.toBeInstanceOf(ConflictError)

      expect(db.users.get('user-1')!.name).toBe('Ana')
      expect(db.tools.get('tool-1')!.deleted_at).toBeNull()
      expect(db.statements.at(-1)).toBe('ROLLBACK')
      expect(db.client.release).toHaveBeenCalledTimes(1)
    },
  )

  it('rolls back everything when a step fails halfway', async () => {
    // The tools update runs, then the users update fails: nothing may stay half-done
    const db = createFakePool({ failOn: 'UPDATE users' })
    seed(db)

    await expect(deleteAccount(db.pool, 'user-1', 'new-random-hash')).rejects.toThrow('connection lost')

    expect(db.tools.get('tool-1')!.deleted_at).toBeNull()
    expect(db.users.get('user-1')!.name).toBe('Ana')
    expect(db.statements.at(-1)).toBe('ROLLBACK')
    expect(db.client.release).toHaveBeenCalledTimes(1)
  })

  it('rejects with a NotFoundError for an account that is already deleted', async () => {
    const db = createFakePool()
    seed(db)
    db.users.get('user-1')!.deleted_at = 'earlier'

    await expect(deleteAccount(db.pool, 'user-1', 'new-random-hash')).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('DELETE /api/me/account', () => {
  function appWith(db: ReturnType<typeof createFakePool>, userId?: string) {
    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      ;(req as express.Request & { userId?: string }).userId = userId
      next()
    })
    app.use('/api', meAccountRoutes({} as UserRepository, db.pool))
    return app
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 401 without auth', async () => {
    const db = createFakePool()

    const res = await request(appWith(db)).delete('/api/me/account')

    expect(res.status).toBe(401)
  })

  it('returns 204, clears the session cookie and stores a real unusable bcrypt hash', async () => {
    const db = createFakePool()
    seed(db)

    const res = await request(appWith(db, 'user-1')).delete('/api/me/account')

    expect(res.status).toBe(204)
    // The browser must forget the session: an expired "token" cookie
    expect(res.headers['set-cookie']?.[0]).toMatch(/^token=;.*Expires=Thu, 01 Jan 1970/)
    const storedHash = db.users.get('user-1')!.password_hash
    expect(bcrypt.getRounds(storedHash)).toBe(12)
    expect(await bcrypt.compare('', storedHash)).toBe(false)
  })

  it('returns 409 with a clear message when the user has active loans', async () => {
    const db = createFakePool()
    seed(db)
    db.loans.set('loan-1', { id: 'loan-1', owner_id: 'user-1', borrower_id: 'user-2', status: 'entregado' })

    const res = await request(appWith(db, 'user-1')).delete('/api/me/account')

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
    expect(res.body.error.message).toMatch(/préstamos activos/)
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('returns a generic 500 and keeps the session when the database fails', async () => {
    const db = createFakePool({ failOn: 'UPDATE users' })
    seed(db)

    const res = await request(appWith(db, 'user-1')).delete('/api/me/account')

    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete account' } })
    expect(res.headers['set-cookie']).toBeUndefined()
  })
})
