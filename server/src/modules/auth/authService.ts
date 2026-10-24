import { randomBytes } from 'node:crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import type { UserRepository, CreateUserInput } from './userRepo.js'
import { UnauthorizedError } from '../errors/AppError.js'

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

export interface AuthResult {
  token: string
}

export class AuthService {
  constructor(
    private userRepo: UserRepository,
    private jwtSecret: string,
    private jwtIssuer: string,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS)

    const user: CreateUserInput = {
      name: input.name,
      email: input.email,
      password_hash: passwordHash,
      neighborhood: input.neighborhood,
    }

    const created = await this.userRepo.create(user)
    const token = this.generateToken(created.id)
    return { token }
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.userRepo.findByEmail(input.email)

    // bcrypt runs in both cases; only a real user with the right password gets through
    const hashToCompare = user ? user.password_hash : await dummyHashPromise
    const valid = await bcrypt.compare(input.password, hashToCompare)
    if (!user || !valid) {
      throw new UnauthorizedError(INVALID_CREDENTIALS)
    }

    const token = this.generateToken(user.id)
    return { token }
  }

  generateToken(userId: string): string {
    return jwt.sign({ id: userId }, this.jwtSecret, {
      issuer: this.jwtIssuer,
      expiresIn: '1h',
    })
  }
}
