import { describe, expect, it, vi } from 'vitest'
import type { Pool, PoolClient } from 'pg'
import { ACTIVE_SESSION_CONDITION, SessionRepository } from '../src/modules/auth/sessionRepo.js'
import { hashSessionToken, newSessionToken } from '../src/modules/auth/sessionToken.js'

// There is no local Postgres: these tests check the SQL text, its parameters and what each method does with
// the answer. The real SQL runs against staging Postgres in T009.

const HASH = 'a'.repeat(64)
const OTHER_HASH = 'b'.repeat(64)
const NOW = new Date('2026-11-18T12:00:00.000Z')
const CUTOFFS = {
  rememberCutoff: new Date('2026-11-11T12:00:00.000Z'),
  shortCutoff: new Date('2026-11-18T00:00:00.000Z'),
}

// Something with a query() that answers what the test says, and records every call
function fakeRunner(answer: { rowCount: number | null; rows?: unknown[] }) {
  return { query: vi.fn(async () => ({ rowCount: answer.rowCount, rows: answer.rows ?? [] })) }
}

// The pool: query() for statements outside a transaction; connect() must never be needed
function fakePool(answer: { rowCount: number | null; rows?: unknown[] }) {
  return { ...fakeRunner(answer), connect: vi.fn() }
}

function callOf(runner: { query: ReturnType<typeof vi.fn> }, index = 0): [string, unknown[]] {
  return runner.query.mock.calls[index] as unknown as [string, unknown[]]
}

function repoWith(pool: ReturnType<typeof fakePool>) {
  return new SessionRepository(pool as unknown as Pool)
}

