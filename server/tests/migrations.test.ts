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

  it('adds a nullable users.deleted_at that is safe to run twice', () => {
    const files = readFileSync(join(migrationsDir, '004_add_users_deleted_at.sql'), 'utf-8')
    // Nullable: existing rows and old code keep working. IF NOT EXISTS: re-running is harmless.
    expect(files).toContain('ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL')
    // The migration must only add the column, never create or drop tables
    expect(files).not.toMatch(/^\s*(CREATE|DROP) TABLE/im)
  })

  describe('005_create_sessions.sql (server-sessions, T001)', () => {
    const file = () => readFileSync(join(migrationsDir, '005_create_sessions.sql'), 'utf-8')
    // Lines that run: everything except SQL comments, so the commented "down" does not count
    const activeSql = () =>
      file()
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')

    it('AC-35 creates the sessions table only if it does not exist (safe to re-run)', () => {
      expect(activeSql()).toContain('CREATE TABLE IF NOT EXISTS sessions')
    })

    it('AC-35 gives each session its own random id as primary key', () => {
      expect(activeSql()).toMatch(/id\s+UUID\s+PRIMARY KEY\s+DEFAULT\s+gen_random_uuid\(\)/)
    })

    it('AC-35 stores only the 64-char hash of the token, unique', () => {
      expect(activeSql()).toMatch(/token_hash\s+CHAR\(64\)\s+NOT NULL\s+UNIQUE/)
    })

    it('AC-33 links each session to a user WITHOUT cascade (users are anonymized, never deleted)', () => {
      expect(activeSql()).toMatch(/user_id\s+UUID\s+NOT NULL\s+REFERENCES\s+users\(id\)/)
      expect(activeSql()).not.toMatch(/CASCADE/i)
      // No ON DELETE action at all: SET NULL would break user_id NOT NULL, and users are never deleted
      expect(activeSql()).not.toMatch(/ON\s+DELETE/i)
    })

    it('AC-35 has the remember flag and the two times, all NOT NULL', () => {
      expect(activeSql()).toMatch(/remember\s+BOOLEAN\s+NOT NULL/)
      expect(activeSql()).toMatch(/created_at\s+TIMESTAMPTZ\s+NOT NULL/)
      expect(activeSql()).toMatch(/last_used_at\s+TIMESTAMPTZ\s+NOT NULL/)
    })

    it('AC-35 never lets the database pick the time (the app clock sets it)', () => {
      // No time column may have any DEFAULT (now(), clock_timestamp(), LOCALTIMESTAMP, CURRENT_TIMESTAMP…)
      expect(activeSql()).not.toMatch(/TIMESTAMPTZ[^,\n]*DEFAULT/i)
      expect(activeSql()).not.toMatch(/CURRENT_TIMESTAMP|LOCALTIMESTAMP|now\(\)|clock_timestamp\(\)/i)
    })

    it('AC-33 indexes sessions by user, safe to re-run', () => {
      expect(activeSql()).toContain('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)')
    })

    it('AC-35 stores nothing about the device (no ip, user agent or location column)', () => {
      expect(activeSql()).not.toMatch(/\b(ip|ip_address|user_agent|device|location|city)\b/i)
    })

    it('AC-35 has exactly the six planned columns, nothing else', () => {
      // A closed column list catches an extra column under any name (remote_addr, fingerprint, geo…) in the
      // CREATE TABLE body, written one column per line as in every migration here (ALTERs are not read)
      const body = /CREATE TABLE IF NOT EXISTS sessions \(([\s\S]*?)\n\);/.exec(activeSql())
      expect(body).not.toBeNull()
      const columns = body![1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .map((line) => line.split(/\s+/)[0])
      expect(columns).toEqual(['id', 'user_id', 'token_hash', 'remember', 'created_at', 'last_used_at'])
    })

    it('AC-33 keeps the rollback only as a comment, never as SQL that runs', () => {
      expect(file()).toMatch(/^--.*DROP TABLE IF EXISTS sessions/m)
      expect(activeSql()).not.toMatch(/DROP/i)
    })
  })
})
