import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import App from './App'
import { MESSAGES } from './errors/messages'

// The session journeys of spec error-codes (AC-11, AC-12, AC-13), with the real App: real
// BrowserRouter (useTransitions={false}), real PrivateRoute, real AuthProvider and NavBar.
// Only the server is fake. The path is set with history.pushState, as in App.test.tsx.

const SESSION_ENDED = MESSAGES.SESSION_REQUIRED // row 8

type Reply = { status: number; body?: unknown }

let state: {
  user: { id: string; name: string } | null // who /api/me answers
  tokenValid: boolean // whether private requests are accepted
  logout: Reply | 'network-down' | 'never-answers'
  login: Reply
}
let fetchMock: ReturnType<typeof vi.fn>

function reply({ status, body }: Reply) {
  return Promise.resolve(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

const sessionRequired: Reply = { status: 401, body: { error: { code: 'SESSION_REQUIRED', message: 'Invalid or expired token' } } }

function installFakeServer() {
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/me') {
      return state.user ? reply({ status: 200, body: state.user }) : reply(sessionRequired)
    }
    if (url === '/api/auth/login' && method === 'POST') {
      if (state.login.status === 200) {
        state.user = { id: 'user-1', name: 'Ana' }
        state.tokenValid = true
      }
      return reply(state.login)
    }
    if (url === '/api/auth/logout' && method === 'POST') {
      if (state.logout === 'network-down') return Promise.reject(new TypeError('Failed to fetch'))
      if (state.logout === 'never-answers') return new Promise(() => {})
      if (state.logout.status === 204) state.user = null
      return reply(state.logout)
    }
    // A loan of user-1: private, refused once the token is no longer valid
    if (url === '/api/loans/42') {
      if (!state.tokenValid) return reply(sessionRequired)
      return reply({
        status: 200,
        body: {
          id: '42', tool_id: '7', tool_name: 'Taladro', borrower_id: 'user-1', owner_id: 'user-2',
          start_date: '2030-01-10', end_date: '2030-01-20', status: 'pendiente', note: null,
          created_at: '2030-01-01T00:00:00Z', updated_at: '2030-01-01T00:00:00Z',
        },
      })
    }
    // A tool of user-1: its detail is public, pausing or deleting it needs a session
    if (url === '/api/tools/7') {
      if (method === 'PATCH' || method === 'DELETE') {
        return state.tokenValid ? reply({ status: 200, body: {} }) : reply(sessionRequired)
      }
      return reply({
        status: 200,
        body: {
          id: '7', name: 'Taladro', description: 'Percutor', category: 'Herramientas eléctricas',
          condition: 'bueno', owner_id: 'user-1', is_paused: false, created_at: '2030-01-01T00:00:00Z',
        },
      })
    }
    if (url === '/api/me/tools') return reply({ status: 200, body: { tools: [], receivedLoans: [], madeLoans: [] } })
    if (url === '/api/me/history') return reply({ status: 200, body: [] })
    if (url.startsWith('/api/loans?type=')) return reply({ status: 200, body: [] })
    if (url.startsWith('/api/tools?')) return reply({ status: 200, body: { items: [], total: 0, page: 1, pages: 1 } })
    return reply({ status: 404, body: { error: { code: 'API_ROUTE_NOT_FOUND', message: 'API route not found' } } })
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
}

function renderAt(path: string) {
  window.history.pushState({}, '', path)
  render(<App />)
}

function nav() {
  return screen.getByRole('navigation', { name: /principal/i })
}

async function logIn() {
  fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'ana@example.com' } })
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'ana12345' } })
  fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))
}

beforeEach(() => {
  // The session looks open to the client (/api/me answers), but the token is no longer valid
  state = {
    user: { id: 'user-1', name: 'Ana' },
    tokenValid: false,
    logout: { status: 204 },
    login: { status: 200, body: { message: 'Logged in successfully' } },
  }
  installFakeServer()
})

