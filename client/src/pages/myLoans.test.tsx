import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MyLoansPage } from '../pages/MyLoansPage'

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
const mockUseAuthValue = { currentUser: null as User | null, isLoading: false, login: vi.fn(), logout: vi.fn() }
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
    vi.restoreAllMocks()
  })

  const renderPage = () => {
    render(
      <MemoryRouter>
        <MyLoansPage />
      </MemoryRouter>,
    )
  }

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

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/loans?type=pedidos', {
        headers: { 'Content-Type': 'application/json' },
      })
    })
  })

  it('fetches recibidos loans on mount', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })

    renderPage()

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/loans?type=recibidos', {
        headers: { 'Content-Type': 'application/json' },
      })
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

    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByText('Cargando...')).not.toBeInTheDocument()
    })

    // Switch to "Me pidieron" tab
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

  it('shows error when fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Server error' } }),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
