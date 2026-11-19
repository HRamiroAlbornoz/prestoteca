import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { UserRepository, type User } from '../src/modules/auth/userRepo.js'
import { meAccountRoutes } from '../src/modules/me/meAccountRoutes.js'
import { createFakeTransaction } from './fakeTransaction.js'

// The hash of the session making the request, as the real middleware loads it (64 hex characters)
const SESSION_HASH = 'a'.repeat(64)

// Mock bcrypt — track known hashes for realistic compare
let knownHashes = new Set<string>()
vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(async (pw: string, hash: string) => {
      if (hash === 'hashed_old') return true
      if (pw === 'old123' && hash === 'hashed_old') return true
      return false
    }),
    hash: vi.fn(async (pw: string) => {
      const hash = `hashed_${pw}`
      knownHashes.add(hash)
      return hash
    }),
  },
}))

// withSessionHash: false imitates a middleware that loads only the user id (the route must refuse)
function createMockApp({ withSessionHash = true } = {}) {
  const usersById = new Map<string, User>()
  let nextUserId = 1

  const mockUserRepo: Partial<UserRepository> = {
    findById: vi.fn(async (id) => usersById.get(id) ?? null),
    // Like the real queries: findById returns any stored row, findActiveById skips deleted ones
    findActiveById: vi.fn(async (id) => {
      const user = usersById.get(id)
      if (!user) return null
      // The real SQL is 'WHERE id = $1 AND deleted_at IS NULL'
      if ((user as any).deleted_at) return null
      return user
    }),
    updatePassword: vi.fn(async (id, hash) => {
      const user = usersById.get(id)
      if (!user || (user as any).deleted_at) return false
      user.password_hash = hash
      return true
    }),
    delete: vi.fn(async (id) => {
      return usersById.delete(id)
    }),
    create: vi.fn(async (input) => {
      const user: User = {
        id: `user-${nextUserId++}`,
        name: input.name,
        email: input.email,
        password_hash: input.password_hash,
        neighborhood: input.neighborhood,
        created_at: new Date().toISOString(),
      }
      usersById.set(user.id, user)
      return user
    }),
    findByEmail: vi.fn(async () => null),
    findAll: vi.fn(async () => Array.from(usersById.values())),
    update: vi.fn(async () => null),
  }

  const app = express()
  app.use(express.json())
  app.use(cookieParser())

  // Auth middleware
  app.use('/api/me', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'SESSION_REQUIRED', message: 'Authentication required' } })
      return
    }
    ;(req as any).userId = authHeader.replace('Bearer ', '')
    if (withSessionHash) {
      ;(req as any).sessionTokenHash = SESSION_HASH
    }
    next()
  })

  const sessionRepo = {
    deleteOthers: vi.fn(async () => 1),
    deleteAllForUser: vi.fn(async () => 0),
  }
  // The password change runs in a transaction; account deletion has its own tests
  const tx = createFakeTransaction()
  app.use('/api', meAccountRoutes(mockUserRepo as UserRepository, sessionRepo, tx.pool))

  return { app, usersById, mockUserRepo, sessionRepo, tx }
}

function ana(fields: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'Ana',
    email: 'ana@example.com',
    password_hash: 'hashed_old',
    neighborhood: 'Centro',
    created_at: '2026-10-01',
    ...fields,
  }
}

