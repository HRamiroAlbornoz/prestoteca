import type { Pool } from 'pg'
import { SessionRepository } from './sessionRepo.js'
import { idleCutoffs } from './sessionToken.js'

const ONE_HOUR_MS = 3_600_000

// Deletes the sessions that are no longer valid (spec server-sessions, AC-37): once when the server
// starts (every deploy restarts it), then every hour. A session that expired is gone at most one hour later.
export function startSessionPurge(pool: Pool, intervalMs: number = ONE_HOUR_MS): { stop(): void } {
  const repo = new SessionRepository(pool)

  async function purge(): Promise<void> {
    try {
      // The cutoffs are computed at each run, with the app clock of that moment
      const removed = await repo.purgeExpired(idleCutoffs(new Date()))
      if (removed > 0) {
        console.log(`[session-purge] Removed ${removed} expired session(s)`)
      }
    } catch (err: unknown) {
      // Never let the promise reject unhandled: that would stop the whole Node process
      console.error('[session-purge] Error during purge:', err)
    }
  }

  void purge()
  const timer = setInterval(() => {
    void purge()
  }, intervalMs)
  // The timer alone must not keep the process alive (tests, a clean shutdown)
  timer.unref()

  return {
    stop: () => clearInterval(timer),
  }
}
