import { describe, expect, it, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { passwordFingerprint, setSessionCookie } from '../src/modules/auth/sessionToken.js'

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
