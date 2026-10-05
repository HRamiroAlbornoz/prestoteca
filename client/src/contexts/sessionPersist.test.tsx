import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'

const TestUserDisplay = () => {
  const { currentUser } = useAuth()
  return <div data-testid="user">{currentUser?.id ?? 'no user'}</div>
}

describe('AuthProvider session persistence', () => {
  beforeEach(() => {
    // Clear all cookies before each test
    document.cookie.split(';').forEach(c => {
      document.cookie = c
        .replace(/^ +/, '')
        .replace(/=.*/, '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/')
    })
  })

  it('loads user from JWT cookie on mount', async () => {
    // Create a fake JWT token: header.payload.signature
    // header: {"alg":"HS256","typ":"JWT"}
    // payload: {"id":"user-42","iat":1000000}
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = btoa(JSON.stringify({ id: 'user-42', iat: 1000000 }))
    const token = `${header}.${payload}.fakesignature`

    document.cookie = `token=${token}; Path=/`

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestUserDisplay />
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('user-42')
    })
  })

  it('does not set user when cookie is missing', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <TestUserDisplay />
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('no user')
    })
  })

  it('does not set user when cookie has invalid token', async () => {
    document.cookie = 'token=invalidtoken; Path=/'

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestUserDisplay />
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('no user')
    })
  })
})
