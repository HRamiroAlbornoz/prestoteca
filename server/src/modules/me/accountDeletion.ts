import type { Pool } from 'pg'
import { withTransaction } from '../db/transaction.js'
import { ACTIVE_STATUSES } from '../loans/loanRepo.js'
import { ConflictError, NotFoundError } from '../errors/AppError.js'

export const DELETED_USER_NAME = 'Usuario eliminado'

// Deleting an account anonymizes the user row instead of removing it (decision D4):
// the loans of other people keep pointing at a valid user, so their history stays intact,
// while the name, email and password stop identifying or working for anyone.
//
// `replacementHash` must be a real bcrypt hash of a random value: it replaces the password,
// so nobody can log in, and bcrypt.compare keeps working on it (it would throw on garbage).
export async function deleteAccount(
  pool: Pick<Pool, 'connect'>,
  userId: string,
  replacementHash: string,
): Promise<void> {
  await withTransaction(pool, async (client) => {
    // Lock the row so two deletions of the same account cannot run at the same time
    const user = await client.query(
      `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [userId],
    )
    if (user.rowCount === 0) {
      throw new NotFoundError('User not found')
    }

    // Same rule as deleting a tool (RF-07): loans in progress must end first
    const statusPlaceholders = ACTIVE_STATUSES.map((_, i) => `$${i + 2}`).join(', ')
    const activeLoan = await client.query(
      `SELECT 1 FROM loans
       WHERE (owner_id = $1 OR borrower_id = $1) AND status IN (${statusPlaceholders})
       LIMIT 1`,
      [userId, ...ACTIVE_STATUSES],
    )
    if ((activeLoan.rowCount ?? 0) > 0) {
      throw new ConflictError('No podés eliminar tu cuenta mientras tengas préstamos activos')
    }

    await client.query(
      `UPDATE tools SET deleted_at = now() WHERE owner_id = $1 AND deleted_at IS NULL`,
      [userId],
    )

    // The replacement email is unique per user and frees the original one for a new sign-up
    await client.query(
      `UPDATE users
       SET name = $2, email = $3, password_hash = $4, deleted_at = now()
       WHERE id = $1`,
      [userId, DELETED_USER_NAME, `deleted-${userId}@invalid`, replacementHash],
    )
  })
}
