import { vi } from 'vitest'
import type { Pool, PoolClient } from 'pg'

// A fake database connection for routes that open a transaction (withTransaction).
// It records every statement it runs (BEGIN, COMMIT, ROLLBACK and anything else) so a test can check
// that two repository calls happened inside the same transaction, and that a failure rolled it back.
//
// The repositories themselves are mocked in the tests, so this client normally only sees
// BEGIN / COMMIT / ROLLBACK.
export interface FakeTransaction {
  client: PoolClient
  statements: string[]
  release: ReturnType<typeof vi.fn>
  // Use it as `{ connect }` for a router mounted alone, or with
  // vi.spyOn(Pool.prototype, 'connect').mockImplementation(connect) for the real app
  connect: (callback?: (err: Error | undefined, client?: PoolClient, done?: () => void) => void) => Promise<PoolClient> | void
  // `{ connect }` typed as the pool a router receives
  pool: Pick<Pool, 'connect'>
}

export function createFakeTransaction(): FakeTransaction {
  const statements: string[] = []
  const release = vi.fn()
  const client = {
    query: vi.fn(async (text: string) => {
      statements.push(text)
      return { rows: [], rowCount: 0 }
    }),
    release,
  } as unknown as PoolClient

  function connect(callback?: (err: Error | undefined, client?: PoolClient, done?: () => void) => void) {
    if (callback) {
      // pool.query() asks for a connection with a callback (pg-pool). In these tests that means a
      // repository method nobody mocked: fail at once instead of hanging until the test times out.
      callback(new Error('Unexpected pool.query in a test: mock the repository method'))
      return
    }
    return Promise.resolve(client)
  }

  const pool = { connect } as unknown as Pick<Pool, 'connect'>

  return { client, statements, release, connect, pool }
}
