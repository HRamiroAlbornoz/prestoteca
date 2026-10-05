import { describe, expect, it, afterEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/index.js'

describe('health endpoint', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  })

  function setBaseEnv() {
    process.env.PORT = '3001'
    process.env.DATABASE_URL = 'postgresql://localhost/test'
    process.env.JWT_SECRET = 'a'.repeat(32)
    process.env.NODE_ENV = 'test'
  }

  it('returns status ok with db connected when DB is reachable', async () => {
    setBaseEnv()
    const app = await createApp()
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('status', 'ok')
    expect(res.body).toHaveProperty('db')
    // DB status should be "connected" or "disconnected"
    expect(['connected', 'disconnected']).toContain(res.body.db)
  })

  it('returns status ok with db disconnected when DB URL is invalid', async () => {
    setBaseEnv()
    process.env.DATABASE_URL = 'postgresql://invalid:invalid@localhost:9999/nonexistent'

    const app = await createApp()
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('status', 'ok')
    expect(res.body.db).toBe('disconnected')
  })
})
