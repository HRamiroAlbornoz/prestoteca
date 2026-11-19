import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import { startSessionPurge } from '../src/modules/auth/sessionPurge.js'
import { SessionRepository } from '../src/modules/auth/sessionRepo.js'
import { idleCutoffs } from '../src/modules/auth/sessionToken.js'

const HOUR = 3_600_000
const NOW = new Date('2026-11-19T12:00:00.000Z')

// The purge never reaches a real database: purgeExpired is spied on the class
const fakePool = {} as Pool

// Kept before vi.useFakeTimers() replaces it: used to wait one real turn of Node's event loop
const realSetImmediate = setImmediate

describe('startSessionPurge', () => {
  let purge: { stop(): void } | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    purge?.stop()
    purge = undefined
    // Spies first: restoring them after useRealTimers would put the FAKE setInterval back on globalThis
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('AC-37 runs once right away, with the cutoffs of this moment', async () => {
    const purgeExpired = vi.spyOn(SessionRepository.prototype, 'purgeExpired').mockResolvedValue(0)

    purge = startSessionPurge(fakePool)
    await vi.advanceTimersByTimeAsync(0)

    expect(purgeExpired).toHaveBeenCalledTimes(1)
    expect(purgeExpired).toHaveBeenCalledWith(idleCutoffs(NOW))
  })

  it('AC-37 runs again every hour, each time with the cutoffs of that hour', async () => {
    const purgeExpired = vi.spyOn(SessionRepository.prototype, 'purgeExpired').mockResolvedValue(0)

    purge = startSessionPurge(fakePool)
    await vi.advanceTimersByTimeAsync(HOUR)
    await vi.advanceTimersByTimeAsync(HOUR)

    expect(purgeExpired).toHaveBeenCalledTimes(3)
    expect(purgeExpired).toHaveBeenNthCalledWith(2, idleCutoffs(new Date(NOW.getTime() + HOUR)))
    expect(purgeExpired).toHaveBeenNthCalledWith(3, idleCutoffs(new Date(NOW.getTime() + 2 * HOUR)))
  })

  it('AC-37 uses the interval it receives instead of the hour', async () => {
    const purgeExpired = vi.spyOn(SessionRepository.prototype, 'purgeExpired').mockResolvedValue(0)

    purge = startSessionPurge(fakePool, 1000)
    await vi.advanceTimersByTimeAsync(1000)

    expect(purgeExpired).toHaveBeenCalledTimes(2)
  })

  it('AC-37 does not run again before the hour has passed', async () => {
    const purgeExpired = vi.spyOn(SessionRepository.prototype, 'purgeExpired').mockResolvedValue(0)

    purge = startSessionPurge(fakePool)
    await vi.advanceTimersByTimeAsync(HOUR - 1)

    expect(purgeExpired).toHaveBeenCalledTimes(1)
  })

  it('AC-37 a database error is logged, never left unhandled, and the next hour runs again', async () => {
    const dbError = new Error('db down')
    const purgeExpired = vi.spyOn(SessionRepository.prototype, 'purgeExpired').mockRejectedValue(dbError)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)

    try {
      purge = startSessionPurge(fakePool)
      await vi.advanceTimersByTimeAsync(HOUR)
      // Let Node report any rejection that nobody handled
      await new Promise((resolve) => realSetImmediate(resolve))
    } finally {
      process.off('unhandledRejection', unhandled)
    }

    expect(purgeExpired).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledWith('[session-purge] Error during purge:', dbError)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('AC-37 deletes through the pool it receives (the real repository SQL, with the cutoffs as parameters)', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 })
    const pool = { query } as unknown as Pool

    purge = startSessionPurge(pool)
    await vi.advanceTimersByTimeAsync(0)

    expect(query).toHaveBeenCalledTimes(1)
    const cutoffs = idleCutoffs(NOW)
    expect(query.mock.calls[0]?.[0]).toContain('DELETE FROM sessions WHERE NOT (')
    expect(query.mock.calls[0]?.[1]).toEqual([cutoffs.rememberCutoff, cutoffs.shortCutoff])
  })

  // 1 is the edge of the "removed > 0" check
  it('AC-37 logs how many sessions it removed, and nothing when there were none', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(SessionRepository.prototype, 'purgeExpired').mockResolvedValueOnce(1).mockResolvedValueOnce(0)

    purge = startSessionPurge(fakePool)
    await vi.advanceTimersByTimeAsync(HOUR)

    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith('[session-purge] Removed 1 expired session(s)')
  })

  it('AC-37 stop() ends the hourly runs and leaves no timer behind', async () => {
    const purgeExpired = vi.spyOn(SessionRepository.prototype, 'purgeExpired').mockResolvedValue(0)

    purge = startSessionPurge(fakePool)
    await vi.advanceTimersByTimeAsync(0)
    purge.stop()
    await vi.advanceTimersByTimeAsync(3 * HOUR)

    expect(purgeExpired).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('AC-37 the hourly timer does not keep the process alive on its own (unref)', () => {
    vi.spyOn(SessionRepository.prototype, 'purgeExpired').mockResolvedValue(0)
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')

    purge = startSessionPurge(fakePool)

    expect(intervalSpy).toHaveBeenCalledTimes(1)
    const timer = intervalSpy.mock.results[0]?.value as NodeJS.Timeout
    expect(timer.hasRef()).toBe(false)
  })
})
