import { describe, expect, it, vi, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProfilePage } from '../pages/ProfilePage'

interface User {
  id: string
  name: string
  email: string
  neighborhood: string
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
  currentUser: { id: 'user-1', name: 'Ana García', email: 'ana@example.com', neighborhood: 'Centro' } as User | null,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
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
          category: 'electricas',
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

  it('shows error on fetch failure', async () => {
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
      expect(screen.getByText('Error al cargar el perfil')).toBeInTheDocument()
    })
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
})
