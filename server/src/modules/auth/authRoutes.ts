import type { Request, Router } from 'express'
import express from 'express'
import type { Pool } from 'pg'
import type { UserRepository } from './userRepo.js'
import type { SessionRepository } from './sessionRepo.js'
import { AuthService, INVALID_CREDENTIALS, type AuthResult } from './authService.js'
import { AppError, sendError, sendErrorCode } from '../errors/AppError.js'
import {
  clearSessionCookie,
  hashSessionToken,
  newSessionToken,
  readSessionCookie,
  setSessionCookie,
} from './sessionToken.js'
import { isValidNeighborhood } from './neighborhoods.js'
import { withTransaction } from '../db/transaction.js'

export function authRoutes(
  userRepo: UserRepository,
  sessionRepo: Pick<SessionRepository, 'createIfPasswordCurrent' | 'deleteByTokenHash'>,
  pool: Pick<Pool, 'connect'>,
): Router {
  const service = new AuthService(userRepo)
  const router = express.Router()

  // Opens a new session and, in the SAME transaction, revokes the one this browser brought (if its
  // cookie looks like one of ours). If the password changed or the account was deleted while bcrypt
  // ran, nothing is saved and `staleError` is thrown. Returns the value for the new cookie.
  async function openSession(req: Request, auth: AuthResult, remember: boolean, staleError: Error): Promise<string> {
    const token = newSessionToken()
    const incoming = readSessionCookie(req)

    await withTransaction(pool, async (client) => {
      const created = await sessionRepo.createIfPasswordCurrent(
        auth.userId,
        auth.passwordHash,
        hashSessionToken(token),
        remember,
        new Date(),
        client,
      )
      if (!created) {
        throw staleError
      }
      if (incoming.kind === 'ok') {
        await sessionRepo.deleteByTokenHash(hashSessionToken(incoming.token), client)
      }
    })

    return token
  }

  // POST /api/auth/register
  router.post('/register', async (req, res) => {
    // Express 5 leaves req.body undefined when there is no JSON body
    const { name, email, password, neighborhood } = req.body ?? {}

    // Trim whitespace before validation (brief: "recortan antes de validar")
    // typeof guard: non-string values (number, array, object) are treated as missing
    const trimmedName = typeof name === 'string' ? name.trim() : undefined
    const trimmedEmail = typeof email === 'string' ? email.trim() : undefined
    const trimmedPassword = typeof password === 'string' ? password.trim() : undefined
    const trimmedNeighborhood = typeof neighborhood === 'string' ? neighborhood.trim() : undefined

    if (!trimmedName || !trimmedEmail || !trimmedPassword || !trimmedNeighborhood) {
      sendErrorCode(res, 'REGISTER_MISSING_FIELDS', 'Missing required fields')
      return
    }

    // Name validation: 2-50 characters
    if (trimmedName.length < 2 || trimmedName.length > 50) {
      sendErrorCode(res, 'REGISTER_NAME_LENGTH', 'El nombre debe tener entre 2 y 50 caracteres')
      return
    }

    // Password validation: 8-72 characters
    if (trimmedPassword.length < 8 || trimmedPassword.length > 72) {
      sendErrorCode(res, 'REGISTER_PASSWORD_LENGTH', 'La contraseña debe tener entre 8 y 72 caracteres')
      return
    }

    // Email length validation (RFC 5321: max 254 chars)
    if (trimmedEmail.length > 254) {
      sendErrorCode(res, 'REGISTER_EMAIL_TOO_LONG', 'Email demasiado largo')
      return
    }

    // Only the neighborhoods of the fixed list (the register screen offers the same ones)
    if (!isValidNeighborhood(trimmedNeighborhood)) {
      sendErrorCode(res, 'REGISTER_NEIGHBORHOOD_INVALID', 'Neighborhood must be one of the fixed list')
      return
    }

    // Normalize email to lowercase for case-insensitive matching
    const normalizedEmail = trimmedEmail.toLowerCase()

    try {
      const auth = await service.register({ name: trimmedName, email: normalizedEmail, password: trimmedPassword, neighborhood: trimmedNeighborhood })
      // The register screen has no "Recordarme": always a short session. If the new account vanished
      // in these milliseconds, it is a server error (500), never "invalid credentials".
      const token = await openSession(req, auth, false, new Error('Session not created for a just-registered account'))
      setSessionCookie(res, token, false)
      res.status(201).json({ message: 'Registered successfully' })
    } catch (err: unknown) {
      sendError(res, err, 'Registration failed')
    }
  })

  // POST /api/auth/login
  router.post('/login', async (req, res) => {
    // Express 5 leaves req.body undefined when there is no JSON body
    const { email, password, remember } = req.body ?? {}

    // Trim whitespace before validation
    // typeof guard: non-string values (number, array, object) are treated as missing
    const trimmedEmail = typeof email === 'string' ? email.trim() : undefined
    const trimmedPassword = typeof password === 'string' ? password.trim() : undefined

    if (!trimmedEmail || !trimmedPassword) {
      sendErrorCode(res, 'LOGIN_MISSING_FIELDS', 'Missing required fields')
      return
    }

    // "Recordarme": absent means no; otherwise it must be exactly true or false (null is not)
    if (remember !== undefined && typeof remember !== 'boolean') {
      sendErrorCode(res, 'BAD_REQUEST', 'remember must be true or false')
      return
    }
    const rememberMe = remember === true

    // Normalize email to lowercase for case-insensitive matching
    const normalizedEmail = trimmedEmail.toLowerCase()

    try {
      const auth = await service.login({ email: normalizedEmail, password: trimmedPassword })
      // The password changed (or the account was deleted) during bcrypt: the same answer as a wrong
      // password, so nothing tells the two cases apart
      const token = await openSession(req, auth, rememberMe, new AppError('INVALID_CREDENTIALS', INVALID_CREDENTIALS))
      setSessionCookie(res, token, rememberMe)
      res.status(200).json({ message: 'Logged in successfully' })
    } catch (err: unknown) {
      sendError(res, err, 'Login failed')
    }
  })

  // POST /api/auth/logout — revokes THIS session only
  router.post('/logout', async (req, res) => {
    const cookie = readSessionCookie(req)

    // No cookie, or one we never issued: there is nothing to revoke in the database
    if (cookie.kind === 'ok') {
      try {
        await sessionRepo.deleteByTokenHash(hashSessionToken(cookie.token))
      } catch (err: unknown) {
        // The session may still be valid: keep the cookie, so the screen keeps showing the session
        sendError(res, err, 'Logout failed')
        return
      }
    }

    clearSessionCookie(res)
    res.status(204).send()
  })

  return router
}
