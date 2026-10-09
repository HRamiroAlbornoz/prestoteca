import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const migrationsDir = join(__dirname, '..', 'src', 'migrations')

describe('migrations', () => {
  it('has users table migration with email UNIQUE', () => {
    const files = readFileSync(join(migrationsDir, '001_create_users.sql'), 'utf-8')
    expect(files).toContain('CREATE TABLE IF NOT EXISTS users')
    expect(files).toContain('email VARCHAR(254) NOT NULL UNIQUE')
    expect(files).toContain('password_hash VARCHAR(128) NOT NULL')
    expect(files).toContain('neighborhood VARCHAR(50) NOT NULL')
  })

  it('has tools table migration with FK to users and indexes', () => {
    const files = readFileSync(join(migrationsDir, '002_create_tools.sql'), 'utf-8')
    expect(files).toContain('CREATE TABLE IF NOT EXISTS tools')
    expect(files).toContain('owner_id UUID NOT NULL REFERENCES users(id)')
    expect(files).toContain('idx_tools_owner')
    expect(files).toContain('idx_tools_category')
    expect(files).toContain('idx_tools_deleted')
  })

  it('has loans table migration with FKs to tools and users', () => {
    const files = readFileSync(join(migrationsDir, '003_create_loans.sql'), 'utf-8')
    expect(files).toContain('CREATE TABLE IF NOT EXISTS loans')
    expect(files).toContain('tool_id UUID NOT NULL REFERENCES tools(id)')
    expect(files).toContain('borrower_id UUID NOT NULL REFERENCES users(id)')
    expect(files).toContain('owner_id UUID NOT NULL')
    expect(files).toContain('idx_loans_tool')
    expect(files).toContain('idx_loans_borrower')
    expect(files).toContain('idx_loans_owner')
    expect(files).toContain('idx_loans_status')
    expect(files).toContain('idx_loans_dates')
  })

  it('has idx_loans_status for filtering by status', () => {
    const files = readFileSync(join(migrationsDir, '003_create_loans.sql'), 'utf-8')
    expect(files).toContain('CREATE INDEX IF NOT EXISTS idx_loans_status')
  })

  it('has idx_loans_dates for background scan', () => {
    const files = readFileSync(join(migrationsDir, '003_create_loans.sql'), 'utf-8')
    expect(files).toContain('CREATE INDEX IF NOT EXISTS idx_loans_dates')
  })
})
