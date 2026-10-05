import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth, ProtectedRoute } from './AuthContext'

const TestProtectedPage = () => <div data-testid="protected-content">Protected Content</div>

describe('useAuth', () => {
  it('provides currentUser, login, logout, isLoading', () => {
    let authState: ReturnType<typeof useAuth> | undefined

    const TestComponent = () => {
      authState = useAuth()
      return <div>test</div>
    }

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(authState?.currentUser).toBeNull()
    expect(typeof authState?.login).toBe('function')
    expect(typeof authState?.logout).toBe('function')
    expect(typeof authState?.isLoading).toBe('boolean')
  })
})

describe('AuthProvider', () => {
  it('provides login and logout functions', () => {
    const TestComponent = () => {
      const { login, logout } = useAuth()
      return (
        <div>
          <button onClick={() => login({ id: 'user-1', name: 'Test' })}>Login</button>
          <button onClick={logout}>Logout</button>
        </div>
      )
    }

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument()
  })
})

describe('ProtectedRoute', () => {
  it('renders child when authenticated', async () => {
    const TestComponent = () => {
      const { login } = useAuth()
      login({ id: 'user-1', name: 'Test' })
      return (
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <TestProtectedPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      )
    }

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    })
  })

  it('returns null (not rendered) when not authenticated', async () => {
    const TestComponent = () => (
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <TestProtectedPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    )

    render(
      <MemoryRouter>
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    })
  })
})
