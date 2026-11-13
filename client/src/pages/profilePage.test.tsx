import { describe, expect, it, vi, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { ProfilePage } from '../pages/ProfilePage'
import { MESSAGES } from '../errors/messages'

interface User {
  id: string
  name: string
  email: string
  neighborhood: string
}

// LocationProbe: reads useLocation() and renders the path so tests can assert
// real navigation without mocking useNavigate (brief, hard rule 4).
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="login-page">{location.pathname + location.search}</div>
}

// Mock AuthContext (the mock is fine — useNavigate is NOT mocked)
const mockUseAuthValue = {
  currentUser: { id: 'user-1', name: 'Ana García', email: 'ana@example.com', neighborhood: 'Centro' } as User | null,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  markSignedOut: vi.fn(),
}
vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => mockUseAuthValue,
}))

afterAll(() => {
  vi.resetModules()
})

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

function renderProfile() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  )
}

function renderProfileWithLogin() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

function resolveProfile(overrides?: { tools?: any[]; receivedLoans?: any[]; madeLoans?: any[]; history?: any[] }) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      tools: overrides?.tools ?? [],
      receivedLoans: overrides?.receivedLoans ?? [],
      madeLoans: overrides?.madeLoans ?? [],
    }),
  })
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => overrides?.history ?? [],
  })
}

beforeEach(() => {
  mockFetch.mockReset()
  // Each test counts its own calls (C4 asserts "exactly once").
  mockUseAuthValue.markSignedOut.mockClear()
})

