import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoanStatus } from '../components/LoanStatus'
import { LoanDetailPage } from '../pages/LoanDetailPage'

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
const mockUseAuthValue = { currentUser: null as User | null, isLoading: false, login: vi.fn(), logout: vi.fn() }
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
let currentLoanResp = loanData
let currentToolResp = toolData
let errorMode = false

function setupFetch() {
  const mockFetch = vi.fn(async (url: string) => {
    if (errorMode) {
      if (url.includes('/api/loans/')) {
        return { ok: false, json: async () => ({ error: { message: 'Not found' } }) }
      }
      return { ok: false, json: async () => ({}) }
    }
    if (url.includes('/api/loans/')) {
      return { ok: true, json: async () => currentLoanResp }
    }
    if (url.includes('/api/tools/')) {
      return { ok: true, json: async () => currentToolResp }
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

  it('renders aceptado with blue color', () => {
    render(
      <MemoryRouter>
        <LoanStatus status="aceptado" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Aceptado')).toBeInTheDocument()
    const badge = screen.getByText('Aceptado')
    expect(badge.closest('span')).toHaveClass('bg-blue-100')
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
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    errorMode = false
    currentLoanResp = loanData
    currentToolResp = toolData
    mockFetch = setupFetch()
    mockUseAuthValue.currentUser = null
    mockNavigate.mockClear()
    vi.restoreAllMocks()
  })

  const renderPage = (initialEntry = '/loans/loan-1', user: User | null = null) => {
    mockUseAuthValue.currentUser = user
    render(
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
      })
    })
  })

  it('displays error when fetch fails', async () => {
    errorMode = true
    mockFetch = setupFetch()
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
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
})
