import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { messageFor, type ClientErrorCode } from './messages'

// What the login page receives in router state when a session ended. It travels in the
// state, never in the URL, so a link built by someone else cannot show the notice.
// One constant object for the whole app, not a new one on every call.
export const SESSION_NOTICE = { notice: 'SESSION_REQUIRED' } as const

// Decides what a screen does with an error code (plan error-codes §3.5):
// - SESSION_REQUIRED: go to the login with returnTo and the notice, and forget the user, in
//   the same event. Returns null: the screen shows nothing, it is going away.
// - any other code: returns the Spanish text for the screen to show.
// It never navigates for any other code, not even another 401 (a wrong password on the login
// or a wrong current password must keep the person where they are).
export function useApiError(): { handle: (code: ClientErrorCode) => string | null } {
  const navigate = useNavigate()
  const location = useLocation()
  const { markSignedOut } = useAuth()

  const handle = useCallback(
    (code: ClientErrorCode): string | null => {
      if (code === 'SESSION_REQUIRED') {
        const returnTo = location.pathname + location.search
        // replace: "back" from the login does not return to a page that cannot load any more.
        // Navigating first and forgetting the user second, in the same event, draws both at once
        // (the router does not use transitions, see App.tsx): PrivateRoute never sees the old
        // page without a user, so it does not redirect on its own and lose the notice.
        navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true, state: SESSION_NOTICE })
        markSignedOut()
        return null
      }
      return messageFor(code)
    },
    [location.pathname, location.search, navigate, markSignedOut],
  )

  return { handle }
}
