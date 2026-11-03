import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

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
  const { currentUser, isLoading, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    // Go home first: if we stayed on a private page, losing the session would send us to the login
    navigate('/')
    try {
      await logout()
    } catch {
      // No connection: the app already forgot the user (logout() clears it in any case)
    }
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
    </header>
  )
}
