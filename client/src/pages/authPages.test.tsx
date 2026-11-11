import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RegisterPage } from './RegisterPage'
import { LoginPage } from './LoginPage'
import { MESSAGES } from '../errors/messages'

// The pages ask the AuthContext to refresh the user after a successful login or register.
// A fake context keeps these tests about the forms; App.test.tsx covers the real one.
const refreshUser = vi.fn(async () => null)
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: null, isLoading: false, refreshUser, logout: vi.fn() }),
}))

describe('RegisterPage', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch as unknown as typeof fetch)
  })

  it('renders all form fields', () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText(/nombre completo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/barrio/i)).toBeInTheDocument()
  })

  it('calls POST /api/auth/register on submit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Registered' }),
    })

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre completo/i), {
      target: { value: 'Ana García' },
    })
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'ana@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'ana123' },
    })
    fireEvent.change(screen.getByLabelText(/barrio/i), {
      target: { value: 'Centro' },
    })
    fireEvent.click(screen.getByRole('button', { name: /registrarse/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Ana García',
          email: 'ana@example.com',
          password: 'ana123',
          neighborhood: 'Centro',
        }),
      })
    })
  })

  // C1: register 400 for each code — exact text in role="alert", English server text absent
  it.each([
    ['REGISTER_MISSING_FIELDS', { code: 'REGISTER_MISSING_FIELDS', message: 'Missing fields' }, MESSAGES.REGISTER_MISSING_FIELDS],
    ['REGISTER_NAME_LENGTH', { code: 'REGISTER_NAME_LENGTH', message: 'Name too long' }, MESSAGES.REGISTER_NAME_LENGTH],
    ['REGISTER_PASSWORD_LENGTH', { code: 'REGISTER_PASSWORD_LENGTH', message: 'Password too short' }, MESSAGES.REGISTER_PASSWORD_LENGTH],
    ['REGISTER_EMAIL_TOO_LONG', { code: 'REGISTER_EMAIL_TOO_LONG', message: 'Email too long' }, MESSAGES.REGISTER_EMAIL_TOO_LONG],
  ])('shows %s text in role="alert", never the English server text', async (_name, errorBody, text) => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: errorBody }),
    })

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre completo/i), {
      target: { value: 'Ana' },
    })
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'ana@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'ana123' },
    })
    fireEvent.change(screen.getByLabelText(/barrio/i), {
      target: { value: 'Centro' },
    })
    fireEvent.click(screen.getByRole('button', { name: /registrarse/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(text)
    })
    expect(screen.queryByText(errorBody.message)).not.toBeInTheDocument()
  })

  // C2: register 409 EMAIL_TAKEN — email still in the field
  it('shows EMAIL_TAKEN text and keeps the email in the field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'EMAIL_TAKEN', message: 'Email already exists' } }),
    })

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre completo/i), {
      target: { value: 'Ana García' },
    })
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'ana@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'ana123' },
    })
    fireEvent.change(screen.getByLabelText(/barrio/i), {
      target: { value: 'Centro' },
    })
    fireEvent.click(screen.getByRole('button', { name: /registrarse/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.EMAIL_TAKEN)
    })
    expect(screen.getByLabelText(/email/i)).toHaveValue('ana@example.com')
    expect(screen.queryByText('Email already exists')).not.toBeInTheDocument()
  })

  // C3: RATE_LIMITED and NETWORK_ERROR
  it('shows RATE_LIMITED text on 429', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }),
    })

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre completo/i), {
      target: { value: 'Ana García' },
    })
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'ana@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'ana123' },
    })
    fireEvent.change(screen.getByLabelText(/barrio/i), {
      target: { value: 'Centro' },
    })
    fireEvent.click(screen.getByRole('button', { name: /registrarse/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.RATE_LIMITED)
    })
    expect(screen.queryByText('Too many requests')).not.toBeInTheDocument()
  })

  it('shows NETWORK_ERROR text when fetch rejects', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre completo/i), {
      target: { value: 'Ana García' },
    })
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'ana@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'ana123' },
    })
    fireEvent.change(screen.getByLabelText(/barrio/i), {
      target: { value: 'Centro' },
    })
    fireEvent.click(screen.getByRole('button', { name: /registrarse/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.NETWORK_ERROR)
    })
  })
})

describe('LoginPage', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch as unknown as typeof fetch)
  })

  it('renders all form fields', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
  })

  it('calls POST /api/auth/login on submit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Logged in' }),
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'carlos@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'carlos123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'carlos@example.com',
          password: 'carlos123',
        }),
      })
    })
  })

  it('displays error on failed login', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Invalid password' } }),
    })

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'maria@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'wrongpassword' },
    })
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
