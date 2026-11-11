import { useState, type FormEvent } from 'react'
import { useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchFailureCode, readApiError } from '../errors/apiError'
import { messageFor } from '../errors/messages'
import { useApiError } from '../errors/useApiError'

interface LoginFormData {
  email: string
  password: string
}

// returnTo comes from the URL, so anyone can craft it. Only same-site paths are followed:
// "//evil.com" or "https://evil.com" would turn the login into an open redirect.
function safeReturnTo(value: string | null): string {
  // Browsers read "/\" like "//", so it is rejected too
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  // Control characters (tab, newline…) are dropped by the URL parser, so "/<tab>/evil.com"
  // would become "//evil.com". Any of them means the value was crafted.
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (code < 0x20 || code === 0x7f) return '/'
  }
  return value
}

export function LoginPage() {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  })
  const [error, setError] = useState<string>('')
  // Once the person tries to log in, the "session ended" notice has done its job: it does not come back
  const [attempted, setAttempted] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser, isLoading, refreshUser } = useAuth()
  const { handle } = useApiError()
  const [searchParams] = useSearchParams()
  const returnTo = safeReturnTo(searchParams.get('returnTo'))

  // Row 8, "your session ended": only when the app itself sent the person here (router state,
  // which a crafted link cannot set) and nobody is logged in. "Not known yet" is not "nobody":
  // while the session is still being asked for, nothing is shown. The error of a new attempt replaces it.
  const sessionEnded =
    (location.state as { notice?: unknown } | null)?.notice === 'SESSION_REQUIRED' &&
    !isLoading &&
    !currentUser &&
    !attempted
  const shownError = error || (sessionEnded ? messageFor('SESSION_REQUIRED') : '')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setAttempted(true)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        // The server set the httpOnly cookie; ask it who we are before entering a private page
        await refreshUser()
        // replace: "back" after logging in does not return to the login
        navigate(returnTo, { replace: true })
      } else {
        // A wrong email or password keeps the person here, with what they typed (AC-12)
        setError(handle(await readApiError(res)) ?? '')
      }
    } catch (err) {
      const code = fetchFailureCode(err)
      if (code) setError(messageFor(code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">
          Iniciar sesión
        </h1>

        {shownError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm mb-4" role="alert">
            {shownError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-violet-600 text-white py-2 px-4 rounded-md hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? 'Ingresando...' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-4">
          ¿No tenés cuenta?{' '}
          <Link to="/register" className="text-violet-600 hover:underline">
            Crear cuenta
          </Link>
        </p>
      </div>
    </div>
  )
}
