import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoanStatus } from '../components/LoanStatus'
import { LoanDetailPage } from '../pages/LoanDetailPage'
import { MESSAGES } from '../errors/messages'

interface User {
  id: string
  name: string
}

// Mock react-router-dom
const mockParams = { id: 'loan-1' }
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useParams: () => mockParams,
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

const loanData = {
  id: 'loan-1',
  tool_id: 'tool-1',
  borrower_id: 'user-2',
  owner_id: 'user-1',
  start_date: '2026-10-10',
  end_date: '2026-10-20',
  status: 'pendiente',
  note: 'Necesito el taladro',
  created_at: '2026-10-07T00:00:00.000Z',
  updated_at: '2026-10-07T00:00:00.000Z',
}

const toolData = { id: 'tool-1', name: 'Taladro' }

// Shared mock fetch — set via globalThis.fetch
let currentLoanResp: unknown = loanData
let currentToolResp = toolData
let pendingPatchOverride: unknown = null
let mockFetch: ReturnType<typeof vi.fn>

function setupFetch(errorMode: boolean = false) {
  mockFetch = vi.fn(async (url: string, options?: RequestInit | undefined) => {
    // Handle error mode first - any loan call should fail
    if (errorMode) {
      if (url.includes('/api/loans/')) {
        return { ok: false, status: 504, json: async () => ({ error: { message: 'Network error' } }) }
      }
      return { ok: false, json: async () => ({}) }
    }
    // Handle PATCH /api/loans/:id/status
    if (url === '/api/loans/loan-1/status' && options?.method === 'PATCH' && options?.body) {
      if (pendingPatchOverride) {
        const override = pendingPatchOverride
        pendingPatchOverride = null
        return override
      }
      const body = JSON.parse(options.body as string)
      const newStatus = body.status
      currentLoanResp = { ...(currentLoanResp as Record<string, unknown>), status: newStatus }
      return { ok: true, json: async () => currentLoanResp }
    }
    // Handle GET /api/loans/:id — any loan ID
    const loanMatch = url.match(/^\/api\/loans\/([^?]+)$/)
    if (loanMatch) {
      return { ok: true, json: async () => currentLoanResp }
    }
    // Handle GET /api/tools/:id
    if (url.startsWith('/api/tools/')) {
      return { ok: true, json: async () => currentToolResp }
    }
    // Default: 404 for any other loan
    if (url.includes('/api/loans/')) {
      return { ok: false, status: 404, json: async () => ({ error: { message: 'Not found' } }) }
    }
    return { ok: false, json: async () => ({}) }
  })
  globalThis.fetch = mockFetch as unknown as typeof fetch
  return mockFetch
}

