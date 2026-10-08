import type { Pool } from 'pg'

export interface CreateUserInput {
  name: string
  email: string
  password_hash: string
  neighborhood: string
}

export interface UpdateUserInput {
  name?: string
  email?: string
  neighborhood?: string
}

export interface User {
  id: string
  name: string
  email: string
  password_hash: string
  neighborhood: string
  created_at: string
}

export class UserRepository {
  constructor(private pool: Pool) {}

  async create(input: CreateUserInput): Promise<User> {
    const client = await this.pool.connect()
    try {
      const res = await client.query(
        `INSERT INTO users (name, email, password_hash, neighborhood)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, password_hash, neighborhood, created_at`,
        [input.name, input.email, input.password_hash, input.neighborhood],
      )
      if ((res.rowCount ?? 0) === 0) {
        throw new Error('Email already exists')
      }
      return res.rows[0]
    } finally {
      client.release()
    }
  }

  async findById(id: string): Promise<User | null> {
    const client = await this.pool.connect()
    try {
      const res = await client.query(
        `SELECT id, name, email, password_hash, neighborhood, created_at
         FROM users WHERE id = $1`,
        [id],
      )
      return (res.rowCount ?? 0) > 0 ? res.rows[0] : null
    } finally {
      client.release()
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const client = await this.pool.connect()
    try {
      const res = await client.query(
        `SELECT id, name, email, password_hash, neighborhood, created_at
         FROM users WHERE email = $1`,
        [email],
      )
      return (res.rowCount ?? 0) > 0 ? res.rows[0] : null
    } finally {
      client.release()
    }
  }

  async findAll(): Promise<User[]> {
    const client = await this.pool.connect()
    try {
      const res = await client.query(
        `SELECT id, name, email, password_hash, neighborhood, created_at
         FROM users ORDER BY created_at DESC`,
      )
      return res.rows
    } finally {
      client.release()
    }
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const client = await this.pool.connect()
    try {
      const fields: string[] = []
      const values: unknown[] = []
      let idx = 1

      if (input.name !== undefined) {
        fields.push(`name = $${idx++}`)
        values.push(input.name)
      }
      if (input.email !== undefined) {
        fields.push(`email = $${idx++}`)
        values.push(input.email)
      }
      if (input.neighborhood !== undefined) {
        fields.push(`neighborhood = $${idx++}`)
        values.push(input.neighborhood)
      }

      if (fields.length === 0) return null

      fields.push(`updated_at = now()`)
      values.push(id)

      const res = await client.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}
         RETURNING id, name, email, password_hash, neighborhood, created_at`,
        values,
      )
      return (res.rowCount ?? 0) > 0 ? res.rows[0] : null
    } finally {
      client.release()
    }
  }

  async delete(id: string): Promise<boolean> {
    const client = await this.pool.connect()
    try {
      const res = await client.query(`DELETE FROM users WHERE id = $1`, [id])
      return (res.rowCount ?? 0) > 0
    } finally {
      client.release()
    }
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
        [passwordHash, id],
      )
    } finally {
      client.release()
    }
  }
}