describe('ProfilePage', () => {
  it('renders profile header', async () => {
    resolveProfile()
    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Mi perfil')).toBeInTheDocument()
    })
  })

  it('renders all 4 tabs', async () => {
    resolveProfile()
    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Mis herramientas (0)')).toBeInTheDocument()
      expect(screen.getByText('Pedidos recibidos (0)')).toBeInTheDocument()
      expect(screen.getByText('Pedidos hechos (0)')).toBeInTheDocument()
      expect(screen.getByText('Historial (0)')).toBeInTheDocument()
    })
  })

  it('shows tools tab content', async () => {
    resolveProfile({
      tools: [
        {
          id: 'tool-1',
          owner_id: 'user-1',
          name: 'Taladro',
          description: 'Un taladro',
          category: 'Herramientas eléctricas',
          condition: 'bueno',
          is_paused: false,
          deleted_at: null,
          created_at: '2026-10-01',
        },
      ],
    })
    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })
  })

  it('shows empty state for tools when no tools', async () => {
    resolveProfile()
    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('No tenés herramientas publicadas')).toBeInTheDocument()
    })
  })

  it('switches to received loans tab', async () => {
    resolveProfile({
      receivedLoans: [
        {
          id: 'loan-1',
          tool_id: 'tool-1',
          tool_name: 'Martillo',
          borrower_id: 'user-2',
          owner_id: 'user-1',
          start_date: '2026-10-01',
          end_date: '2026-10-05',
          status: 'entregado',
          note: null,
          created_at: '2026-10-01',
          updated_at: '2026-10-02',
        },
      ],
    })
    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Pedidos recibidos (1)')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Pedidos recibidos (1)'))

    await waitFor(() => {
      expect(screen.getByText('Martillo')).toBeInTheDocument()
    })
  })

  it('switches to made loans tab', async () => {
    resolveProfile({
      madeLoans: [
        {
          id: 'loan-2',
          tool_id: 'tool-2',
          tool_name: 'Sierra',
          borrower_id: 'user-1',
          owner_id: 'user-2',
          start_date: '2026-10-01',
          end_date: '2026-10-05',
          status: 'pendiente',
          note: null,
          created_at: '2026-10-01',
          updated_at: '2026-10-02',
        },
      ],
    })
    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Pedidos hechos (1)')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Pedidos hechos (1)'))

    await waitFor(() => {
      expect(screen.getByText('Sierra')).toBeInTheDocument()
    })
  })

  it('switches to history tab', async () => {
    resolveProfile({
      history: [
        {
          id: 'loan-3',
          tool_id: 'tool-3',
          tool_name: 'Pala',
          borrower_id: 'user-1',
          owner_id: 'user-2',
          start_date: '2026-09-01',
          end_date: '2026-09-05',
          status: 'devuelto',
          note: null,
          created_at: '2026-09-01',
          updated_at: '2026-09-06',
        },
      ],
    })
    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Historial (1)')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Historial (1)'))

    await waitFor(() => {
      expect(screen.getByText('Pala')).toBeInTheDocument()
    })
  })

  it('shows empty state for received loans', async () => {
    resolveProfile()
    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Pedidos recibidos (0)')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Pedidos recibidos (0)'))

    await waitFor(() => {
      expect(screen.getByText('Nadie te pidió prestada una herramienta')).toBeInTheDocument()
    })
  })

  it('shows empty state for made loans', async () => {
    resolveProfile()
    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Pedidos hechos (0)')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Pedidos hechos (0)'))

    await waitFor(() => {
      expect(screen.getByText('No solicitaste ningún préstamo')).toBeInTheDocument()
    })
  })

  it('shows empty state for history', async () => {
    resolveProfile()
    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Historial (0)')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Historial (0)'))

    await waitFor(() => {
      expect(screen.getByText('No tenés préstamos terminados')).toBeInTheDocument()
    })
  })

  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    renderProfile()

    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('shows UNKNOWN_ERROR text on fetch failure, never the English server text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Not found' } }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Not found' } }),
    })
    renderProfile()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.UNKNOWN_ERROR)
    })
    expect(screen.queryByText('Not found')).not.toBeInTheDocument()
  })

  it('shows publish link when no tools', async () => {
    resolveProfile()
    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Publicá tu primera herramienta')).toBeInTheDocument()
    })
  })

  it('fetches tools and history on mount', async () => {
    resolveProfile()
    renderProfile()

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/me/tools', expect.any(Object))
      expect(mockFetch).toHaveBeenCalledWith('/api/me/history', expect.any(Object))
    })
  })

  // C4: both load requests answer 401 SESSION_REQUIRED → real navigation to /login
  it('C4: both load requests 401 SESSION_REQUIRED → ends on /login with returnTo=/profile', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'Invalid token' } }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'Invalid token' } }),
    })

    renderProfileWithLogin()

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toHaveTextContent('/login?returnTo=%2Fprofile')
    })
    // handle was called once (markSignedOut is called inside useApiError.handle)
    expect(mockUseAuthValue.markSignedOut).toHaveBeenCalledTimes(1)
  })

  // C5: tools 401 SESSION_REQUIRED + history rejects (network) → SESSION_REQUIRED wins
  it('C5: tools 401 SESSION_REQUIRED + history rejects → SESSION_REQUIRED wins', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'Invalid token' } }),
    })
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderProfileWithLogin()

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toHaveTextContent('/login?returnTo=%2Fprofile')
    })
  })

  // C5b: the session error comes from the second request, the first one failed with a 500
  it('C5b: tools 500 + history 401 SESSION_REQUIRED → SESSION_REQUIRED wins over the first failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Boom' } }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'Invalid token' } }),
    })

    renderProfileWithLogin()

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toHaveTextContent('/login?returnTo=%2Fprofile')
    })
    expect(mockUseAuthValue.markSignedOut).toHaveBeenCalledTimes(1)
  })

  // C6: tools fails 500, history 200 → UNKNOWN_ERROR, tools list NOT shown
  it('C6: tools fails 500, history 200 → UNKNOWN_ERROR, tools list NOT shown', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Internal error' } }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'loan-1', tool_id: 't1', tool_name: 'Pala', borrower_id: 'u1', owner_id: 'u2', start_date: '2026-09-01', end_date: '2026-09-05', status: 'devuelto', note: null, created_at: '2026-09-01', updated_at: '2026-09-06' }],
    })

    renderProfile()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.UNKNOWN_ERROR)
    })
    // Nothing from the requests is shown: only "Configuración" stays (F2)
    expect(screen.getAllByRole('tab')).toHaveLength(1)
    expect(screen.queryByText('No tenés herramientas publicadas')).toBeNull()
  })

  // C7: tools 200, history fails (network) → NETWORK_ERROR
  it('C7: tools 200, history fails (network) → NETWORK_ERROR', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tools: [], receivedLoans: [], madeLoans: [] }),
    })
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderProfile()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.NETWORK_ERROR)
    })
  })

  // C8: tools 200 with wrong shape (valid JSON, wrong shape) → UNKNOWN_ERROR
  it('C8: tools 200 with wrong shape → UNKNOWN_ERROR', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    })

    renderProfile()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.UNKNOWN_ERROR)
    })
  })

  // C8b: invalid JSON body → UNKNOWN_ERROR (keep alongside shape test)
  it('C8b: tools 200 with invalid JSON body → UNKNOWN_ERROR', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new Error('Invalid JSON') },
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    renderProfile()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.UNKNOWN_ERROR)
    })
  })

  // C8c: every field of both shapes is checked, not only the first one
  it.each([
    ['tools without receivedLoans', { tools: [], madeLoans: [] }, []],
    ['tools without madeLoans', { tools: [], receivedLoans: [] }, []],
    ['history as an object', { tools: [], receivedLoans: [], madeLoans: [] }, {}],
    ['history as null', { tools: [], receivedLoans: [], madeLoans: [] }, null],
  ])('C8c: %s → UNKNOWN_ERROR, only the settings tab', async (_name, toolsBody, historyBody) => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => toolsBody })
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => historyBody })

    renderProfile()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.UNKNOWN_ERROR)
    })
    // Nothing from the requests is used: only "Configuración" stays, with no count (F2)
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(1)
    expect(tabs[0]).toHaveTextContent(/^Configuración$/)
    expect(screen.queryByText('No tenés herramientas publicadas')).toBeNull()
  })

  // C8d: two ordinary failures with different codes → the first request of the list (tools) wins
  it('C8d: tools 500 + history network error → the tools text, not the history text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Boom' } }),
    })
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderProfile()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.UNKNOWN_ERROR)
    })
    expect(screen.queryByText(MESSAGES.NETWORK_ERROR)).not.toBeInTheDocument()
  })

  // C8e: a re-render of the page does not load the data a second time
  it('C8e: re-rendering the page keeps a single load (two requests in total)', async () => {
    resolveProfile()
    const { rerender } = renderProfileWithLogin()

    await waitFor(() => {
      expect(screen.getByText('Mi perfil')).toBeInTheDocument()
    })
    rerender(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('Configuración (0)'))

    await waitFor(() => {
      expect(screen.getByText('Mi perfil')).toBeInTheDocument()
    })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  // C9: component unmounts before requests answer — no navigation, signals aborted
  it('C9: unmounts before requests answer — no navigation, signals aborted', async () => {
    const capturedSignals: AbortSignal[] = []
    const answerLater: Array<() => void> = []

    // Each request stays pending until the test answers it. It answers 401 SESSION_REQUIRED
    // even though the signal was aborted (a server that answers anyway): only the page's own
    // "aborted → do nothing" check can stop the navigation.
    mockFetch.mockImplementation((_: string, init?: RequestInit) => {
      if (init?.signal) capturedSignals.push(init.signal)
      return new Promise((resolve) => {
        answerLater.push(() =>
          resolve({
            ok: false,
            status: 401,
            json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'Invalid' } }),
          }),
        )
      })
    })

    const { unmount } = renderProfileWithLogin()
    await waitFor(() => expect(answerLater).toHaveLength(2))
    unmount()
    answerLater.forEach((answer) => answer())

    // Let the late answers run through the page's code.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    // handle('SESSION_REQUIRED') was never called: it would have forgotten the user.
    expect(mockUseAuthValue.markSignedOut).not.toHaveBeenCalled()
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
    expect(capturedSignals).toHaveLength(2)
    expect(capturedSignals.every((s) => s.aborted)).toBe(true)
  })

  // C10: change password 401 CURRENT_PASSWORD_INCORRECT — still on /profile
  it('C10: change password 401 CURRENT_PASSWORD_INCORRECT — still on /profile', async () => {
    resolveProfile()
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'CURRENT_PASSWORD_INCORRECT', message: 'Wrong password' } }),
    })

    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Mi perfil')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Configuración (0)'))

    fireEvent.change(document.getElementById('current-password') as HTMLInputElement, {
      target: { value: 'current123' },
    })
    fireEvent.change(document.getElementById('new-password') as HTMLInputElement, {
      target: { value: 'newpassword1' },
    })
    fireEvent.change(document.getElementById('confirm-password') as HTMLInputElement, {
      target: { value: 'newpassword1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.CURRENT_PASSWORD_INCORRECT)
    })
    // Profile content is still visible (no navigation)
    expect(screen.getByText('Mi perfil')).toBeInTheDocument()
    expect(screen.queryByText('Wrong password')).not.toBeInTheDocument()
  })

  // C11: change password 400 NEW_PASSWORD_LENGTH, NEW_PASSWORD_BLANK, PASSWORD_CHANGE_MISSING_FIELDS; 404 ACCOUNT_NOT_FOUND
  // Server answers with these codes → exact Spanish text shown, English text absent
  it.each([
    ['PASSWORD_CHANGE_MISSING_FIELDS', { code: 'PASSWORD_CHANGE_MISSING_FIELDS', message: 'Missing fields' }, MESSAGES.PASSWORD_CHANGE_MISSING_FIELDS],
    ['NEW_PASSWORD_LENGTH', { code: 'NEW_PASSWORD_LENGTH', message: 'Too short' }, MESSAGES.NEW_PASSWORD_LENGTH],
    ['NEW_PASSWORD_BLANK', { code: 'NEW_PASSWORD_BLANK', message: 'Only spaces' }, MESSAGES.NEW_PASSWORD_BLANK],
    ['ACCOUNT_NOT_FOUND', { code: 'ACCOUNT_NOT_FOUND', message: 'Not found' }, MESSAGES.ACCOUNT_NOT_FOUND],
  ])('C11: change password %s → exact text', async (_name, errorBody, text) => {
    resolveProfile()
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: errorBody }),
    })

    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Mi perfil')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Configuración (0)'))

    // Valid password — local validation passes, API is called
    fireEvent.change(document.getElementById('current-password') as HTMLInputElement, {
      target: { value: 'current123' },
    })
    fireEvent.change(document.getElementById('new-password') as HTMLInputElement, {
      target: { value: 'nuevaClave123' },
    })
    fireEvent.change(document.getElementById('confirm-password') as HTMLInputElement, {
      target: { value: 'nuevaClave123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(text)
    })
    expect(screen.queryByText(errorBody.message)).not.toBeInTheDocument()
  })

  // C12: delete account 409 ACCOUNT_HAS_ACTIVE_LOANS; 404 ACCOUNT_NOT_FOUND
  it.each([
    ['ACCOUNT_HAS_ACTIVE_LOANS', { code: 'ACCOUNT_HAS_ACTIVE_LOANS', message: 'Has active loans' }, MESSAGES.ACCOUNT_HAS_ACTIVE_LOANS],
    ['ACCOUNT_NOT_FOUND', { code: 'ACCOUNT_NOT_FOUND', message: 'Not found' }, MESSAGES.ACCOUNT_NOT_FOUND],
  ])('C12: delete account %s → exact text, profile still visible', async (_name, errorBody, text) => {
    resolveProfile()
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: errorBody }),
    })

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Mi perfil')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Configuración (0)'))
    fireEvent.click(screen.getByRole('button', { name: /eliminar mi cuenta/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(text)
    })
    // Profile content is still visible
    expect(screen.getByText('Mi perfil')).toBeInTheDocument()
    expect(screen.queryByText(errorBody.message)).not.toBeInTheDocument()
  })

  // C13: change password 401 SESSION_REQUIRED → real navigation to /login with returnTo
  it('C13: change password 401 SESSION_REQUIRED → ends on /login with returnTo=/profile', async () => {
    resolveProfile()
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'Invalid token' } }),
    })

    renderProfileWithLogin()

    await waitFor(() => {
      expect(screen.getByText('Mi perfil')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Configuración (0)'))

    fireEvent.change(document.getElementById('current-password') as HTMLInputElement, {
      target: { value: 'current123' },
    })
    fireEvent.change(document.getElementById('new-password') as HTMLInputElement, {
      target: { value: 'newpassword1' },
    })
    fireEvent.change(document.getElementById('confirm-password') as HTMLInputElement, {
      target: { value: 'newpassword1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }))

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toHaveTextContent('/login?returnTo=%2Fprofile')
    })
  })

  // Local validation still shows original strings without calling /api/me/password
  it('local validation: password mismatch shows original string, no API call', async () => {
    resolveProfile()
    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Mi perfil')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Configuración (0)'))

    fireEvent.change(document.getElementById('current-password') as HTMLInputElement, {
      target: { value: 'current123' },
    })
    fireEvent.change(document.getElementById('new-password') as HTMLInputElement, {
      target: { value: 'short' },
    })
    fireEvent.change(document.getElementById('confirm-password') as HTMLInputElement, {
      target: { value: 'different' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Las contraseñas no coinciden')
    })
    expect(mockFetch).not.toHaveBeenCalledWith('/api/me/password', expect.any(Object))
  })

  // The local length and spaces checks keep their original texts (they do not come from the server).
  it.each([
    ['too short', 'corta', 'La contraseña debe tener entre 8 y 72 caracteres'],
    ['only spaces', '        ', 'La contraseña no puede ser solo espacios'],
  ])('local validation: new password %s shows the original string, no API call', async (_name, value, text) => {
    resolveProfile()
    renderProfile()

    await waitFor(() => {
      expect(screen.getByText('Mi perfil')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Configuración (0)'))

    fireEvent.change(document.getElementById('current-password') as HTMLInputElement, {
      target: { value: 'current123' },
    })
    fireEvent.change(document.getElementById('new-password') as HTMLInputElement, {
      target: { value },
    })
    fireEvent.change(document.getElementById('confirm-password') as HTMLInputElement, {
      target: { value },
    })
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(text)
    })
    expect(mockFetch).not.toHaveBeenCalledWith('/api/me/password', expect.any(Object))
  })
})

