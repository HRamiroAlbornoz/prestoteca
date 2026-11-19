import { describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import {
  clearSessionCookie,
  hashSessionToken,
  IDLE_MS,
  idleCutoffs,
  newSessionToken,
  passwordFingerprint,
  readSessionCookie,
  setSessionCookie,
} from '../src/modules/auth/sessionToken.js'
import cookieParser from 'cookie-parser'

describe('passwordFingerprint', () => {
  it('R1a gives the same output twice for the same hash', () => {
    const hash = 'hashed_test_value'
    expect(passwordFingerprint(hash)).toBe(passwordFingerprint(hash))
  })

  it('R1a matches the pattern /^[0-9a-f]{16}$/', () => {
    const fp = passwordFingerprint('any_hash')
    expect(fp).toMatch(/^[0-9a-f]{16}$/)
  })

  it('R1a gives different fingerprints for different hashes', () => {
    expect(passwordFingerprint('hash-1')).not.toBe(passwordFingerprint('hash-2'))
  })

  it('R1a does not contain the input hash', () => {
    expect(passwordFingerprint('0123456789abcdef0123')).not.toBe('0123456789abcdef')
  })
})

describe('setSessionCookie', () => {
  it('R1b sets the cookie with token value, HttpOnly, SameSite=Lax and Max-Age=3600', async () => {
    const app = express()
    app.get('/x', (_req, res) => {
      setSessionCookie(res, 'abc')
      res.end()
    })

    const res = await request(app).get('/x')

    const setCookie = res.headers['set-cookie']
    expect(setCookie).toBeDefined()
    expect(setCookie![0]).toContain('token=abc')
    expect(setCookie![0]).toContain('HttpOnly')
    expect(setCookie![0]).toContain('SameSite=Lax')
    expect(setCookie![0]).toContain('Max-Age=3600')
  })
})

// --- server sessions (T002) -------------------------------------------------------------------------

const DAY = 86_400_000
const HOUR = 3_600_000
const MINUTE = 60_000
const NOW = new Date('2026-11-18T12:00:00.000Z')

describe('newSessionToken', () => {
  it('AC-35 is 43 characters of base64url (32 random bytes, no padding)', () => {
    expect(newSessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('AC-35 never repeats (50 calls, 50 different values)', () => {
    const values = new Set(Array.from({ length: 50 }, () => newSessionToken()))
    expect(values.size).toBe(50)
  })
})

describe('hashSessionToken', () => {
  it('AC-35 gives the SHA-256 in lowercase hex (64 characters)', () => {
    // Known SHA-256 of "abc"
    expect(hashSessionToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('AC-35 gives the same hash for the same token and a different one for another token', () => {
    const token = newSessionToken()
    expect(hashSessionToken(token)).toBe(hashSessionToken(token))
    expect(hashSessionToken(token)).not.toBe(hashSessionToken(newSessionToken()))
  })

  it('AC-35 never contains the token itself', () => {
    const token = newSessionToken()
    expect(hashSessionToken(token)).not.toContain(token)
  })
})

describe('idleCutoffs', () => {
  it('AC-1 AC-23 uses exactly 7 days and 12 hours', () => {
    expect(IDLE_MS).toEqual({ remember: 7 * DAY, short: 12 * HOUR })
  })

  it('AC-2 rememberCutoff is exactly 7 days before now', () => {
    expect(idleCutoffs(NOW).rememberCutoff.getTime()).toBe(NOW.getTime() - 7 * DAY)
  })

  it('AC-23 shortCutoff is exactly 12 hours before now', () => {
    expect(idleCutoffs(NOW).shortCutoff.getTime()).toBe(NOW.getTime() - 12 * HOUR)
  })

  it('AC-1 a session used 6 d 23 h ago is still after the remember cutoff', () => {
    const lastUsed = NOW.getTime() - (6 * DAY + 23 * HOUR)
    expect(lastUsed > idleCutoffs(NOW).rememberCutoff.getTime()).toBe(true)
  })

  it('AC-2 a session used exactly 7 d ago is NOT after the remember cutoff (it is expired)', () => {
    const lastUsed = NOW.getTime() - 7 * DAY
    expect(lastUsed > idleCutoffs(NOW).rememberCutoff.getTime()).toBe(false)
  })

  it('AC-23 a short session used 11 h 59 min ago is still after the short cutoff', () => {
    const lastUsed = NOW.getTime() - (11 * HOUR + 59 * MINUTE)
    expect(lastUsed > idleCutoffs(NOW).shortCutoff.getTime()).toBe(true)
  })

  it('AC-23 a short session used exactly 12 h ago is NOT after the short cutoff (it is expired)', () => {
    const lastUsed = NOW.getTime() - 12 * HOUR
    expect(lastUsed > idleCutoffs(NOW).shortCutoff.getTime()).toBe(false)
  })

  it('§0 does not change the date it receives', () => {
    const now = new Date(NOW.getTime())
    idleCutoffs(now)
    expect(now.getTime()).toBe(NOW.getTime())
  })
})

describe('readSessionCookie', () => {
  // A real Express app with cookie-parser, as the server uses it
  function cookieApp() {
    const app = express()
    app.use(cookieParser())
    app.get('/read', (req, res) => {
      res.json(readSessionCookie(req))
    })
    return app
  }

  it('§3.1 no token cookie → none', async () => {
    const res = await request(cookieApp()).get('/read')
    expect(res.body).toEqual({ kind: 'none' })
  })

  it('§3.1 a valid 43-character value → ok, with the value', async () => {
    const token = newSessionToken()
    const res = await request(cookieApp()).get('/read').set('Cookie', `token=${token}`)
    expect(res.body).toEqual({ kind: 'ok', token })
  })

  it('AC-10 an old JWT cookie → malformed', async () => {
    const jwtShaped = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IngifQ.c2lnbmF0dXJlLXRoYXQtaXMtbm90LXJlYWw'
    const res = await request(cookieApp()).get('/read').set('Cookie', `token=${jwtShaped}`)
    expect(res.body).toEqual({ kind: 'malformed' })
  })

  it('AC-10 a j:{} cookie (cookie-parser turns it into an object) → malformed', async () => {
    const res = await request(cookieApp()).get('/read').set('Cookie', 'token=j:{}')
    expect(res.body).toEqual({ kind: 'malformed' })
  })

  it('AC-10 a j:[…] cookie holding a valid value (cookie-parser turns it into an array) → malformed', async () => {
    // String(['<valid>']) equals '<valid>', so only the typeof check can reject it
    const res = await request(cookieApp()).get('/read').set('Cookie', `token=j:["${newSessionToken()}"]`)
    expect(res.body).toEqual({ kind: 'malformed' })
  })

  it('§3.1 a fixed 43-character value with - and _ → ok (the whole base64url alphabet is accepted)', async () => {
    const token = `${'a-b_'.repeat(10)}Z9-` // 43 characters, includes both - and _
    const res = await request(cookieApp()).get('/read').set('Cookie', `token=${token}`)
    expect(res.body).toEqual({ kind: 'ok', token })
  })

  it('§3.1 an empty token cookie → malformed, not none', async () => {
    const res = await request(cookieApp()).get('/read').set('Cookie', 'token=')
    expect(res.body).toEqual({ kind: 'malformed' })
  })

  it('§3.1 42 or 44 characters, or a character outside base64url → malformed', async () => {
    const valid = newSessionToken()
    for (const value of [valid.slice(0, 42), `${valid}A`, `${valid.slice(0, 42)}+`, `${valid.slice(0, 42)}.`]) {
      const res = await request(cookieApp()).get('/read').set('Cookie', `token=${value}`)
      expect(res.body, value).toEqual({ kind: 'malformed' })
    }
  })
})

describe('clearSessionCookie', () => {
  function clearApp() {
    const app = express()
    app.get('/clear', (_req, res) => {
      clearSessionCookie(res)
      res.end()
    })
    return app
  }

  it('AC-14 clears the token cookie: empty value, past expiry, HttpOnly, SameSite=Lax, Path=/', async () => {
    const res = await request(clearApp()).get('/clear')
    const cookie = res.headers['set-cookie']![0]
    expect(cookie).toMatch(/^token=;/)
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Max-Age')
  })

  it('AC-14 is not Secure outside production', async () => {
    const res = await request(clearApp()).get('/clear')
    expect(res.headers['set-cookie']![0]).not.toContain('Secure')
  })

  it('AC-14 is Secure in production, reading NODE_ENV at each call', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const res = await request(clearApp()).get('/clear')
      expect(res.headers['set-cookie']![0]).toContain('Secure')
    } finally {
      vi.unstubAllEnvs()
    }
    // Same module, back outside production: no Secure again
    const after = await request(clearApp()).get('/clear')
    expect(after.headers['set-cookie']![0]).not.toContain('Secure')
  })
})
