import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import type { UserRepository, CreateUserInput } from './userRepo.js'

const SALT_ROUNDS = 12

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
    if (!user) {
      throw new Error('User not found')
    }

    const valid = await bcrypt.compare(input.password, user.password_hash)
    if (!valid) {
      throw new Error('Invalid password')
    }

    const token = this.generateToken(user.id)
    return { token }
  }

  generateToken(userId: string): string {
    return jwt.sign({ id: userId }, this.jwtSecret, {
      issuer: this.jwtIssuer,
      expiresIn: '24h',
    })
  }
}
