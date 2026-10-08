import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react'

export interface AuthUser {
  id: string
  name: string
}

interface AuthContextValue {
  currentUser: AuthUser | null
  isLoading: boolean
  login: (user: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check for token in cookie on mount
    const token = document.cookie
      .split('; ')
      .find(row => row.startsWith('token='))
      ?.split('=')[1]

    if (token) {
      // Decode JWT payload to get user id
      try {
        const payload = JSON.parse(
          atob(token.split('.')[1]),
        )
        setCurrentUser({ id: payload.id, name: '' })
      } catch {
        // Invalid token, clear cookie
        document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
      }
    }
    setIsLoading(false)
  }, [])

  const login = (user: AuthUser) => {
    setCurrentUser(user)
  }

  const logout = () => {
    setCurrentUser(null)
    document.cookie = 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  }

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { currentUser, isLoading } = useAuth()

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!currentUser) {
    return null
  }

  return <>{children}</>
}
