import { useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { messageFor } from '../errors/messages'

// Shared look of every item in the bar: at least 44px tall (touch target) and a visible keyboard focus
const itemBase =
  'inline-flex items-center min-h-11 px-2 rounded-sm text-base text-gray-700 hover:text-gray-900 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600'

// NavLink calls this with isActive = true on the link of the current page.
// The current page is marked with weight and underline, never with color alone.
function navLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? `${itemBase} font-semibold text-gray-900 underline underline-offset-4` : itemBase
}

export function NavBar() {
  const { currentUser, isLoading, logout, markSignedOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // The location where "Salir" last failed. The router gives a new location object on every
  // navigation (also on "back"), so the message shows only until the person moves: comparing
  // the object, not its key, because "back" brings the old key again.
  const [logoutFailedAt, setLogoutFailedAt] = useState<typeof location | null>(null)

  async function handleLogout() {
    setLogoutFailedAt(null) // a new attempt removes the old message
    const result = await logout()
    if (result === 'failed') {
      // The server did not close the session: the person is still logged in, and is told so (AC-13)
      setLogoutFailedAt(location)
      return
    }
    // Go home and forget the user in the same event: both are drawn together, so a private
    // page never sees "no user" first (which would send the person to the login)
    navigate('/')
    markSignedOut()
  }

  return (
    <header className="bg-white border-b border-gray-200">
      <nav
        aria-label="Navegación principal"
        className="max-w-5xl mx-auto px-4 py-1 flex flex-wrap items-center justify-between gap-x-4"
      >
        <Link
          to="/"
          className="inline-flex items-center min-h-11 rounded-sm text-lg font-bold text-violet-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          Prestoteca
        </Link>

        {/* Until the server says whether there is a session, show nothing: the links would be a guess */}
        {!isLoading && (
          // -ml-2 cancels the first item's padding, so on a phone its text lines up with "Prestoteca"
          <ul className="flex flex-wrap items-center -ml-2 sm:ml-0 gap-x-1">
            {currentUser ? (
              <>
                <li><NavLink to="/publish" className={navLinkClass}>Publicar</NavLink></li>
                <li><NavLink to="/loans" className={navLinkClass}>Mis préstamos</NavLink></li>
                <li><NavLink to="/profile" className={navLinkClass}>Perfil</NavLink></li>
                <li>
                  {/* "Salir" and not "Cerrar sesión": with the long label the bar needs 3 rows at 375px */}
                  <button type="button" onClick={handleLogout} className={itemBase}>
                    Salir
                  </button>
                </li>
              </>
            ) : (
              <>
                <li><NavLink to="/login" className={navLinkClass}>Iniciar sesión</NavLink></li>
                <li><NavLink to="/register" className={navLinkClass}>Crear cuenta</NavLink></li>
              </>
            )}
          </ul>
        )}
      </nav>
      {/* Only while there is still a session to close: if it ended some other way, the message no longer applies */}
      {currentUser && logoutFailedAt === location && (
        <div className="max-w-5xl mx-auto px-4 pb-2">
          <p className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-sm" role="alert">
            {messageFor('LOGOUT_FAILED')}
          </p>
        </div>
      )}
    </header>
  )
}
