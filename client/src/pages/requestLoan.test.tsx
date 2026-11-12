import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { RequestLoanPage } from '../pages/RequestLoanPage'
import { MESSAGES } from '../errors/messages'

interface User {
  id: string
  name: string
}

// Mock react-router-dom
const mockParams = { id: 'tool-1' }
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

// Fix "today" so the tests never depend on the real calendar (fixed dates used to expire).
const { TODAY, YESTERDAY, START, END } = vi.hoisted(() => ({
  TODAY: '2030-01-10',
  YESTERDAY: '2030-01-09',
  START: '2030-01-15',
  END: '2030-01-25',
}))
vi.mock('../utils/appDate', () => ({
  APP_TIME_ZONE: 'America/Argentina/Tucuman',
  todayInAppTimeZone: () => TODAY,
}))

describe('RequestLoanPage', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch as unknown as typeof fetch
    mockUseAuthValue.currentUser = null
    mockNavigate.mockClear()
    mockUseAuthValue.markSignedOut.mockClear()
  })

  const renderPage = (user: User | null = null) => {
    mockUseAuthValue.currentUser = user
    render(
      <MemoryRouter>
        <RequestLoanPage />
      </MemoryRouter>,
    )
  }

  const getInputById = (id: string) => {
    return document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement
  }

  // ===== Basic rendering tests (unchanged) =====

  it('renders start date input', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    expect(getInputById('startDate')).toBeInTheDocument()
  })

  it('renders end date input', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    expect(getInputById('endDate')).toBeInTheDocument()
  })

  it('renders note textarea', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    expect(getInputById('note')).toBeInTheDocument()
  })

  it('renders submit button', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    expect(screen.getByRole('button', { name: /solicitar/i })).toBeInTheDocument()
  })

  it('disables submit when dates are empty', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    expect(screen.getByRole('button', { name: /solicitar/i })).toBeDisabled()
  })

  it('disables submit when endDate < startDate', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    fireEvent.change(startInput, { target: { value: END } })
    fireEvent.change(endInput, { target: { value: START } })

    expect(screen.getByRole('button', { name: /solicitar/i })).toBeDisabled()
  })

  it('enables submit when dates are valid', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    fireEvent.change(startInput, { target: { value: START } })
    fireEvent.change(endInput, { target: { value: END } })

    expect(screen.getByRole('button', { name: /solicitar/i })).not.toBeDisabled()
  })

  it('enables submit when the start date is today in the app time zone', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    fireEvent.change(startInput, { target: { value: TODAY } })
    fireEvent.change(endInput, { target: { value: END } })

    expect(screen.getByRole('button', { name: /solicitar/i })).not.toBeDisabled()
    expect(startInput.min).toBe(TODAY)
  })

  it('shows error when startDate is in the past', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    fireEvent.change(startInput, { target: { value: YESTERDAY } })
    fireEvent.change(endInput, { target: { value: END } })

    expect(screen.getByText(/la fecha de inicio debe ser hoy o posterior/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /solicitar/i })).toBeDisabled()
  })

  it('shows error when endDate < startDate', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    fireEvent.change(startInput, { target: { value: END } })
    fireEvent.change(endInput, { target: { value: START } })

    expect(screen.getByText(/la fecha de fin debe ser igual o posterior a la de inicio/i)).toBeInTheDocument()
  })

  it('shows note character count', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    const textarea = getInputById('note') as HTMLTextAreaElement

    expect(screen.getByText(/0\/300/)).toBeInTheDocument()

    fireEvent.change(textarea, { target: { value: 'a'.repeat(50) } })
    expect(screen.getByText(/50\/300/)).toBeInTheDocument()
  })

  it('shows error when note exceeds 300 chars', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    const textarea = getInputById('note') as HTMLTextAreaElement

    fireEvent.change(textarea, { target: { value: 'a'.repeat(301) } })
    expect(screen.getByText(/la nota no puede superar los 300 caracteres/i)).toBeInTheDocument()
  })

  it('calls POST /api/tools/tool-1/loans on submit with the keys the server reads', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'loan-1', status: 'pendiente' }),
    })

    renderPage({ id: 'user-2', name: 'Borrower' })

    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    fireEvent.change(startInput, { target: { value: START } })
    fireEvent.change(endInput, { target: { value: END } })

    fireEvent.click(screen.getByRole('button', { name: /solicitar/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/tools/tool-1/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: START,
          endDate: END,
          note: undefined,
        }),
      })
    })
  })

  it('navigates to loan detail on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'loan-1', status: 'pendiente' }),
    })

    renderPage({ id: 'user-2', name: 'Borrower' })

    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    fireEvent.change(startInput, { target: { value: START } })
    fireEvent.change(endInput, { target: { value: END } })

    fireEvent.click(screen.getByRole('button', { name: /solicitar/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/loans/loan-1')
    })
  })

  it('does NOT render form when not logged in', () => {
    renderPage(null)
    expect(getInputById('startDate')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /solicitar/i })).not.toBeInTheDocument()
  })

  // ===== C1–C20 =====

  // C1: request fails with each of 8 error codes — each exact MESSAGES[code] text in role="alert"
  it.each([
    ['TOOL_PAUSED', 409, MESSAGES.TOOL_PAUSED],
    ['LOAN_DATES_MISSING', 400, MESSAGES.LOAN_DATES_MISSING],
    ['LOAN_START_IN_PAST', 400, MESSAGES.LOAN_START_IN_PAST],
    ['LOAN_END_BEFORE_START', 400, MESSAGES.LOAN_END_BEFORE_START],
    ['LOAN_NOTE_TOO_LONG', 400, MESSAGES.LOAN_NOTE_TOO_LONG],
    ['LOAN_OWN_TOOL', 400, MESSAGES.LOAN_OWN_TOOL],
    ['LOAN_DATES_OVERLAP', 409, MESSAGES.LOAN_DATES_OVERLAP],
    ['TOOL_NOT_FOUND', 404, MESSAGES.TOOL_NOT_FOUND],
  ])('C1: %s (%d) shows exact message, hides English text, keeps dates', async (code, status, expectedMessage) => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      json: async () => ({ error: { code, message: 'English server text' } }),
    })

    renderPage({ id: 'user-2', name: 'Borrower' })

    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    fireEvent.change(startInput, { target: { value: START } })
    fireEvent.change(endInput, { target: { value: END } })

    fireEvent.click(screen.getByRole('button', { name: /solicitar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(expectedMessage)
      expect(screen.queryByText('English server text')).not.toBeInTheDocument()
      expect(startInput.value).toBe(START)
      expect(endInput.value).toBe(END)
    })
  })

  // C2: fetch rejects → NETWORK_ERROR text
  it('C2: fetch rejects shows NETWORK_ERROR text', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderPage({ id: 'user-2', name: 'Borrower' })

    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    fireEvent.change(startInput, { target: { value: START } })
    fireEvent.change(endInput, { target: { value: END } })

    fireEvent.click(screen.getByRole('button', { name: /solicitar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.NETWORK_ERROR)
    })
  })

  // C3: 401 SESSION_REQUIRED → the login, with returnTo = the request page path.
  // This file mocks useNavigate, so the navigation is read from mockNavigate.
  it('C3: 401 SESSION_REQUIRED ends on /login with returnTo', async () => {
    mockUseAuthValue.currentUser = { id: 'user-2', name: 'Borrower' }
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'Sesión requerida' } }),
    })

    render(
      <MemoryRouter initialEntries={['/tools/tool-1/request']}>
        <Routes>
          <Route path="/tools/:id/request" element={<RequestLoanPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    fireEvent.change(startInput, { target: { value: START } })
    fireEvent.change(endInput, { target: { value: END } })

    fireEvent.click(screen.getByRole('button', { name: /solicitar/i }))

    // handle('SESSION_REQUIRED') navigates to the login and forgets the user
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        `/login?returnTo=${encodeURIComponent('/tools/tool-1/request')}`,
        expect.objectContaining({ replace: true }),
      )
    })
    expect(mockNavigate).toHaveBeenCalledTimes(1)
    expect(mockUseAuthValue.markSignedOut).toHaveBeenCalledTimes(1)
  })

  // A 2xx that is broken is UNKNOWN_ERROR: never the network text, never /loans/undefined
  it.each([
    ['not JSON', async () => { throw new SyntaxError('Unexpected token <') }],
    ['JSON without id', async () => ({ status: 'pendiente' })],
  ])('request 2xx %s shows UNKNOWN_ERROR and does not navigate', async (_, jsonFn) => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201, json: jsonFn })

    renderPage({ id: 'user-2', name: 'Borrower' })
    fireEvent.change(getInputById('startDate'), { target: { value: START } })
    fireEvent.change(getInputById('endDate'), { target: { value: END } })
    fireEvent.click(screen.getByRole('button', { name: /solicitar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGES.UNKNOWN_ERROR)
    expect(screen.queryByText(MESSAGES.NETWORK_ERROR)).not.toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  // C20: request fails, then a second one is slow (pending) → old error gone while it waits
  it('C20: slow second request clears the old error', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: { code: 'TOOL_PAUSED', message: 'Tool paused' } }),
      })
      // The second request never answers: the page stays waiting
      .mockReturnValueOnce(new Promise(() => {}))

    renderPage({ id: 'user-2', name: 'Borrower' })

    fireEvent.change(getInputById('startDate'), { target: { value: START } })
    fireEvent.change(getInputById('endDate'), { target: { value: END } })
    fireEvent.click(screen.getByRole('button', { name: /solicitar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGES.TOOL_PAUSED)

    fireEvent.click(screen.getByRole('button', { name: /solicitar/i }))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
