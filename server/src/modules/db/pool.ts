import { Pool } from 'pg'

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  }
  return pool
}

export async function checkDbConnection(): Promise<'connected' | 'disconnected'> {
  try {
    const p = getPool()
    const client = await p.connect()
    client.release()
    return 'connected'
  } catch {
    return 'disconnected'
  }
}
