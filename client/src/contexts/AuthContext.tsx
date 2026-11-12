import {
  createContext,
  useCallback,
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
  // true until the first answer from the server: nobody should decide "logged out" before that
  isLoading: boolean
  // Asks the server again who is logged in (after login or register). Resolves with the user, or null.
  refreshUser: () => Promise<AuthUser | null>
  // Forgets the user without asking the server: the server already said the session is over
  // (SESSION_REQUIRED). Whoever calls it decides what happens on screen first.
  markSignedOut: () => void
  // Asks the server to close the session. Says whether it did; it does NOT forget the user:
  // the caller decides the order (navigate first, then markSignedOut). 'failed' = no
  // connection or the server refused it (e.g. 429 for too many requests).
  logout: () => Promise<'closed' | 'failed'>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// The session lives in an httpOnly cookie that JavaScript cannot read.
// The only way to know who is logged in is to ask the server.
async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/me')
    if (!res.ok) return null
    const data: AuthUser = await res.json()
    return { id: data.id, name: data.name }
  } catch {
    // No connection: behave as logged out; a private page will send the user to the login
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const user = await fetchCurrentUser()
    setCurrentUser(user)
    return user
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchCurrentUser().then((user) => {
      // The component may have unmounted while the request was in flight
      if (cancelled) return
      setCurrentUser(user)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const markSignedOut = useCallback(() => {
    setCurrentUser(null)
  }, [])

  const logout = useCallback(async (): Promise<'closed' | 'failed'> => {
    try {
      // Only the server can clear an httpOnly cookie
      const res = await fetch('/api/auth/logout', { method: 'POST' })
      return res.ok ? 'closed' : 'failed'
    } catch {
      return 'failed'
    }
  }, [])

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, refreshUser, markSignedOut, logout }}>
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
