import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MyLoansPage } from '../pages/MyLoansPage'
import { MESSAGES } from '../errors/messages'

interface User {
  id: string
  name: string
}

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock AuthContext
const mockUseAuthValue = {
  currentUser: null as User | null,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  markSignedOut: vi.fn(() => { mockUseAuthValue.currentUser = null }),
}
vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => mockUseAuthValue,
}))

afterAll(() => {
  vi.resetModules()
})

describe('MyLoansPage', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch as unknown as typeof fetch
    mockUseAuthValue.currentUser = { id: 'user-1', name: 'Test' }
    mockNavigate.mockClear()
    mockUseAuthValue.markSignedOut.mockClear()
  })

  const renderPage = () => {
    return render(
      <MemoryRouter initialEntries={['/loans']}>
        <MyLoansPage />
      </MemoryRouter>,
    )
  }

  // ===== C1–C20 =====

  // F1a: pedidos → 500 shows error and Reintentar button, no tabs
  it('F1a: pedidos → 500 shows error and Reintentar button, no tabs', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.INTERNAL_ERROR)
    })
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.queryByText('No tenés préstamos solicitados')).not.toBeInTheDocument()
    expect(screen.queryByText(/Server English text/)).not.toBeInTheDocument()
  })

  // F1b: first load error, retry succeeds shows loan list
  it('F1b: first load error, retry succeeds shows loan list', async () => {
    // First load: pedidos → 500, recibidos → 200 []
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

    renderPage()

    // Wait for the error and retry button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    })

    // Second load: pedidos → 200 [loan Taladro], recibidos → 200 []
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 'loan-1',
            tool_id: 'tool-1',
            tool_name: 'Taladro',
            borrower_id: 'user-1',
            owner_id: 'user-2',
            start_date: '2026-10-10',
            end_date: '2026-10-20',
            status: 'pendiente',
            note: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: 'Pedí (1)' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledTimes(4)
  })

  // F1c: error, retry → error again shows error and Reintentar again
  it('F1c: error, retry → error again shows error and Reintentar again', async () => {
    // First load
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

    renderPage()

    // Wait for error and retry button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    })

    // Second load (retry)
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(4)
    })
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.INTERNAL_ERROR)
    })
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(mockFetch).toHaveBeenCalledTimes(4)
  })

  // F1d: error, retry → 401 ends on /login
  it('F1d: error, retry → 401 ends on /login', async () => {
    // First load
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

    renderPage()

    // Wait for error and retry button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    })

    // Retry: both 401
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'x' } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'x' } }),
      })

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => {
      expect(mockUseAuthValue.markSignedOut).toHaveBeenCalled()
    }, { timeout: 3000 })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        `/login?returnTo=${encodeURIComponent('/loans')}`,
        expect.objectContaining({ replace: true }),
      )
    })
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })

  // F1e: error, click retry → shows Cargando... before retry answers
  it('F1e: error, click retry → shows Cargando... before retry answers', async () => {
    // First load: pedidos → 500, recibidos → 200 []
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

    renderPage()

    // Wait for error and retry button
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    })

    // Set up pending promises for the retry calls
    let resolveRetry1: () => void
    let resolveRetry2: () => void
    const pending1 = new Promise<Response>((resolve) => {
      resolveRetry1 = () => resolve({ ok: true, status: 200, json: async () => [] } as unknown as Response)
    })
    const pending2 = new Promise<Response>((resolve) => {
      resolveRetry2 = () => resolve({ ok: true, status: 200, json: async () => [] } as unknown as Response)
    })

    mockFetch
      .mockResolvedValueOnce(pending1)
      .mockResolvedValueOnce(pending2)

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    // Before the retry answers, check for Cargando... and no alert
    await waitFor(() => {
      expect(screen.getByText('Cargando...')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    // Now resolve both pending promises
    resolveRetry1!()
    resolveRetry2!()

    // After resolution, should show the normal empty state
    await waitFor(() => {
      expect(screen.queryByText('Cargando...')).not.toBeInTheDocument()
      expect(screen.getByText('No tenés préstamos solicitados')).toBeInTheDocument()
    })
  })

  // F1f: double retry fails — focus returns to "Reintentar" button
  it('F1f: double retry fails — focus returns to Reintentar button', async () => {
    // 4 answers: pedidos 500, recibidos 200 [], pedidos 500, recibidos 200 []
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    })

    // Second load (retry)
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(4)
    })
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reintentar' }))
    })
  })

  // F1g: first load error — focus NOT moved to "Reintentar" button
  it('F1g: first load error — focus NOT moved to Reintentar button', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.INTERNAL_ERROR)
    })
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Reintentar' }))
  })

  // F1h: loading view has role="status"
  it('F1h: loading view has role="status" with Cargando... text', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))

    renderPage()

    await waitFor(() => {
      const status = screen.getByRole('status')
      expect(status).toHaveTextContent('Cargando...')
    })
  })

  // F1i: retry → SESSION_REQUIRED — no "0 loans" flash
  it('F1i: retry → SESSION_REQUIRED — no "0 loans" flash', async () => {
    // First load: pedidos 500, recibidos 200 []
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server English text' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    })

    // Retry: both 401
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'x' } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'x' } }),
      })

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByText('No tenés préstamos solicitados')).toBeNull()
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.getByText('Cargando...')).toBeTruthy()
  })

  // C9: both lists 401 → ends on /login with returnTo=/loans; a single navigation
  it('C9: both lists 401 ends on /login with returnTo=/loans, single navigation', async () => {
    mockUseAuthValue.currentUser = { id: 'user-1', name: 'Test' }
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'Invalid' } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'Invalid' } }),
      })

    renderPage()

    await vi.waitFor(() => {
      expect(mockUseAuthValue.markSignedOut).toHaveBeenCalled()
    }, { timeout: 3000 })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        `/login?returnTo=${encodeURIComponent('/loans')}`,
        expect.objectContaining({ replace: true }),
      )
    })
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })

  // C10: pedidos 401 + recibidos rejects → ends on /login
  it('C10: pedidos 401 + recibidos rejects ends on /login', async () => {
    mockUseAuthValue.currentUser = { id: 'user-1', name: 'Test' }
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'Invalid' } }),
      })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderPage()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        `/login?returnTo=${encodeURIComponent('/loans')}`,
        expect.objectContaining({ replace: true }),
      )
    })
  })

  // C11: pedidos 200, recibidos 500 → UNKNOWN_ERROR text; the pedidos list NOT shown
  it('C11: pedidos 200, recibidos 500 shows UNKNOWN_ERROR, pedidos list NOT shown', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 'loan-1',
            tool_id: 'tool-1',
            tool_name: 'Taladro',
            borrower_id: 'user-1',
            owner_id: 'user-2',
            start_date: '2026-10-10',
            end_date: '2026-10-20',
            status: 'pendiente',
            note: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'SERVER_ERROR', message: 'Error' } }),
      })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.UNKNOWN_ERROR)
      expect(screen.queryByText('Taladro')).not.toBeInTheDocument()
    })
  })

  // C12: pedidos rejects, recibidos 200 → NETWORK_ERROR text
  it('C12: pedidos rejects, recibidos 200 shows NETWORK_ERROR text', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 'loan-1',
            tool_id: 'tool-1',
            tool_name: 'Taladro',
            borrower_id: 'user-2',
            owner_id: 'user-1',
            start_date: '2026-10-10',
            end_date: '2026-10-20',
            status: 'aceptado',
            note: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.NETWORK_ERROR)
    })
  })

  // C13: pedidos 200 not an array → UNKNOWN_ERROR text
  it('C13: pedidos 200 not an array shows UNKNOWN_ERROR text', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ not: 'an array' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.UNKNOWN_ERROR)
    })
  })

  // C14: unmount before the lists answer, THEN both 401 → no navigation; markSignedOut not called; both signals aborted
  it('C14: unmount before lists answer, THEN both 401 — no navigation, signals aborted', async () => {
    mockUseAuthValue.currentUser = { id: 'user-1', name: 'Test' }
    const capturedSignals: AbortSignal[] = []
    const answerLater: Array<() => void> = []

    mockFetch = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.signal) capturedSignals.push(options.signal)
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
    globalThis.fetch = mockFetch as unknown as typeof fetch

    const { unmount } = renderPage()
    await waitFor(() => expect(answerLater).toHaveLength(2))
    unmount()

    answerLater.forEach((answer) => answer())

    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockUseAuthValue.markSignedOut).not.toHaveBeenCalled()
    expect(capturedSignals).toHaveLength(2)
    expect(capturedSignals.every((s) => s.aborted)).toBe(true)
  })

  // C15: recibidos 200 {} and null (it.each) → UNKNOWN_ERROR text
  it.each([
    ['{}', async () => ({} as unknown)],
    ['null', async () => null],
  ])('C15: recibidos 200 %s shows UNKNOWN_ERROR text', async (_, jsonFn) => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jsonFn,
      })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.UNKNOWN_ERROR)
    })
  })

  // C16: pedidos 500 + recibidos rejects → UNKNOWN_ERROR text, NOT the NETWORK_ERROR text
  it('C16: pedidos 500 + recibidos rejects shows UNKNOWN_ERROR, NOT NETWORK_ERROR', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'SERVER_ERROR', message: 'Error' } }),
      })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.UNKNOWN_ERROR)
      expect(screen.queryByText(MESSAGES.NETWORK_ERROR)).not.toBeInTheDocument()
    })
  })

  // C17: pedidos 500 + recibidos 401 → ends on /login
  it('C17: pedidos 500 + recibidos 401 ends on /login', async () => {
    mockUseAuthValue.currentUser = { id: 'user-1', name: 'Test' }
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'SERVER_ERROR', message: 'Error' } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'Invalid' } }),
      })

    renderPage()

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        `/login?returnTo=${encodeURIComponent('/loans')}`,
        expect.objectContaining({ replace: true }),
      )
    })
  })

  // ===== Existing tests (kept from before) =====

  it('renders both tabs', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /pedí/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /me pidieron/i })).toBeInTheDocument()
    })
  })

  it('fetches pedidos loans on mount', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    renderPage()
    expect(mockFetch).toHaveBeenCalledWith('/api/loans?type=pedidos', {
      headers: { 'Content-Type': 'application/json' },
      signal: expect.anything(),
    })
  })

  it('fetches recibidos loans on mount', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    renderPage()
    expect(mockFetch).toHaveBeenCalledWith('/api/loans?type=recibidos', {
      headers: { 'Content-Type': 'application/json' },
      signal: expect.anything(),
    })
  })

  it('shows loan items in Pedí tab', async () => {
    const mockLoans = [
      {
        id: 'loan-1',
        tool_id: 'tool-1',
        tool_name: 'Taladro',
        borrower_id: 'user-1',
        owner_id: 'user-2',
        start_date: '2026-10-10',
        end_date: '2026-10-20',
        status: 'pendiente',
        note: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockLoans })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })
  })

  it('shows loan items in Me pidieron tab', async () => {
    const mockLoans = [
      {
        id: 'loan-2',
        tool_id: 'tool-1',
        tool_name: 'Martillo',
        borrower_id: 'user-3',
        owner_id: 'user-1',
        start_date: '2026-10-15',
        end_date: '2026-10-25',
        status: 'aceptado',
        note: 'Lo necesito',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => mockLoans })

    renderPage()

    await waitFor(() => {
      expect(screen.queryByText('Cargando...')).not.toBeInTheDocument()
    })

    const recibidosTab = screen.getByRole('tab', { name: /me pidieron/i })
    recibidosTab.click()

    await waitFor(() => {
      expect(screen.getByText('Martillo')).toBeInTheDocument()
    })
  })

  it('shows LoanStatus badge for each loan', async () => {
    const mockLoans = [
      {
        id: 'loan-1',
        tool_id: 'tool-1',
        tool_name: 'Taladro',
        borrower_id: 'user-1',
        owner_id: 'user-2',
        start_date: '2026-10-10',
        end_date: '2026-10-20',
        status: 'pendiente',
        note: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockLoans })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    renderPage()

    await waitFor(() => {
      expect(screen.getByLabelText(/estado: pendiente/i)).toBeInTheDocument()
    })
  })

  it('shows empty state when no loans', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('No tenés préstamos solicitados')).toBeInTheDocument()
    })
  })

  it('shows error when fetch fails (network)', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.')).toBeInTheDocument()
    })
  })

  it('shows error when server returns 500', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'SERVER_ERROR', message: 'Error interno' } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