describe('meAccountRoutes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    knownHashes.clear()
    knownHashes.add('hashed_old')
  })

  // The client has no other way to know who is logged in: the session cookie is httpOnly
  describe('GET /api/me', () => {
    it('returns 200 with only the id and name of the logged-in user', async () => {
      const { app, usersById } = createMockApp()
      usersById.set('user-7', {
        id: 'user-7',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hashed_secret',
        neighborhood: 'Centro',
        created_at: new Date().toISOString(),
      })

      const res = await request(app).get('/api/me').set('Authorization', 'Bearer user-7')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: 'user-7', name: 'Ana' })
    })

    it('returns 401 without a session', async () => {
      const { app } = createMockApp()

      const res = await request(app).get('/api/me')

      expect(res.status).toBe(401)
    })

    it('returns 401 when the account no longer exists', async () => {
      const { app } = createMockApp()

      const res = await request(app).get('/api/me').set('Authorization', 'Bearer user-deleted')

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('SESSION_REQUIRED')
    })

    it('returns 401 SESSION_REQUIRED for a deleted account still stored in the table', async () => {
      const { app, usersById } = createMockApp()
      usersById.set('user-1', {
        id: 'user-1',
        name: 'Usuario eliminado',
        email: 'deleted-user-1@invalid',
        password_hash: 'hashed_wrong',
        neighborhood: 'Centro',
        created_at: '2026-10-01',
        deleted_at: '2026-11-01',
      } as never)

      const res = await request(app).get('/api/me').set('Authorization', 'Bearer user-1')

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: { code: 'SESSION_REQUIRED', message: 'Not authenticated' } })
    })
  })

  describe('PATCH /api/me/password', () => {
    it('returns 401 without auth', async () => {
      const { app } = createMockApp()

      const res = await request(app).patch('/api/me/password')
        .send({ currentPassword: 'old123', newPassword: 'new123456' })

      expect(res.status).toBe(401)
    })

    it('returns 400 on missing fields', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ newPassword: 'new123456' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('PASSWORD_CHANGE_MISSING_FIELDS')
    })

    // A1d — non-string fields (number) must answer 400 PASSWORD_CHANGE_MISSING_FIELDS
    it.each([
      ['currentPassword as number', { currentPassword: 12345678, newPassword: 'newpassword123' }],
      ['newPassword as number', { currentPassword: 'old123', newPassword: 12345678 }],
    ])('A1d returns 400 PASSWORD_CHANGE_MISSING_FIELDS when %s', async (_case, body) => {
      const { app, usersById } = createMockApp()
      usersById.set('user-1', {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hashed_old',
        neighborhood: 'Centro',
        created_at: '2026-10-01',
      })

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('PASSWORD_CHANGE_MISSING_FIELDS')
      // Nothing was written: the stored password is still the old one
      expect(usersById.get('user-1')?.password_hash).toBe('hashed_old')
    })

    // A1g — non-string fields (array, object) must answer 400 PASSWORD_CHANGE_MISSING_FIELDS
    it.each([
      ['currentPassword as array', { currentPassword: ['old123'], newPassword: 'newpassword123' }],
      ['currentPassword as object', { currentPassword: {}, newPassword: 'newpassword123' }],
      ['newPassword as array', { currentPassword: 'old123', newPassword: ['newpassword123'] }],
      ['newPassword as object', { currentPassword: 'old123', newPassword: {} }],
    ])('A1g returns 400 PASSWORD_CHANGE_MISSING_FIELDS when %s', async (_case, body) => {
      const { app, usersById } = createMockApp()
      usersById.set('user-1', {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hashed_old',
        neighborhood: 'Centro',
        created_at: '2026-10-01',
      })

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('PASSWORD_CHANGE_MISSING_FIELDS')
      expect(usersById.get('user-1')?.password_hash).toBe('hashed_old')
    })

    // A1i — an empty string is still missing (panel nit T2-N1)
    it.each([
      ['currentPassword empty', { currentPassword: '', newPassword: 'newpassword123' }],
      ['newPassword empty', { currentPassword: 'old123', newPassword: '' }],
    ])('A1i returns 400 PASSWORD_CHANGE_MISSING_FIELDS when %s', async (_case, body) => {
      const { app, usersById } = createMockApp()
      usersById.set('user-1', {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hashed_old',
        neighborhood: 'Centro',
        created_at: '2026-10-01',
      })

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send(body)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('PASSWORD_CHANGE_MISSING_FIELDS')
      expect(usersById.get('user-1')?.password_hash).toBe('hashed_old')
    })

    // A1h — no body and text/plain on PATCH /me/password
    // plainText undefined = the request has no body at all
    it.each<[string, string | undefined]>([
      ['no body', undefined],
      ['text/plain', 'hola'],
    ])('A1h returns 400 PASSWORD_CHANGE_MISSING_FIELDS for %s', async (_case, plainText) => {
      const { app, usersById } = createMockApp()
      usersById.set('user-1', {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hashed_old',
        neighborhood: 'Centro',
        created_at: '2026-10-01',
      })

      const base = request(app).patch('/api/me/password').set('Authorization', 'Bearer user-1')
      const res = plainText === undefined
        ? await base
        : await base.set('Content-Type', 'text/plain').send(plainText)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('PASSWORD_CHANGE_MISSING_FIELDS')
      expect(usersById.get('user-1')?.password_hash).toBe('hashed_old')
    })

    it('returns 400 on short password', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'short' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('NEW_PASSWORD_LENGTH')
    })

    it('returns 400 on password too long', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'a'.repeat(73) })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('NEW_PASSWORD_LENGTH')
    })

    it('returns 400 on spaces-only password', async () => {
      const { app } = createMockApp()

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: '        ' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('NEW_PASSWORD_BLANK')
    })

    it('returns 204 on successful password change', async () => {
      const { app, usersById } = createMockApp()

      usersById.set('user-1', {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hashed_old',
        neighborhood: 'Centro',
        created_at: '2026-10-01',
      })

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'newpassword123' })

      expect(res.status).toBe(204)
    })

    it('old password fails after change (AC 116)', async () => {
      const { app, usersById } = createMockApp()

      usersById.set('user-1', {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hashed_old',
        neighborhood: 'Centro',
        created_at: '2026-10-01',
      })

      // Change password
      await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'newpassword123' })

      // Old password should fail
      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'anotherpassword' })

      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('CURRENT_PASSWORD_INCORRECT')
    })

    it('D7 exception: a deleted account changing its password gets 404 ACCOUNT_NOT_FOUND', async () => {
      const { app, usersById } = createMockApp()

      // Store the user WITH deleted_at set (not removed from map):
      // findById would return it, but findActiveById filters it out
      usersById.set('user-1', {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hashed_wrong',
        neighborhood: 'Centro',
        created_at: '2026-10-01',
        deleted_at: '2026-11-01',
      } as any)

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'newpassword123' })

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND')
      expect(res.body.error.message).toBe('User not found')
    })

    // B3 — the race: findActiveById returns the user but marks it deleted (simulates deletion committing while bcrypt runs)
    it('B3 race: account deleted while bcrypt runs → 404', async () => {
      const { app, usersById, mockUserRepo } = createMockApp()

      usersById.set('user-1', {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hashed_old',
        neighborhood: 'Centro',
        created_at: '2026-10-01',
      })

      // Simulates the deletion committing while bcrypt.compare runs (~200 ms)
      vi.mocked(mockUserRepo.findActiveById!).mockImplementationOnce(async (id) => {
        const user = usersById.get(id)!
        const snapshot = { ...user }
        ;(user as any).deleted_at = '2026-11-13'
        return snapshot
      })

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'newpassword123' })

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND')
      expect(res.body.error.message).toBe('User not found')
      expect(usersById.get('user-1')?.password_hash).toBe('hashed_old')
    })

    // B4 — normal success case with the new fake
    it('B4 normal success: active user → 204 and password updated', async () => {
      const { app, usersById } = createMockApp()

      usersById.set('user-1', {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hashed_old',
        neighborhood: 'Centro',
        created_at: '2026-10-01',
      })

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'newpassword123' })

      expect(res.status).toBe(204)
      expect(usersById.get('user-1')?.password_hash).toBe('hashed_newpassword123')
    })

    it('AC-27 a successful password change keeps this session as it is: the route sends no cookie', async () => {
      const { app, usersById } = createMockApp()
      usersById.set('user-1', ana())

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'newpassword123' })

      expect(res.status).toBe(204)
      expect(res.headers['set-cookie']).toBeUndefined()
    })

    it('AC-8 the new password and the closing of the other sessions go in ONE transaction', async () => {
      const { app, usersById, mockUserRepo, sessionRepo, tx } = createMockApp()
      usersById.set('user-1', ana())

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'newpassword123' })

      expect(res.status).toBe(204)
      expect(mockUserRepo.updatePassword).toHaveBeenCalledWith('user-1', 'hashed_newpassword123', tx.client)
      expect(sessionRepo.deleteOthers).toHaveBeenCalledTimes(1)
      expect(sessionRepo.deleteOthers).toHaveBeenCalledWith('user-1', SESSION_HASH, tx.client)
      expect(sessionRepo.deleteAllForUser).not.toHaveBeenCalled()
      expect(tx.statements).toEqual(['BEGIN', 'COMMIT'])
      expect(tx.release).toHaveBeenCalledTimes(1)
    })

    it('AC-8 closing the other sessions fails → the password change is rolled back, 500', async () => {
      const { app, usersById, sessionRepo, tx } = createMockApp()
      usersById.set('user-1', ana())
      sessionRepo.deleteOthers.mockRejectedValueOnce(new Error('db down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'newpassword123' })

      expect(res.status).toBe(500)
      expect(res.body.error.code).toBe('INTERNAL_ERROR')
      expect(tx.statements).toEqual(['BEGIN', 'ROLLBACK'])
      expect(res.headers['set-cookie']).toBeUndefined()
      errorSpy.mockRestore()
    })

    it('AC-8 the account was deleted meanwhile → 404 and the other sessions are not touched', async () => {
      const { app, usersById, mockUserRepo, sessionRepo, tx } = createMockApp()
      usersById.set('user-1', ana())
      vi.mocked(mockUserRepo.updatePassword!).mockResolvedValueOnce(false)

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'newpassword123' })

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('ACCOUNT_NOT_FOUND')
      expect(sessionRepo.deleteOthers).not.toHaveBeenCalled()
      expect(tx.statements).toEqual(['BEGIN', 'ROLLBACK'])
    })

    it('AC-8 without the hash of this session → 401 and nothing is changed', async () => {
      const { app, usersById, mockUserRepo, sessionRepo } = createMockApp({ withSessionHash: false })
      usersById.set('user-1', ana())

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'newpassword123' })

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: { code: 'SESSION_REQUIRED', message: 'Not authenticated' } })
      expect(mockUserRepo.findActiveById).not.toHaveBeenCalled()
      expect(mockUserRepo.updatePassword).not.toHaveBeenCalled()
      expect(sessionRepo.deleteOthers).not.toHaveBeenCalled()
    })

    // R4b — failure cases must NOT set a cookie
    it.each([
      [401, { currentPassword: 'old123', newPassword: 'newpassword123' }, { password_hash: 'hashed_other' }, 'wrong current password'],
      [400, { currentPassword: 'old123', newPassword: 'short' }, { password_hash: 'hashed_old' }, 'new password too short'],
    ])('R4b %s: %s → no set-cookie', async (expectedStatus, body, userFields, _label) => {
      const { app, usersById } = createMockApp()

      usersById.set('user-1', {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: userFields.password_hash,
        neighborhood: 'Centro',
        created_at: '2026-10-01',
      } as User)

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send(body)

      expect(res.status).toBe(expectedStatus)
      expect(res.headers['set-cookie']).toBeUndefined()
    })

    // R4b row 3: account deleted while bcrypt runs → 404, no cookie
    it('R4b race: account deleted while bcrypt runs → 404, no set-cookie', async () => {
      const { app, usersById, mockUserRepo } = createMockApp()

      usersById.set('user-1', {
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        password_hash: 'hashed_old',
        neighborhood: 'Centro',
        created_at: '2026-10-01',
      })

      vi.mocked(mockUserRepo.findActiveById!).mockImplementationOnce(async (id) => {
        const user = usersById.get(id)!
        const snapshot = { ...user }
        ;(user as any).deleted_at = '2026-11-13'
        return snapshot
      })

      const res = await request(app)
        .patch('/api/me/password')
        .set('Authorization', 'Bearer user-1')
        .send({ currentPassword: 'old123', newPassword: 'newpassword123' })

      expect(res.status).toBe(404)
      expect(res.headers['set-cookie']).toBeUndefined()
    })
  })

  describe('DELETE /api/me/other-sessions', () => {
    it('AC-6 AC-19 closes every other session of this account, keeping this one → 204', async () => {
      const { app, sessionRepo } = createMockApp()

      const res = await request(app).delete('/api/me/other-sessions').set('Authorization', 'Bearer user-1')

      expect(res.status).toBe(204)
      expect(sessionRepo.deleteOthers).toHaveBeenCalledTimes(1)
      // The pool, not a transaction: one statement
      expect(sessionRepo.deleteOthers).toHaveBeenCalledWith('user-1', SESSION_HASH)
      expect(sessionRepo.deleteAllForUser).not.toHaveBeenCalled()
      expect(res.headers['set-cookie']).toBeUndefined()
    })

    it('AC-19 there were no other sessions → still 204', async () => {
      const { app, sessionRepo } = createMockApp()
      sessionRepo.deleteOthers.mockResolvedValueOnce(0)

      const res = await request(app).delete('/api/me/other-sessions').set('Authorization', 'Bearer user-1')

      expect(res.status).toBe(204)
    })

    it('AC-16 without a session → 401 and nothing is closed', async () => {
      const { app, sessionRepo } = createMockApp()

      const res = await request(app).delete('/api/me/other-sessions')

      expect(res.status).toBe(401)
      expect(sessionRepo.deleteOthers).not.toHaveBeenCalled()
    })

    it('AC-6 without the hash of this session → 401 and nothing is closed', async () => {
      const { app, sessionRepo } = createMockApp({ withSessionHash: false })

      const res = await request(app).delete('/api/me/other-sessions').set('Authorization', 'Bearer user-1')

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: { code: 'SESSION_REQUIRED', message: 'Not authenticated' } })
      expect(sessionRepo.deleteOthers).not.toHaveBeenCalled()
    })

    it('AC-11 the database fails → 500 INTERNAL_ERROR with a generic body', async () => {
      const { app, sessionRepo } = createMockApp()
      sessionRepo.deleteOthers.mockRejectedValueOnce(new Error('connection to 10.0.0.5 refused'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const res = await request(app).delete('/api/me/other-sessions').set('Authorization', 'Bearer user-1')

      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Failed to close other sessions' } })
      expect(JSON.stringify(res.body)).not.toContain('10.0.0.5')
      errorSpy.mockRestore()
    })
  })

  // DELETE /api/me/account is covered in accountDeletion.test.ts
})
