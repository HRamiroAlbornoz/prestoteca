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

    fireEvent.change(startInput, { target: { value: '2026-10-20' } })
    fireEvent.change(endInput, { target: { value: '2026-10-10' } })

    expect(screen.getByRole('button', { name: /solicitar/i })).toBeDisabled()
  })

  it('enables submit when dates are valid', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    fireEvent.change(startInput, { target: { value: '2026-10-10' } })
    fireEvent.change(endInput, { target: { value: '2026-10-20' } })

    expect(screen.getByRole('button', { name: /solicitar/i })).not.toBeDisabled()
  })

  it('shows error when startDate is in the past', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    // Yesterday's date
    fireEvent.change(startInput, { target: { value: '2020-01-01' } })
    fireEvent.change(endInput, { target: { value: '2026-10-20' } })

    expect(screen.getByText(/la fecha de inicio debe ser hoy o posterior/i)).toBeInTheDocument()
  })

  it('shows error when endDate < startDate', () => {
    renderPage({ id: 'user-2', name: 'Borrower' })
    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    fireEvent.change(startInput, { target: { value: '2026-10-20' } })
    fireEvent.change(endInput, { target: { value: '2026-10-10' } })

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

  it('calls POST /api/tools/tool-1/loans on submit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'loan-1', status: 'pendiente' }),
    })

    renderPage({ id: 'user-2', name: 'Borrower' })

    const startInput = getInputById('startDate') as HTMLInputElement
    const endInput = getInputById('endDate') as HTMLInputElement

    fireEvent.change(startInput, { target: { value: '2026-10-10' } })
    fireEvent.change(endInput, { target: { value: '2026-10-20' } })

    fireEvent.click(screen.getByRole('button', { name: /solicitar/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/tools/tool-1/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: '2026-10-10',
          end_date: '2026-10-20',
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

    fireEvent.change(startInput, { target: { value: '2026-10-10' } })
    fireEvent.change(endInput, { target: { value: '2026-10-20' } })

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

    fireEvent.change(startInput, { target: { value: '2026-10-10' } })
    fireEvent.change(endInput, { target: { value: '2026-10-20' } })

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
