import { randomBytes } from 'node:crypto'
import bcrypt from 'bcrypt'
import type { UserRepository, CreateUserInput } from './userRepo.js'
import { AppError } from '../errors/AppError.js'

const SALT_ROUNDS = 12

// Same message for an unknown email and a wrong password: the login must not reveal
// which emails are registered.
export const INVALID_CREDENTIALS = 'Invalid credentials'

// A real bcrypt hash of a random value, with the same cost as the stored hashes.
// Comparing against it when the email does not exist makes that response take as long
// as a wrong password, so timing does not leak the answer either. Created once at startup.
const dummyHashPromise = bcrypt.hash(randomBytes(32).toString('hex'), SALT_ROUNDS)

export interface RegisterInput {
  name: string
  email: string
  password: string
  neighborhood: string
}

export interface LoginInput {
  email: string
  password: string
}

// Who signed in, and the password hash that was checked. The route opens the session with both:
// the session is only created if that hash is still the stored one (see createIfPasswordCurrent).
export interface AuthResult {
  userId: string
  passwordHash: string
}

export class AuthService {
  constructor(private userRepo: UserRepository) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS)

    const user: CreateUserInput = {
      name: input.name,
      email: input.email,
      password_hash: passwordHash,
      neighborhood: input.neighborhood,
    }

    const created = await this.userRepo.create(user)
    return { userId: created.id, passwordHash }
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.userRepo.findByEmail(input.email)

    // bcrypt runs in both cases; only a real user with the right password gets through
    const hashToCompare = user ? user.password_hash : await dummyHashPromise
    const valid = await bcrypt.compare(input.password, hashToCompare)
    if (!user || !valid) {
      throw new AppError('INVALID_CREDENTIALS', INVALID_CREDENTIALS)
    }

    return { userId: user.id, passwordHash: user.password_hash }
  }
}