describe('AC-11: the session ends during an action → login with the notice → back', () => {
  it('from a private page (/loans/42): goes to the login with returnTo and the notice, then back', async () => {
    renderAt('/loans/42')

    expect(await screen.findByText(SESSION_ENDED)).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/loans/42')
    expect(screen.getByRole('alert')).toHaveTextContent(SESSION_ENDED)
    // The bar forgot the user
    expect(within(nav()).getByRole('link', { name: /iniciar sesión/i })).toBeInTheDocument()

    await logIn()

    await waitFor(() => expect(window.location.pathname).toBe('/loans/42'))
    expect(screen.queryByText(SESSION_ENDED)).not.toBeInTheDocument()
  })

  it('from a public page (/tools/7): the failed action leads to the login and back', async () => {
    renderAt('/tools/7')
    fireEvent.click(await screen.findByRole('button', { name: /pausar/i }))

    expect(await screen.findByText(SESSION_ENDED)).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/tools/7')

    await logIn()

    await waitFor(() => expect(window.location.pathname).toBe('/tools/7'))
  })

  it('after logging back in, "back" skips the login and returns to the page before', async () => {
    // A known page before: the login and the failed page both replace their entry, so "back"
    // lands here. Without replace, it would land on the login form again.
    window.history.pushState({}, '', '/')
    renderAt('/loans/42')
    await screen.findByText(SESSION_ENDED)
    await logIn()
    await waitFor(() => expect(window.location.pathname).toBe('/loans/42'))

    window.history.back()

    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(screen.queryByText(SESSION_ENDED)).not.toBeInTheDocument()
  })

  it('does not show the notice to someone who is logged in, even with the notice in router state', async () => {
    state.tokenValid = true
    // The same router state useApiError leaves (React Router keeps it under "usr")
    window.history.pushState({ usr: { notice: 'SESSION_REQUIRED' }, key: 'test', idx: 0 }, '', '/login')
    render(<App />)

    await screen.findByRole('heading', { name: /iniciar sesión/i })
    await within(nav()).findByRole('button', { name: /^salir$/i }) // the session is known
    expect(screen.queryByText(SESSION_ENDED)).not.toBeInTheDocument()
  })

  it('does not show the notice while it is not known yet whether there is a session', async () => {
    window.history.pushState({ usr: { notice: 'SESSION_REQUIRED' }, key: 'test', idx: 0 }, '', '/login')
    // /api/me never answers: the app stays in "not known yet"
    fetchMock.mockImplementation(() => new Promise(() => {}))
    render(<App />)

    await screen.findByRole('heading', { name: /iniciar sesión/i })
    expect(screen.queryByText(SESSION_ENDED)).not.toBeInTheDocument()
  })

  it('shows the notice when the router state says so and there is no session (the guard above can fail)', async () => {
    state.user = null
    window.history.pushState({ usr: { notice: 'SESSION_REQUIRED' }, key: 'test', idx: 0 }, '', '/login')
    render(<App />)

    expect(await screen.findByText(SESSION_ENDED)).toBeInTheDocument()
  })

  it('keeps the query string of the page in returnTo', async () => {
    renderAt('/tools/7?desde=listado')
    fireEvent.click(await screen.findByRole('button', { name: /pausar/i }))

    await screen.findByText(SESSION_ENDED)
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/tools/7?desde=listado')
  })

  it('a failed delete with the session ended also leads to the login', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderAt('/tools/7')
    fireEvent.click(await screen.findByRole('button', { name: /eliminar/i }))

    expect(await screen.findByText(SESSION_ENDED)).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/tools/7')
  })

  it('a login link built by someone else cannot show the notice (it travels in router state, not the URL)', async () => {
    state.user = null
    renderAt('/login?returnTo=%2Floans%2F42&notice=SESSION_REQUIRED')

    await screen.findByRole('heading', { name: /iniciar sesión/i })
    expect(screen.queryByText(SESSION_ENDED)).not.toBeInTheDocument()
  })

  it('"Iniciar sesión para pedir" goes to the login with returnTo (not returnUrl) and without the notice', async () => {
    state.user = null
    renderAt('/tools/7')

    fireEvent.click(await screen.findByRole('link', { name: /iniciar sesión para pedir/i }))

    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/tools/7')
    expect(screen.queryByText(SESSION_ENDED)).not.toBeInTheDocument()
  })
})

describe('AC-12: a failed login stays on the login and keeps the email', () => {
  it('shows row 7, does not navigate and keeps the email that was typed', async () => {
    state.user = null
    state.login = { status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } } }
    renderAt('/login?returnTo=%2Floans')

    await logIn()

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGES.INVALID_CREDENTIALS)
    expect(window.location.pathname).toBe('/login')
    expect(screen.getByLabelText(/email/i)).toHaveValue('ana@example.com')
  })

  it('replaces the notice with the error of the next attempt', async () => {
    renderAt('/loans/42')
    await screen.findByText(SESSION_ENDED)
    state.login = { status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } } }

    await logIn()

    expect(await screen.findByText(MESSAGES.INVALID_CREDENTIALS)).toBeInTheDocument()
    expect(screen.queryByText(SESSION_ENDED)).not.toBeInTheDocument()
  })

  it('does not show the notice again while a second attempt is in flight', async () => {
    renderAt('/loans/42')
    await screen.findByText(SESSION_ENDED)
    state.login = { status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } } }
    await logIn()
    await screen.findByText(MESSAGES.INVALID_CREDENTIALS)

    // The next attempt never answers: the screen stays as it is while waiting
    fetchMock.mockImplementation((url: string) =>
      url === '/api/auth/login' ? new Promise(() => {}) : reply(sessionRequired),
    )
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await screen.findByRole('button', { name: /ingresando/i })
    expect(screen.queryByText(SESSION_ENDED)).not.toBeInTheDocument()
  })

  it.each([
    ['too many attempts', { status: 429, body: { error: { code: 'RATE_LIMITED', message: 'Too many' } } }, MESSAGES.RATE_LIMITED],
    ['a body without the catalog shape', { status: 502, body: '<html>Bad Gateway</html>' }, MESSAGES.UNKNOWN_ERROR],
  ])('shows its Spanish message for %s, never the server text', async (_case, login, text) => {
    state.user = null
    state.login = login
    renderAt('/login')

    await logIn()

    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })

  it('shows row 36 when there is no connection', async () => {
    state.user = null
    renderAt('/login')
    await screen.findByRole('heading', { name: /iniciar sesión/i })
    fetchMock.mockImplementation((url: string) =>
      url === '/api/auth/login' ? Promise.reject(new TypeError('Failed to fetch')) : reply(sessionRequired),
    )

    await logIn()

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGES.NETWORK_ERROR)
  })
})

