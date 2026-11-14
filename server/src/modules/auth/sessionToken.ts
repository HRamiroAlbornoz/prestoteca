import { createHash } from 'node:crypto'
import type { Response } from 'express'
import jwt from 'jsonwebtoken'

// A short summary of the stored password hash. It goes inside the session token: when the password
// changes (or the account is deleted, which replaces the hash), old tokens no longer match.
// It reveals nothing useful: it is a summary of a bcrypt hash, which is already salted.
export function passwordFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16)
}

// The session token, signed in ONE place so login, register and password change can never drift apart
export function signSessionToken(userId: string, passwordHash: string, jwtSecret: string, jwtIssuer: string): string {
  return jwt.sign({ id: userId, pwf: passwordFingerprint(passwordHash) }, jwtSecret, {
    issuer: jwtIssuer,
    expiresIn: '1h',
  })
}

// The session cookie, the same everywhere a session starts or is renewed
export function setSessionCookie(res: Response, token: string): void {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600000, // 1 hour, the same as the token
  })
}