describe('F2 load error with Reintentar', () => {
  // F2a: load error → only "Configuración" tab, Reintentar button, no false data
  it('F2a: tools 500, history 200 [] → error view with only settings tab', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    renderProfile()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.INTERNAL_ERROR)
    })
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(1)
    expect(tabs[0]).toHaveTextContent(/^Configuración$/)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('No tenés herramientas publicadas')).toBeNull()
    expect(screen.queryByText(/Server English text/)).toBeNull()
  })

  // F2b: load error → settings still work (change password)
  it('F2b: tools 500, history 200 [] → can change password from settings', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })

    renderProfile()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // No click on "Configuración": the error view must already show the settings content
    fireEvent.change(document.getElementById('current-password') as HTMLInputElement, {
      target: { value: 'current123' },
    })
    fireEvent.change(document.getElementById('new-password') as HTMLInputElement, {
      target: { value: 'newpassword1' },
    })
    fireEvent.change(document.getElementById('confirm-password') as HTMLInputElement, {
      target: { value: 'newpassword1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }))

    await waitFor(() => {
      expect(screen.getByText('Contraseña cambiada correctamente')).toBeInTheDocument()
    })
    expect(mockFetch.mock.calls[2][0]).toBe('/api/me/password')
  })

  // F2c: retry → success → normal screen with 5 tabs
  it('F2c: tools 500, history 200 []; retry → resolveProfile with a tool → normal screen', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    renderProfile()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    })

    resolveProfile({
      tools: [
        {
          id: 'tool-1',
          owner_id: 'user-1',
          name: 'Taladro',
          description: 'Un taladro',
          category: 'Herramientas eléctricas',
          condition: 'bueno',
          is_paused: false,
          deleted_at: null,
          created_at: '2026-10-01',
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => {
      expect(screen.getByText('Mis herramientas (1)')).toBeInTheDocument()
    })
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(5)
    expect(screen.getByText('Configuración (0)')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(mockFetch).toHaveBeenCalledTimes(4)
  })

  // F2d: retry → failure again → error view, focus on Reintentar
  it('F2d: tools 500, history 200 []; retry → tools 500, history 200 [] → error again, focus on Reintentar', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    renderProfile()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(4))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.INTERNAL_ERROR)
    })
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reintentar' }))
    })
  })

  // F2e: first load error → focus NOT on Reintentar
  it('F2e: tools 500, history 200 [] → focus NOT on Reintentar on first load', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    renderProfile()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Reintentar' }))
  })

  // F2f: loading state shows role="status" with "Cargando..."
  it('F2f: pending fetch → getByRole("status") has text "Cargando..."', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    renderProfile()

    expect(screen.getByRole('status')).toHaveTextContent('Cargando...')
  })

  // F2g: retry → 401 SESSION_REQUIRED → navigate to /login
  it('F2g: tools 500, history 200 []; retry → both 401 → login page', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'x' } }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'x' } }),
    })

    renderProfileWithLogin()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toHaveTextContent('/login?returnTo=%2Fprofile')
    })
  })

  // F2h: load error → delete account button still present
  it('F2h: tools 500, history 200 [] → "Eliminar mi cuenta" button present', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })

    renderProfile()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Eliminar mi cuenta' })).toBeInTheDocument()
  })
})