describe('LoanStatus', () => {
  it('renders pendiente with yellow color', () => {
    render(
      <MemoryRouter>
        <LoanStatus status="pendiente" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
    const badge = screen.getByText('Pendiente')
    expect(badge.closest('span')).toHaveClass('bg-yellow-100')
  })

  it('renders aceptado with violet color', () => {
    render(
      <MemoryRouter>
        <LoanStatus status="aceptado" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Aceptado')).toBeInTheDocument()
    const badge = screen.getByText('Aceptado')
    expect(badge.closest('span')).toHaveClass('bg-violet-100')
  })

  it('renders entregado with purple color', () => {
    render(
      <MemoryRouter>
        <LoanStatus status="entregado" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Entregado')).toBeInTheDocument()
    const badge = screen.getByText('Entregado')
    expect(badge.closest('span')).toHaveClass('bg-purple-100')
  })

  it('renders vencido with red color', () => {
    render(
      <MemoryRouter>
        <LoanStatus status="vencido" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Vencido')).toBeInTheDocument()
    const badge = screen.getByText('Vencido')
    expect(badge.closest('span')).toHaveClass('bg-red-100')
  })

  it('renders devuelto with green color', () => {
    render(
      <MemoryRouter>
        <LoanStatus status="devuelto" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Devuelto')).toBeInTheDocument()
    const badge = screen.getByText('Devuelto')
    expect(badge.closest('span')).toHaveClass('bg-green-100')
  })

  it('renders cancelado with gray color', () => {
    render(
      <MemoryRouter>
        <LoanStatus status="cancelado" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Cancelado')).toBeInTheDocument()
    const badge = screen.getByText('Cancelado')
    expect(badge.closest('span')).toHaveClass('bg-gray-100')
  })

  it('renders rechazado with gray color', () => {
    render(
      <MemoryRouter>
        <LoanStatus status="rechazado" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Rechazado')).toBeInTheDocument()
    const badge = screen.getByText('Rechazado')
    expect(badge.closest('span')).toHaveClass('bg-gray-100')
  })
})

describe('LoanDetailPage', () => {
  beforeEach(() => {
    currentLoanResp = loanData
    currentToolResp = toolData
    pendingPatchOverride = null
    mockFetch = setupFetch()
    mockUseAuthValue.currentUser = null
    mockNavigate.mockClear()
    mockUseAuthValue.markSignedOut.mockClear()
  })

  const renderPage = (initialEntry = '/loans/loan-1', user: User | null = null) => {
    mockUseAuthValue.currentUser = user
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <LoanDetailPage />
      </MemoryRouter>,
    )
  }

  it('renders loan status', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Estado: Pendiente')).toBeInTheDocument()
  })

  it('renders loan note', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Necesito el taladro')).toBeInTheDocument()
    })
  })

  it('renders start and end dates', async () => {
    renderPage()
    await waitFor(() => {
      // toLocaleDateString('es-AR') renders as "9/10/2026 — 19/10/2026"
      expect(screen.getByText(/\/10\/2026/)).toBeInTheDocument()
    })
  })

  it('calls GET /api/loans/:id on mount', async () => {
    renderPage()
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/loans/loan-1', {
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(AbortSignal),
      })
    })
  })

  it('displays error when fetch fails', async () => {
    mockFetch = setupFetch(true)
    renderPage()
    // A 504 without an error code is UNKNOWN_ERROR
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGES.UNKNOWN_ERROR)
  })

  it('shows accept button for owner when status is pendiente', async () => {
    renderPage('/loans/loan-1', { id: 'user-1', name: 'Owner' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /aceptar/i })).toBeInTheDocument()
    })
  })

  it('shows reject button for owner when status is pendiente', async () => {
    renderPage('/loans/loan-1', { id: 'user-1', name: 'Owner' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /rechazar/i })).toBeInTheDocument()
    })
  })

  // MVP spec line 66: the borrower can cancel while the tool has not been handed over, pending included
  it('shows only the cancel button to the borrower when status is pendiente', async () => {
    renderPage('/loans/loan-1', { id: 'user-2', name: 'Borrower' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /aceptar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /rechazar/i })).not.toBeInTheDocument()
  })

  it('shows cancel button for borrower when status is aceptado', async () => {
    currentLoanResp = { ...loanData, status: 'aceptado', owner_id: 'user-1', borrower_id: 'user-2' }
    renderPage('/loans/loan-1', { id: 'user-2', name: 'Borrower' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
    })
  })

  it('shows deliver button for owner when status is aceptado', async () => {
    currentLoanResp = { ...loanData, status: 'aceptado', owner_id: 'user-1', borrower_id: 'user-2' }
    renderPage('/loans/loan-1', { id: 'user-1', name: 'Owner' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /marcar entregado/i })).toBeInTheDocument()
    })
  })

  it('shows return button for owner when status is entregado', async () => {
    currentLoanResp = { ...loanData, status: 'entregado', owner_id: 'user-1', borrower_id: 'user-2' }
    renderPage('/loans/loan-1', { id: 'user-1', name: 'Owner' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /marcar devuelto/i })).toBeInTheDocument()
    })
  })

  it('does NOT show action buttons for non-participant', async () => {
    renderPage('/loans/loan-1', { id: 'user-99', name: 'Stranger' })
    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /aceptar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /rechazar/i })).not.toBeInTheDocument()
  })

  it('calls PATCH /loans/:id/status on accept', async () => {
    renderPage('/loans/loan-1', { id: 'user-1', name: 'Owner' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /aceptar/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /aceptar/i }))
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/loans/loan-1/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'aceptado' }),
      })
    })
  })

  // ===== C1–C20 =====

  // C4: change status 409 LOAN_TRANSITION_INVALID → its text in role="alert" AND tool name, status, dates still visible
  it('C4: PATCH 409 LOAN_TRANSITION_INVALID shows message, loan still visible', async () => {
    pendingPatchOverride = Promise.resolve({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'LOAN_TRANSITION_INVALID', message: 'Invalid transition' } }),
    })

    renderPage('/loans/loan-1', { id: 'user-1', name: 'Owner' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /aceptar/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /aceptar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.LOAN_TRANSITION_INVALID)
      expect(screen.getByText('Taladro')).toBeInTheDocument()
      expect(screen.getByLabelText('Estado: Pendiente')).toBeInTheDocument()
      expect(screen.getByText(/\/10\/2026/)).toBeInTheDocument()
    })
  })

  // C5: change status 403 LOAN_TRANSITION_WRONG_ROLE; 404 LOAN_NOT_FOUND → each exact text; loan still visible
  it.each([
    ['LOAN_TRANSITION_WRONG_ROLE', 403, MESSAGES.LOAN_TRANSITION_WRONG_ROLE],
    ['LOAN_NOT_FOUND', 404, MESSAGES.LOAN_NOT_FOUND],
  ])('C5: PATCH %d %s shows message, loan still visible', async (code, status, expectedMessage) => {
    pendingPatchOverride = Promise.resolve({
      ok: false,
      status,
      json: async () => ({ error: { code, message: 'Error' } }),
    })

    renderPage('/loans/loan-1', { id: 'user-1', name: 'Owner' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /aceptar/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /aceptar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(expectedMessage)
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })
  })

  // A change of status that answers 401 SESSION_REQUIRED sends the person to the login
  it('PATCH 401 SESSION_REQUIRED sends the person to the login and shows no text', async () => {
    pendingPatchOverride = Promise.resolve({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'Session required' } }),
    })

    renderPage('/loans/loan-1', { id: 'user-1', name: 'Owner' })
    fireEvent.click(await screen.findByRole('button', { name: /aceptar/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        `/login?returnTo=${encodeURIComponent('/loans/loan-1')}`,
        expect.objectContaining({ replace: true }),
      )
    })
    expect(mockUseAuthValue.markSignedOut).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(MESSAGES.SESSION_REQUIRED)).not.toBeInTheDocument()
  })

  // A status change that answers 200 with half a loan keeps the old loan and its buttons
  it('PATCH 200 without owner_id shows UNKNOWN_ERROR and keeps the buttons', async () => {
    pendingPatchOverride = Promise.resolve({
      ok: true,
      json: async () => ({ id: 'loan-1', status: 'aceptado' }),
    })

    renderPage('/loans/loan-1', { id: 'user-1', name: 'Owner' })
    fireEvent.click(await screen.findByRole('button', { name: /aceptar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGES.UNKNOWN_ERROR)
    expect(screen.getByLabelText('Estado: Pendiente')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /aceptar/i })).toBeInTheDocument()
  })

  // C6: change status fetch rejects → NETWORK_ERROR text; loan still visible
  it('C6: PATCH fetch rejects shows NETWORK_ERROR, loan still visible', async () => {
    // Replace fetch mock to throw on PATCH
    const originalFetch = globalThis.fetch
    const patchThrowMock = async (url: string, options?: RequestInit) => {
      if (url === '/api/loans/loan-1/status' && options?.method === 'PATCH') {
        throw new TypeError('Failed to fetch')
      }
      // Return loan data for GET /api/loans/loan-1
      if (url === '/api/loans/loan-1') {
        return { ok: true, json: async () => currentLoanResp }
      }
      // Return tool data for GET /api/tools/tool-1
      if (url === '/api/tools/tool-1') {
        return { ok: true, json: async () => currentToolResp }
      }
      return { ok: false, json: async () => ({}) }
    }
    globalThis.fetch = patchThrowMock as unknown as typeof fetch

    renderPage('/loans/loan-1', { id: 'user-1', name: 'Owner' })
    // Wait for tool name to load before interacting
    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /aceptar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.NETWORK_ERROR)
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })

    globalThis.fetch = originalFetch
  })

  // C7: load 404 LOAN_NOT_FOUND → its text
  it('C7: load 404 LOAN_NOT_FOUND shows its text', async () => {
    currentLoanResp = { error: { code: 'LOAN_NOT_FOUND', message: 'Not found' } }
    // Override the mock to return 404 for this loan
    mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/loans/')) {
        return { ok: false, status: 404, json: async () => ({ error: { code: 'LOAN_NOT_FOUND', message: 'No encontrado' } }) }
      }
      if (url.startsWith('/api/tools/')) {
        return { ok: true, json: async () => toolData }
      }
      return { ok: false, json: async () => ({}) }
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.LOAN_NOT_FOUND)
    })
  })

  // C8: unmount before the load answers, THEN it answers 401 → no navigation; markSignedOut not called; signal.aborted === true
  it('C8: unmount before load answers, THEN 401 — no navigation, signals aborted', async () => {
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
    await waitFor(() => expect(answerLater).toHaveLength(1))
    unmount()

    answerLater.forEach((answer) => answer())

    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockUseAuthValue.markSignedOut).not.toHaveBeenCalled()
    expect(capturedSignals).toHaveLength(1)
    expect(capturedSignals[0].aborted).toBe(true)
  })

  // C18: load 200 not JSON; load 200 {}; load 200 null (it.each) → UNKNOWN_ERROR text; NETWORK_ERROR absent
  it.each([
    // A body that is not JSON makes res.json() throw, as the browser does
    ['not JSON', async () => { throw new SyntaxError('Unexpected token <') }],
    ['{}', async () => ({} as unknown)],
    ['null', async () => null],
  ])('C18: load 200 %s shows UNKNOWN_ERROR, NETWORK_ERROR absent', async (_, jsonFn) => {
    mockFetch = vi.fn(async (url: string) => {
      if (url.includes('/api/loans/')) {
        return { ok: true, json: jsonFn }
      }
      if (url.startsWith('/api/tools/')) {
        return { ok: true, json: async () => toolData }
      }
      return { ok: false, json: async () => ({}) }
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.UNKNOWN_ERROR)
      expect(screen.queryByText(MESSAGES.NETWORK_ERROR)).not.toBeInTheDocument()
    })
  })

  // C19: change status fails, then a second one is slow (pending) → old error gone while it waits
  it('C19: change status fails, then second is slow — old error gone while it waits', async () => {
    let callCount = 0

    mockFetch = vi.fn(async (url: string, options?: RequestInit) => {
      // Handle PATCH
      if (url === '/api/loans/loan-1/status' && options?.method === 'PATCH' && options?.body) {
        callCount++
        if (callCount === 1) {
          return {
            ok: false,
            status: 409,
            json: async () => ({ error: { code: 'LOAN_TRANSITION_INVALID', message: 'Invalid' } }),
          }
        }
        // Second call: slow — simulate pending
        return new Promise((resolve) => {
          setTimeout(() => resolve({ ok: true, json: async () => loanData }), 500)
        })
      }
      // Handle GET loan
      if (url.includes('/api/loans/')) {
        return { ok: true, json: async () => loanData }
      }
      if (url.startsWith('/api/tools/')) {
        return { ok: true, json: async () => toolData }
      }
      return { ok: false, json: async () => ({}) }
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch

    renderPage('/loans/loan-1', { id: 'user-1', name: 'Owner' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /aceptar/i })).toBeInTheDocument()
    })

    // First action: fails
    fireEvent.click(screen.getByRole('button', { name: /aceptar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.LOAN_TRANSITION_INVALID)
    })

    // Second action: slow pending — old error should be cleared
    fireEvent.click(screen.getByRole('button', { name: /aceptar/i }))

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
