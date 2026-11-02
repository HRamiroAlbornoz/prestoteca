import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RequestLoanPage } from '../pages/RequestLoanPage'

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

// Fix "today" so the tests never depend on the real calendar (fixed dates used to expire).
// Every date below is relative to TODAY.
// vi.hoisted: vi.mock runs before the rest of the file, so the dates must exist that early too.
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

// Mock AuthContext
const mockUseAuthValue = { currentUser: null as User | null, isLoading: false, login: vi.fn(), logout: vi.fn() }
vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => mockUseAuthValue,
}))

afterAll(() => {
  vi.resetModules()
})

describe('RequestLoanPage', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch as unknown as typeof fetch
    mockUseAuthValue.currentUser = null
    mockNavigate.mockClear()
    vi.restoreAllMocks()
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

    // The server (loansRoutes.ts) reads startDate and endDate: snake_case keys get a 400
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

  it('shows server error message on failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Ya tenés un préstamo activo' } }),
    })

    renderPage({ id: 'user-2', name: 'Borrower' })

    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    fireEvent.change(startInput, { target: { value: START } })
    fireEvent.change(endInput, { target: { value: END } })

    fireEvent.click(screen.getByRole('button', { name: /solicitar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('does NOT render form when not logged in', () => {
    renderPage(null)
    expect(getInputById('startDate')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /solicitar/i })).not.toBeInTheDocument()
  })
})
