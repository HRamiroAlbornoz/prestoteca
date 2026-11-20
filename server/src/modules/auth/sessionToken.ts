import { createHash, randomBytes } from 'node:crypto'
import type { Request, Response } from 'express'

// Server sessions (spec server-sessions, decision D14).
// The browser keeps a random value in the `token` cookie; the server keeps only its SHA-256.

const SESSION_COOKIE = 'token'

// 32 random bytes in base64url are always 43 characters from this alphabet
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

// How long a session may go unused: 7 days with "Recordarme", 12 hours without it
export const IDLE_MS = { remember: 604_800_000, short: 43_200_000 } as const

// A new session value: 32 random bytes, impossible to guess
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

// What the database stores instead of the value: its SHA-256, 64 lowercase hex characters
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// The two moments that decide whether a session is still in use: last used AFTER the cutoff = still valid.
// Every SQL statement that checks a session receives these two dates; the rule lives only here.
export function idleCutoffs(now: Date): { rememberCutoff: Date; shortCutoff: Date } {
  return {
    rememberCutoff: new Date(now.getTime() - IDLE_MS.remember),
    shortCutoff: new Date(now.getTime() - IDLE_MS.short),
  }
}

export type SessionCookie = { kind: 'none' } | { kind: 'malformed' } | { kind: 'ok'; token: string }

// Reads the token cookie. Anything that is not a value we could have issued (an old JWT, an object that
// cookie-parser built from "j:…", an empty value) is "malformed": it never reaches the database.
export function readSessionCookie(req: Request): SessionCookie {
  const value: unknown = req.cookies?.[SESSION_COOKIE]
  if (value === undefined) {
    return { kind: 'none' }
  }
  if (typeof value === 'string' && SESSION_TOKEN_PATTERN.test(value)) {
    return { kind: 'ok', token: value }
  }
  return { kind: 'malformed' }
}

// Built at each call, never stored in a constant: `secure` must read NODE_ENV at that moment
function sessionCookieAttributes(): { httpOnly: true; secure: boolean; sameSite: 'lax'; path: '/' } {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  }
}

// Sets (or renews) the session cookie. With "Recordarme" it lasts 7 days in the browser;
// without it, it has no expiry at all, so the browser forgets it when it closes.
export function setSessionCookie(res: Response, token: string, remember: boolean): void {
  const attributes = sessionCookieAttributes()
  if (remember) {
    res.cookie(SESSION_COOKIE, token, { ...attributes, maxAge: IDLE_MS.remember })
  } else {
    res.cookie(SESSION_COOKIE, token, attributes)
  }
}

// Removes the token cookie with the same attributes it is set with (Express 5 ignores only maxAge/expires)
export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, sessionCookieAttributes())
}
