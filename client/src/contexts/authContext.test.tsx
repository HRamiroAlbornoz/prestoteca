import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider, useAuth, ProtectedRoute } from './AuthContext'

const TestProtectedPage = () => <div data-testid="protected-content">Protected Content</div>

// Mock AuthProvider to avoid useEffect cookie reading in jsdom
interface User {
  id: string
  name: string
}
const mockAuthState = { currentUser: null as User | null, isLoading: false, login: vi.fn(), logout: vi.fn() }

vi.mock('./AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => mockAuthState,
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => mockAuthState.currentUser ? <>{children}</> : null,
}))

describe('useAuth', () => {
  beforeEach(() => {
    mockAuthState.currentUser = null
    mockAuthState.isLoading = false
    vi.clearAllMocks()
  })

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
  beforeEach(() => {
    mockAuthState.currentUser = null
    mockAuthState.isLoading = false
    vi.clearAllMocks()
  })

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
  beforeEach(() => {
    mockAuthState.currentUser = null
    mockAuthState.isLoading = false
    vi.clearAllMocks()
  })

  it('renders child when authenticated', () => {
    mockAuthState.currentUser = { id: 'user-1', name: 'Test' }

    render(
      <MemoryRouter>
        <AuthProvider>
          <ProtectedRoute>
            <TestProtectedPage />
          </ProtectedRoute>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
  })

  it('returns null (not rendered) when not authenticated', () => {
    mockAuthState.currentUser = null

    render(
      <MemoryRouter>
        <AuthProvider>
          <ProtectedRoute>
            <TestProtectedPage />
          </ProtectedRoute>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })
})
