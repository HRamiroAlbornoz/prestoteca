import type { Router } from 'express'
import express from 'express'
import type { UserRepository } from './userRepo.js'
import { AuthService } from './authService.js'
import { sendError, sendErrorCode } from '../errors/AppError.js'

export function authRoutes(
  userRepo: UserRepository,
  jwtSecret: string,
  jwtIssuer: string,
): Router {
  const service = new AuthService(userRepo, jwtSecret, jwtIssuer)
  const router = express.Router()

  // POST /api/auth/register
  router.post('/register', async (req, res) => {
    const { name, email, password, neighborhood } = req.body

    // Trim whitespace before validation (brief: "recortan antes de validar")
    const trimmedName = name?.trim()
    const trimmedEmail = email?.trim()
    const trimmedPassword = password?.trim()
    const trimmedNeighborhood = neighborhood?.trim()

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

    // Normalize email to lowercase for case-insensitive matching
    const normalizedEmail = trimmedEmail.toLowerCase()

    try {
      const result = await service.register({ name: trimmedName, email: normalizedEmail, password: trimmedPassword, neighborhood: trimmedNeighborhood })
      res.cookie('token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600000, // 1 hour
      })
      res.status(201).json({ message: 'Registered successfully' })
    } catch (err: unknown) {
      sendError(res, err, 'Registration failed')
    }
  })

  // POST /api/auth/login
  router.post('/login', async (req, res) => {
    const { email, password } = req.body

    // Trim whitespace before validation
    const trimmedEmail = email?.trim()
    const trimmedPassword = password?.trim()

    if (!trimmedEmail || !trimmedPassword) {
      sendErrorCode(res, 'LOGIN_MISSING_FIELDS', 'Missing required fields')
      return
    }

    // Normalize email to lowercase for case-insensitive matching
    const normalizedEmail = trimmedEmail.toLowerCase()

    try {
      const result = await service.login({ email: normalizedEmail, password: trimmedPassword })
      res.cookie('token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600000, // 1 hour
      })
      res.status(200).json({ message: 'Logged in successfully' })
    } catch (err: unknown) {
      sendError(res, err, 'Login failed')
    }
  })

  // POST /api/auth/logout
  router.post('/logout', (_req, res) => {
    res.clearCookie('token')
    res.status(204).send()
  })

  return router
}
