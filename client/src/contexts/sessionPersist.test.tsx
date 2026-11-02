import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'

const TestUserDisplay = () => {
  const { currentUser } = useAuth()
  return <div data-testid="user">{currentUser?.id ?? 'no user'}</div>
}

// The real session cookie is httpOnly: JavaScript never sees it. These tests used to plant a
// readable "token" cookie and expect the app to decode it — something that never happens in a
// real browser, which is how the "logged out after every reload" bug went unnoticed.
// Now the session is whatever the server answers on GET /api/me.
describe('AuthProvider session persistence', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.cookie.split(';').forEach(c => {
      document.cookie = c
        .replace(/^ +/, '')
        .replace(/=.*/, '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/')
    })
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  it('keeps the session after a reload: the user comes from the server', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'user-42', name: 'Ana' }) })

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

  it('ignores a token cookie that JavaScript can read: only the server decides', async () => {
    document.cookie = 'token=header.eyJpZCI6InVzZXItNDIifQ.signature; Path=/'
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestUserDisplay />
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/me'))
    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('no user')
    })
  })
})
