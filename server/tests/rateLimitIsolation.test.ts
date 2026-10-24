import { describe, expect, it, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { authRateLimiter, generalRateLimiter, resetRateLimiter } from '../src/modules/middleware/rateLimit.js'

// Same mounting as the real app: the auth limiter on /api/auth (index.ts) and the
// general limiter on the rest of /api (routes.ts). Both limit by IP.
function createApp() {
  const app = express()
  app.use('/api/auth', authRateLimiter)
  app.post('/api/auth/login', (_req, res) => {
    res.status(200).json({ ok: true })
  })
  app.use('/api/tools', generalRateLimiter)
  app.get('/api/tools', (_req, res) => {
    res.status(200).json({ items: [] })
  })
  return app
}

async function repeat(times: number, send: () => Promise<{ status: number }>): Promise<number[]> {
  const statuses: number[] = []
  for (let i = 0; i < times; i++) {
    statuses.push((await send()).status)
  }
  return statuses
}

describe('rate limiters keep separate counters', () => {
  beforeEach(() => {
    resetRateLimiter()
  })

  it('browsing the app does not use up the login allowance', async () => {
    const app = createApp()

    // A visitor looks at tools ten times, then logs in within the same minute
    await repeat(10, () => request(app).get('/api/tools'))
    const logins = await repeat(5, () => request(app).post('/api/auth/login'))

    expect(logins).toEqual([200, 200, 200, 200, 200])
  })

  it('logging in does not use up the general allowance', async () => {
    const app = createApp()

    await repeat(5, () => request(app).post('/api/auth/login'))
    const browsing = await repeat(30, () => request(app).get('/api/tools'))

    expect(browsing.every((status) => status === 200)).toBe(true)
  })

  it('still blocks the 6th login and the 31st general request of the minute', async () => {
    const app = createApp()

    const logins = await repeat(6, () => request(app).post('/api/auth/login'))
    const browsing = await repeat(31, () => request(app).get('/api/tools'))

    expect(logins.at(-1)).toBe(429)
    expect(browsing.at(-1)).toBe(429)
    expect(browsing.slice(0, 30).every((status) => status === 200)).toBe(true)
  })
})