// The SQL on one line with single spaces, so a whole statement can be compared exactly with toBe:
// comparing pieces would let extra text (such as "OR true") sit between them unnoticed
function oneLine(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

describe('ACTIVE_SESSION_CONDITION', () => {
  it('§0 is exactly the one validity rule: strict >, $1 and $2 cast to timestamptz', () => {
    expect(ACTIVE_SESSION_CONDITION).toBe(
      'last_used_at > CASE WHEN remember THEN $1::timestamptz ELSE $2::timestamptz END',
    )
  })
})

describe('createIfPasswordCurrent', () => {
  it('AC-8 AC-33 inserts only if the user still has this password hash and is not deleted, with FOR SHARE', async () => {
    const pool = fakePool({ rowCount: 1 })
    await repoWith(pool).createIfPasswordCurrent('user-1', 'bcrypt-hash', HASH, true, NOW)

    const [sql, params] = callOf(pool)
    expect(oneLine(sql)).toBe(
      'INSERT INTO sessions (user_id, token_hash, remember, created_at, last_used_at) ' +
        'SELECT id, $3::text, $4::boolean, $5::timestamptz, $5::timestamptz ' +
        'FROM users ' +
        'WHERE id = $1 AND password_hash = $2 AND deleted_at IS NULL ' +
        'FOR SHARE',
    )
    expect(params).toEqual(['user-1', 'bcrypt-hash', HASH, true, NOW])
  })

  it('AC-35 stores the hash it receives, never a token value', async () => {
    const pool = fakePool({ rowCount: 1 })
    await repoWith(pool).createIfPasswordCurrent('user-1', 'bcrypt-hash', HASH, false, NOW)
    expect(callOf(pool)[1][2]).toBe(HASH)
  })

  it('AC-8 returns true when one row was inserted', async () => {
    const pool = fakePool({ rowCount: 1 })
    expect(await repoWith(pool).createIfPasswordCurrent('user-1', 'h', HASH, true, NOW)).toBe(true)
  })

  it('AC-8 AC-33 returns false when nothing was inserted (password changed or account deleted meanwhile)', async () => {
    const pool = fakePool({ rowCount: 0 })
    expect(await repoWith(pool).createIfPasswordCurrent('user-1', 'h', HASH, true, NOW)).toBe(false)
  })

  it('§3.2 returns false when pg gives rowCount null', async () => {
    const pool = fakePool({ rowCount: null })
    expect(await repoWith(pool).createIfPasswordCurrent('user-1', 'h', HASH, true, NOW)).toBe(false)
  })

  it('§3.2 runs on the transaction client when one is given, not on the pool', async () => {
    const pool = fakePool({ rowCount: 1 })
    const db = fakeRunner({ rowCount: 1 })
    await repoWith(pool).createIfPasswordCurrent('user-1', 'h', HASH, true, NOW, db as unknown as PoolClient)
    expect(db.query).toHaveBeenCalledTimes(1)
    expect(pool.query).not.toHaveBeenCalled()
  })
})

describe('touchActive', () => {
  it('AC-3 AC-15 AC-36 is one UPDATE … RETURNING that renews only a valid session of an active account', async () => {
    const pool = fakePool({ rowCount: 1, rows: [{ user_id: 'user-1', remember: true }] })
    await repoWith(pool).touchActive(HASH, NOW, CUTOFFS)

    expect(pool.query).toHaveBeenCalledTimes(1)
    const [sql, params] = callOf(pool)
    // The whole statement, exactly: an extra "OR true" anywhere would renew expired or revoked sessions
    expect(oneLine(sql)).toBe(
      'UPDATE sessions SET last_used_at = $3::timestamptz ' +
        'WHERE token_hash = $4 ' +
        `AND ${ACTIVE_SESSION_CONDITION} ` +
        'AND EXISTS (SELECT 1 FROM users WHERE users.id = sessions.user_id AND users.deleted_at IS NULL) ' +
        'RETURNING user_id, remember',
    )
    // The two cutoffs are ALWAYS $1 (remember) and $2 (short)
    expect(params).toEqual([CUTOFFS.rememberCutoff, CUTOFFS.shortCutoff, NOW, HASH])
  })

  it('AC-3 returns the user id and the remember flag of the renewed session', async () => {
    const pool = fakePool({ rowCount: 1, rows: [{ user_id: 'user-1', remember: false }] })
    expect(await repoWith(pool).touchActive(HASH, NOW, CUTOFFS)).toEqual({ userId: 'user-1', remember: false })
  })

  it('AC-36 returns null when no row was renewed (unknown, expired, revoked or deleted account)', async () => {
    const pool = fakePool({ rowCount: 0, rows: [] })
    expect(await repoWith(pool).touchActive(HASH, NOW, CUTOFFS)).toBeNull()
  })

  it('§3.2b lets a database error through', async () => {
    const pool = fakePool({ rowCount: 0 })
    pool.query.mockRejectedValueOnce(new Error('connection refused'))
    await expect(repoWith(pool).touchActive(HASH, NOW, CUTOFFS)).rejects.toThrow('connection refused')
  })
})

describe('deleteByTokenHash', () => {
  it('AC-36 deletes the row of that hash', async () => {
    const pool = fakePool({ rowCount: 1 })
    await repoWith(pool).deleteByTokenHash(HASH)
    const [sql, params] = callOf(pool)
    expect(sql).toBe('DELETE FROM sessions WHERE token_hash = $1')
    expect(params).toEqual([HASH])
  })

  it('§3.2 resolves without error when nothing was deleted (idempotent)', async () => {
    const pool = fakePool({ rowCount: 0 })
    await expect(repoWith(pool).deleteByTokenHash(HASH)).resolves.toBeUndefined()
  })

  it('§3.2 runs on the transaction client when one is given, not on the pool', async () => {
    const pool = fakePool({ rowCount: 1 })
    const db = fakeRunner({ rowCount: 1 })
    await repoWith(pool).deleteByTokenHash(HASH, db as unknown as PoolClient)
    expect(db.query).toHaveBeenCalledTimes(1)
    expect(pool.query).not.toHaveBeenCalled()
  })
})

describe('deleteOthers', () => {
  it('AC-7 deletes only the sessions of this account except the kept one', async () => {
    const pool = fakePool({ rowCount: 2 })
    await repoWith(pool).deleteOthers('user-1', HASH)
    const [sql, params] = callOf(pool)
    expect(sql).toBe('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2')
    expect(params).toEqual(['user-1', HASH])
  })

  it('AC-7 returns how many sessions were deleted', async () => {
    const pool = fakePool({ rowCount: 2 })
    expect(await repoWith(pool).deleteOthers('user-1', HASH)).toBe(2)
  })

  it('§3.2 returns 0 when pg gives rowCount null', async () => {
    const pool = fakePool({ rowCount: null })
    expect(await repoWith(pool).deleteOthers('user-1', HASH)).toBe(0)
  })

  it('AC-8 §3.2b refuses a missing or invalid hash to keep, without touching the database', async () => {
    const pool = fakePool({ rowCount: 2 })
    const repo = repoWith(pool)
    // undefined would delete nothing (false success), '' would delete the caller's own session too
    const tooLong = 'a'.repeat(65)
    const extraFirst = `g${'a'.repeat(64)}`
    const newlineAfter = `${'a'.repeat(64)}\n`
    // An array of one valid hash turns into that hash when a regex reads it: only the typeof check rejects it
    const arrayOfOne = ['a'.repeat(64)]
    const badValues = [undefined, null, '', 'a'.repeat(63), tooLong, extraFirst, newlineAfter, arrayOfOne]
    for (const bad of [...badValues, 'A'.repeat(64), `${'a'.repeat(63)}g`]) {
      await expect(repo.deleteOthers('user-1', bad as unknown as string), String(bad)).rejects.toThrow(
        'deleteOthers needs the 64-character hash of the session to keep',
      )
    }
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('AC-8 runs on the transaction client when one is given, not on the pool', async () => {
    const pool = fakePool({ rowCount: 1 })
    const db = fakeRunner({ rowCount: 1 })
    await repoWith(pool).deleteOthers('user-1', OTHER_HASH, db as unknown as PoolClient)
    expect(db.query).toHaveBeenCalledTimes(1)
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('AC-8 §3.2b accepts every real hash: digits and letters, as hashSessionToken() returns them', async () => {
    // A real SHA-256 almost always mixes digits and letters; a rule that only allowed letters would break
    // the password change and "close the other sessions" for nearly every user
    const realHashes = [
      '0123456789abcdef'.repeat(4),
      hashSessionToken(newSessionToken()),
      hashSessionToken(newSessionToken()),
    ]
    for (const hash of realHashes) {
      const pool = fakePool({ rowCount: 1 })
      await repoWith(pool).deleteOthers('user-1', hash)
      expect(callOf(pool)[1], hash).toEqual(['user-1', hash])
    }
  })
})

describe('deleteAllForUser', () => {
  it('AC-33 deletes every session of the account, on the transaction client', async () => {
    const pool = fakePool({ rowCount: 9 })
    const db = fakeRunner({ rowCount: 3 })
    const deleted = await repoWith(pool).deleteAllForUser('user-1', db as unknown as PoolClient)

    const [sql, params] = callOf(db)
    expect(sql).toBe('DELETE FROM sessions WHERE user_id = $1')
    expect(params).toEqual(['user-1'])
    expect(deleted).toBe(3)
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('§3.2 returns 0 when pg gives rowCount null', async () => {
    const db = fakeRunner({ rowCount: null })
    expect(await repoWith(fakePool({ rowCount: 0 })).deleteAllForUser('user-1', db as unknown as PoolClient)).toBe(0)
  })
})

describe('purgeExpired', () => {
  it('AC-37 §0 deletes exactly the opposite of the validity rule, with the cutoffs as $1 and $2', async () => {
    const pool = fakePool({ rowCount: 4 })
    await repoWith(pool).purgeExpired(CUTOFFS)
    const [sql, params] = callOf(pool)
    expect(sql).toBe(`DELETE FROM sessions WHERE NOT (${ACTIVE_SESSION_CONDITION})`)
    expect(params).toEqual([CUTOFFS.rememberCutoff, CUTOFFS.shortCutoff])
  })

  it('AC-37 returns how many sessions were deleted, 0 when pg gives rowCount null', async () => {
    expect(await repoWith(fakePool({ rowCount: 4 })).purgeExpired(CUTOFFS)).toBe(4)
    expect(await repoWith(fakePool({ rowCount: null })).purgeExpired(CUTOFFS)).toBe(0)
  })
})

describe('the app clock, never the database clock', () => {
  it('§0 no statement of SessionRepository calls now()', async () => {
    const pool = fakePool({ rowCount: 1, rows: [{ user_id: 'user-1', remember: true }] })
    const repo = repoWith(pool)
    await repo.createIfPasswordCurrent('user-1', 'h', HASH, true, NOW)
    await repo.touchActive(HASH, NOW, CUTOFFS)
    await repo.deleteByTokenHash(HASH)
    await repo.deleteOthers('user-1', HASH)
    await repo.deleteAllForUser('user-1', pool as unknown as PoolClient)
    await repo.purgeExpired(CUTOFFS)

    expect(pool.query).toHaveBeenCalledTimes(6)
    for (const [sql] of pool.query.mock.calls as unknown as [string][]) {
      expect(sql).not.toMatch(/now\(\)|current_timestamp/i)
    }
  })
})
