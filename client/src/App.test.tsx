import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import App from './App'

// These tests render the real App: real routes, real PrivateRoute, real AuthProvider.
// The session cookie is httpOnly, so the client can only learn who is logged in by asking
// GET /api/me. That is the only thing the fake server below decides.

type User = { id: string; name: string } | null

let sessionUser: User = null
let fetchMock: ReturnType<typeof vi.fn>

function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body })
}

function installFakeServer() {
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/me') return sessionUser ? json(200, sessionUser) : json(401, { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
    if (url === '/api/auth/login' && method === 'POST') {
      sessionUser = { id: 'user-1', name: 'Ana' }
      return json(200, { message: 'Logged in successfully' })
    }
    if (url === '/api/auth/logout' && method === 'POST') {
      sessionUser = null
      return Promise.resolve({ ok: true, status: 204, json: async () => ({}) })
    }
    // Same shapes as the real server (meRoutes.ts)
    if (url === '/api/me/tools') return json(200, { tools: [], receivedLoans: [], madeLoans: [] })
    if (url === '/api/me/history') return json(200, [])
    if (url.startsWith('/api/loans?type=')) return json(200, [])
    if (url === '/api/loans/loan-1') {
      return json(200, {
        id: 'loan-1', tool_id: 'tool-1', borrower_id: 'user-1', owner_id: 'user-2',
        start_date: '2030-01-10', end_date: '2030-01-20', status: 'pendiente', note: null,
        created_at: '2030-01-01T00:00:00Z', updated_at: '2030-01-01T00:00:00Z',
      })
    }
    if (url === '/api/tools/tool-1') return json(200, { id: 'tool-1', name: 'Taladro', owner_id: 'user-2' })
    if (url.startsWith('/api/tools?')) return json(200, { items: [], total: 0, page: 1, pages: 1 })
    return json(404, { error: { code: 'NOT_FOUND', message: 'Not found' } })
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
}

function renderAt(path: string) {
  window.history.pushState({}, '', path)
  render(<App />)
}

describe('App routes and session', () => {
  beforeEach(() => {
    sessionUser = null
    installFakeServer()
  })

  it('opens a private page when the server says there is a session (also after a reload)', async () => {
    sessionUser = { id: 'user-1', name: 'Ana' }
    renderAt('/profile')

    expect(await screen.findByRole('heading', { name: /mi perfil/i })).toBeInTheDocument()
  })

  it('sends a visitor without a session to the login page, remembering where they were going', async () => {
    renderAt('/profile')

    expect(await screen.findByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/profile')
  })

  it('after logging in, goes to the page it came from and stays there', async () => {
    renderAt('/login?returnTo=%2Fprofile')

    fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'ana@example.com' } })
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'secret-123' } })
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    expect(await screen.findByRole('heading', { name: /mi perfil/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/profile')
  })

  it.each(['//evil.example', 'https://evil.example', '/\\evil.example'])(
    'after logging in with returnTo=%s, stays on this site',
    async (returnTo) => {
      renderAt(`/login?returnTo=${encodeURIComponent(returnTo)}`)

      fireEvent.change(await screen.findByLabelText(/email/i), { target: { value: 'ana@example.com' } })
      fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'secret-123' } })
      fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))

      await waitFor(() => expect(window.location.pathname).toBe('/'))
      expect(window.location.origin).toBe('http://localhost:3000')
    },
  )

  it('has a route for "Mis préstamos"', async () => {
    sessionUser = { id: 'user-1', name: 'Ana' }
    renderAt('/loans')

    expect(await screen.findByRole('heading', { name: /mis préstamos/i })).toBeInTheDocument()
  })

  it('has a route for the loan detail, where a new request lands', async () => {
    sessionUser = { id: 'user-1', name: 'Ana' }
    renderAt('/loans/loan-1')

    expect(await screen.findByRole('heading', { name: /^préstamo$/i })).toBeInTheDocument()
  })

  it('keeps the loan pages private', async () => {
    renderAt('/loans/loan-1')

    await waitFor(() => expect(window.location.pathname).toBe('/login'))
  })
})

describe('Navigation bar', () => {
  beforeEach(() => {
    sessionUser = null
    installFakeServer()
  })

  it('offers login and register to a visitor without a session', async () => {
    renderAt('/')

    const nav = await screen.findByRole('navigation', { name: /principal/i })
    expect(await within(nav).findByRole('link', { name: /iniciar sesión/i })).toHaveAttribute('href', '/login')
    expect(within(nav).getByRole('link', { name: /crear cuenta/i })).toHaveAttribute('href', '/register')
    expect(within(nav).queryByRole('link', { name: /mis préstamos/i })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('button', { name: /^salir$/i })).not.toBeInTheDocument()
  })

  it('offers publish, my loans, profile and logout to a logged-in user', async () => {
    sessionUser = { id: 'user-1', name: 'Ana' }
    renderAt('/')

    const nav = await screen.findByRole('navigation', { name: /principal/i })
    expect(await within(nav).findByRole('link', { name: /publicar/i })).toHaveAttribute('href', '/publish')
    expect(within(nav).getByRole('link', { name: /mis préstamos/i })).toHaveAttribute('href', '/loans')
    expect(within(nav).getByRole('link', { name: /perfil/i })).toHaveAttribute('href', '/profile')
    expect(within(nav).getByRole('button', { name: /^salir$/i })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /iniciar sesión/i })).not.toBeInTheDocument()
  })

  it('shows only the home link while it does not know yet whether there is a session', () => {
    // /api/me never answers, so the app stays in its "loading" state
    fetchMock.mockImplementation(() => new Promise(() => {}))
    renderAt('/')

    const nav = screen.getByRole('navigation', { name: /principal/i })
    expect(within(nav).getByRole('link', { name: /prestoteca/i })).toHaveAttribute('href', '/')
    expect(within(nav).queryByRole('link', { name: /iniciar sesión/i })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('button', { name: /^salir$/i })).not.toBeInTheDocument()
  })

  it('logs out from a private page: tells the server, goes home and offers login again', async () => {
    sessionUser = { id: 'user-1', name: 'Ana' }
    renderAt('/profile')
    await screen.findByRole('heading', { name: /mi perfil/i })

    fireEvent.click(screen.getByRole('button', { name: /^salir$/i }))

    const nav = screen.getByRole('navigation', { name: /principal/i })
    expect(await within(nav).findByRole('link', { name: /iniciar sesión/i })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(window.location.pathname).toBe('/')
  })

  it('marks the link of the current page', async () => {
    sessionUser = { id: 'user-1', name: 'Ana' }
    renderAt('/loans')

    const nav = await screen.findByRole('navigation', { name: /principal/i })
    expect(await within(nav).findByRole('link', { name: /mis préstamos/i })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: /perfil/i })).not.toHaveAttribute('aria-current')
  })

  it('has a skip link that points to the main content', async () => {
    renderAt('/')

    expect(screen.getByRole('link', { name: /saltar al contenido/i })).toHaveAttribute('href', '#main')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
  })
})