describe('AC-13: "Salir"', () => {
  beforeEach(() => {
    state.tokenValid = true
  })

  it.each([
    ['the connection is down', 'network-down' as const],
    ['the server refuses it (429)', { status: 429, body: { error: { code: 'RATE_LIMITED', message: 'Too many' } } }],
  ])('when %s, keeps the session and says so with row 10', async (_case, logout) => {
    state.logout = logout
    renderAt('/profile')
    await screen.findByRole('heading', { name: /mi perfil/i })

    fireEvent.click(within(nav()).getByRole('button', { name: /^salir$/i }))

    expect(await screen.findByText(MESSAGES.LOGOUT_FAILED)).toBeInTheDocument()
    expect(screen.getByText(MESSAGES.LOGOUT_FAILED).closest('[role="alert"]')).not.toBeNull()
    expect(within(nav()).getByRole('button', { name: /^salir$/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/profile')
  })

  it('removes the failure message as soon as the next attempt starts', async () => {
    state.logout = 'network-down'
    renderAt('/profile')
    await screen.findByRole('heading', { name: /mi perfil/i })
    fireEvent.click(within(nav()).getByRole('button', { name: /^salir$/i }))
    await screen.findByText(MESSAGES.LOGOUT_FAILED)

    // The next attempt never answers: the page does not move, so only the new attempt can clear it
    state.logout = 'never-answers'
    fireEvent.click(within(nav()).getByRole('button', { name: /^salir$/i }))

    await waitFor(() => expect(screen.queryByText(MESSAGES.LOGOUT_FAILED)).not.toBeInTheDocument())
    expect(window.location.pathname).toBe('/profile')
  })

  it('removes the failure message when the person navigates, and "back" does not bring it again', async () => {
    state.logout = 'network-down'
    renderAt('/profile')
    await screen.findByRole('heading', { name: /mi perfil/i })
    fireEvent.click(within(nav()).getByRole('button', { name: /^salir$/i }))
    await screen.findByText(MESSAGES.LOGOUT_FAILED)

    fireEvent.click(within(nav()).getByRole('link', { name: /mis préstamos/i }))
    await screen.findByRole('heading', { name: /mis préstamos/i })
    expect(screen.queryByText(MESSAGES.LOGOUT_FAILED)).not.toBeInTheDocument()

    window.history.back()
    await screen.findByRole('heading', { name: /mi perfil/i })
    expect(screen.queryByText(MESSAGES.LOGOUT_FAILED)).not.toBeInTheDocument()
  })

  it('that works, from a private page, ends on the home page and not on the login', async () => {
    renderAt('/profile')
    await screen.findByRole('heading', { name: /mi perfil/i })

    fireEvent.click(within(nav()).getByRole('button', { name: /^salir$/i }))

    expect(await within(nav()).findByRole('link', { name: /iniciar sesión/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('then "back" to a private page (even repeated in the history) leads to the login without the notice', async () => {
    window.history.pushState({}, '', '/loans')
    renderAt('/loans')
    await screen.findByRole('heading', { name: /mis préstamos/i })
    fireEvent.click(within(nav()).getByRole('button', { name: /^salir$/i }))
    await waitFor(() => expect(window.location.pathname).toBe('/'))

    window.history.back()

    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/loans')
    expect(screen.queryByText(SESSION_ENDED)).not.toBeInTheDocument()
  })
})

describe('F3 focus after the session ends', () => {
  it('F3e moves focus to <main> when the session ends and redirects to login', async () => {
    renderAt('/tools/7')
    const pause = await screen.findByRole('button', { name: /pausar/i })
    pause.focus()

    fireEvent.click(pause)

    expect(await screen.findByText(SESSION_ENDED)).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('main')))
    expect(screen.getByRole('alert')).toHaveTextContent(SESSION_ENDED)
  })
})
