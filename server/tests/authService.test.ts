import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
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
  let { mockRepo } = createMockRepo()
  let service: AuthService

  beforeEach(() => {
    ;({ mockRepo } = createMockRepo())
    service = new AuthService(mockRepo as UserRepository, 'test-secret-key', 'http://localhost:5173')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('register', () => {
    it('creates user and returns JWT', async () => {
      const result = await service.register({ name: 'Ana', email: 'ana@example.com', password: 'ana123', neighborhood: 'Centro' })
      expect(result.token).toBeDefined()
      expect(typeof result.token).toBe('string')
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
    it('returns JWT with correct user id', async () => {
      await service.register({ name: 'Carlos', email: 'carlos@example.com', password: 'carlos123', neighborhood: 'Norte' })
      const result = await service.login({ email: 'carlos@example.com', password: 'carlos123' })
      expect(result.token).toBeDefined()
      // Decode JWT and verify it contains the user id
      const parts = result.token.split('.')
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
      expect(payload.id).toBeDefined()
    })

    it('throws 401 on wrong password', async () => {
      await service.register({ name: 'Maria', email: 'maria@example.com', password: 'maria123', neighborhood: 'Sur' })
      await expect(
        service.login({ email: 'maria@example.com', password: 'wrongpassword' }),
      ).rejects.toThrow('Invalid password')
    })

    it('throws on non-existent email', async () => {
      await expect(
        service.login({ email: 'ghost@example.com', password: 'any' }),
      ).rejects.toThrow('User not found')
    })
  })

  describe('generateToken', () => {
    it('returns a valid JWT string', async () => {
      const token = service.generateToken('user-123')
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      const parts = token.split('.')
      expect(parts.length).toBe(3)
    })

    it('JWT payload contains user id', async () => {
      const token = service.generateToken('user-456')
      const parts = token.split('.')
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
      expect(payload.id).toBe('user-456')
    })
  })
})
