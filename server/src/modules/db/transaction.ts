import type { Pool, PoolClient } from 'pg'

// Runs `work` inside one database transaction: every query it makes through `client`
// is applied together on COMMIT, or none of them is (ROLLBACK) if anything throws.
// All queries must use the given client: the pool hands out a different connection
// per query, and a transaction only exists on the connection that opened it.
export async function withTransaction<T>(
  pool: Pick<Pool, 'connect'>,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
