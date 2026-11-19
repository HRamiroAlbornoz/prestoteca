import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcrypt'
import { AuthService } from '../src/modules/auth/authService.js'
import type { UserRepository } from '../src/modules/auth/userRepo.js'

function createMockRepo() {
  const usersByEmail = new Map<string, { id: string; name: string; email: string; password_hash: string; neighborhood: string }>()

  const mockRepo: Partial<UserRepository> = {
    findByEmail: vi.fn(async (email: string) => {
      return usersByEmail.get(email) ?? null
    }),
    create: vi.fn(async (input: { name: string; email: string; password_hash: string; neighborhood: string }) => {
      if (usersByEmail.has(input.email)) {
        throw new Error('Email already exists')
      }
      const user = {
        id: `uuid-${usersByEmail.size + 1}`,
        name: input.name,
        email: input.email,
        password_hash: input.password_hash,
        neighborhood: input.neighborhood,
      }
      usersByEmail.set(input.email, user)
      return user
    }),
  }

  return { mockRepo, usersByEmail }
}

describe('AuthService', () => {
  let { mockRepo, usersByEmail } = createMockRepo()
  let service: AuthService

  beforeEach(() => {
    ;({ mockRepo, usersByEmail } = createMockRepo())
    service = new AuthService(mockRepo as UserRepository)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('register', () => {
    it('AC-24 creates the user and returns its id and the stored hash (no token: the route opens the session)', async () => {
      const result = await service.register({ name: 'Ana', email: 'ana@example.com', password: 'ana123', neighborhood: 'Centro' })
      const createdUser = usersByEmail.get('ana@example.com')!
      expect(result).toEqual({ userId: createdUser.id, passwordHash: createdUser.password_hash })
    })

    it('hashes password — stored hash ≠ plain text', async () => {
      await service.register({ name: 'Ana', email: 'ana2@example.com', password: 'ana123', neighborhood: 'Centro' })
      const call = (mockRepo.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(call.password_hash).not.toBe('ana123')
      expect(call.password_hash.length).toBeGreaterThan(50)
    })

    it('throws on duplicate email', async () => {
      await service.register({ name: 'Ana', email: 'ana@example.com', password: 'ana123', neighborhood: 'Centro' })
      await expect(
        service.register({ name: 'Ana 2', email: 'ana@example.com', password: 'ana456', neighborhood: 'Norte' }),
      ).rejects.toThrow('Email already exists')
    })
  })

  describe('login', () => {
    it('AC-8 returns the user id and the stored hash it checked the password against', async () => {
      await service.register({ name: 'Carlos', email: 'carlos@example.com', password: 'carlos123', neighborhood: 'Norte' })
      const stored = usersByEmail.get('carlos@example.com')!

      const result = await service.login({ email: 'carlos@example.com', password: 'carlos123' })

      expect(result).toEqual({ userId: stored.id, passwordHash: stored.password_hash })
    })

    it('throws "Invalid credentials" on wrong password', async () => {
      await service.register({ name: 'Maria', email: 'maria@example.com', password: 'maria123', neighborhood: 'Sur' })
      await expect(
        service.login({ email: 'maria@example.com', password: 'wrongpassword' }),
      ).rejects.toThrow('Invalid credentials')
      await expect(
        service.login({ email: 'maria@example.com', password: 'wrongpassword' }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 })
    })

    it('throws the same "Invalid credentials" error on non-existent email', async () => {
      // Same error as a wrong password, so the response never reveals whether the email is registered
      await expect(
        service.login({ email: 'ghost@example.com', password: 'any' }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401, message: 'Invalid credentials' })
    })

    it('still runs bcrypt with a cost-12 hash when the email does not exist', async () => {
      // Skipping bcrypt for unknown emails makes those responses faster, which leaks
      // the same information through timing. The dummy hash must cost the same as a real one.
      const compareSpy = vi.spyOn(bcrypt, 'compare')

      await expect(
        service.login({ email: 'ghost@example.com', password: 'any' }),
      ).rejects.toThrow('Invalid credentials')

      expect(compareSpy).toHaveBeenCalledTimes(1)
      const hashUsed = compareSpy.mock.calls[0][1] as string
      expect(bcrypt.getRounds(hashUsed)).toBe(12)
    })
  })
})
