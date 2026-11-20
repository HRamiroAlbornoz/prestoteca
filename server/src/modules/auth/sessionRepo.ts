import type { Pool, PoolClient } from 'pg'

// All the SQL of the sessions table (spec server-sessions, decision D14).
// Times always come from the app clock (`now`, `cutoffs`), never from the database clock.

// The ONE rule that says a session is still valid: last used AFTER its cutoff (exactly at the cutoff = expired).
// $1 is the cutoff for "Recordarme" sessions, $2 the one for short sessions, both from idleCutoffs().
// The ::timestamptz casts are required: without them Postgres resolves the CASE of two untyped parameters as text.
export const ACTIVE_SESSION_CONDITION =
  'last_used_at > CASE WHEN remember THEN $1::timestamptz ELSE $2::timestamptz END'

// What hashSessionToken() returns: SHA-256 in lowercase hex
const SESSION_HASH_PATTERN = /^[0-9a-f]{64}$/

export interface IdleCutoffs {
  rememberCutoff: Date
  shortCutoff: Date
}

export interface ActiveSession {
  userId: string
  remember: boolean
}

// Something that can run a query: the pool, or the client of an open transaction (withTransaction)
type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>

export class SessionRepository {
  constructor(private pool: Pool) {}

  // Creates the session ONLY if the user still exists with this exact password hash.
  // FOR SHARE waits for a password change or an account deletion that is half-way, then re-checks the row:
  // a login that raced with them creates nothing (returns false).
  async createIfPasswordCurrent(
    userId: string,
    expectedPasswordHash: string,
    tokenHash: string,
    remember: boolean,
    now: Date,
    db?: PoolClient,
  ): Promise<boolean> {
    const runner: Queryable = db ?? this.pool
    const res = await runner.query(
      `INSERT INTO sessions (user_id, token_hash, remember, created_at, last_used_at)
       SELECT id, $3::text, $4::boolean, $5::timestamptz, $5::timestamptz
       FROM users
       WHERE id = $1 AND password_hash = $2 AND deleted_at IS NULL
       FOR SHARE`,
      [userId, expectedPasswordHash, tokenHash, remember, now],
    )
    return (res.rowCount ?? 0) === 1
  }

  // Checks and renews in ONE statement: the row is updated only if it exists, is still valid and its account
  // is not deleted. No row back = no valid session. It never creates a row.
  async touchActive(tokenHash: string, now: Date, cutoffs: IdleCutoffs): Promise<ActiveSession | null> {
    const res = await this.pool.query(
      `UPDATE sessions SET last_used_at = $3::timestamptz
       WHERE token_hash = $4
         AND ${ACTIVE_SESSION_CONDITION}
         AND EXISTS (SELECT 1 FROM users WHERE users.id = sessions.user_id AND users.deleted_at IS NULL)
       RETURNING user_id, remember`,
      [cutoffs.rememberCutoff, cutoffs.shortCutoff, now, tokenHash],
    )
    const row = res.rows[0] as { user_id: string; remember: boolean } | undefined
    return row ? { userId: row.user_id, remember: row.remember } : null
  }

  // Logout: deleting a session that is already gone is not an error
  async deleteByTokenHash(tokenHash: string, db?: PoolClient): Promise<void> {
    const runner: Queryable = db ?? this.pool
    await runner.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash])
  }

  // Every session of the account except the one making the request. Returns how many were deleted.
  async deleteOthers(userId: string, keepTokenHash: string, db?: PoolClient): Promise<number> {
    // Without a valid hash to keep, `token_hash <> $2` would delete nothing (NULL → a false success after a
    // password change) or every session (''). Refuse instead. The routes already answer 401 before this (T004).
    if (typeof keepTokenHash !== 'string' || !SESSION_HASH_PATTERN.test(keepTokenHash)) {
      throw new Error('deleteOthers needs the 64-character hash of the session to keep')
    }
    const runner: Queryable = db ?? this.pool
    const res = await runner.query(`DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2`, [
      userId,
      keepTokenHash,
    ])
    return res.rowCount ?? 0
  }

  // Every session of the account. Only inside the account-deletion transaction, so `db` is required.
  async deleteAllForUser(userId: string, db: PoolClient): Promise<number> {
    const res = await db.query(`DELETE FROM sessions WHERE user_id = $1`, [userId])
    return res.rowCount ?? 0
  }

  // Deletes every session that is no longer valid: the exact opposite of ACTIVE_SESSION_CONDITION
  async purgeExpired(cutoffs: IdleCutoffs): Promise<number> {
    const res = await this.pool.query(`DELETE FROM sessions WHERE NOT (${ACTIVE_SESSION_CONDITION})`, [
      cutoffs.rememberCutoff,
      cutoffs.shortCutoff,
    ])
    return res.rowCount ?? 0
  }
}
