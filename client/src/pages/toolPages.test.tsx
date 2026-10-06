import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToolCard } from '../components/ToolCard'
import { ToolDetailPage } from './ToolDetailPage'

// Mock react-router-dom — useParams returns tool id
const mockParams = { id: 'tool-1' }
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useParams: () => mockParams,
  }
})

// Mock AuthContext — set via mockUseAuthValue in beforeEach
const mockUseAuthValue = { currentUser: null, isLoading: false, login: vi.fn(), logout: vi.fn() }
vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => mockUseAuthValue,
}))

// Cleanup after this file's tests to prevent polluting other test files
afterAll(() => {
  vi.resetModules()
})

const toolData = {
  id: 'tool-1',
  owner_id: 'user-1',
  name: 'Taladro',
  description: 'Un taladro potente de 500W',
  category: 'electricas',
  condition: 'bueno',
  is_paused: false,
  deleted_at: null,
  created_at: '2026-10-01T00:00:00.000Z',
}

describe('ToolCard', () => {
  it('renders tool name', () => {
    render(
      <MemoryRouter>
        <ToolCard tool={toolData} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Taladro')).toBeInTheDocument()
  })

  it('renders category', () => {
    render(
      <MemoryRouter>
        <ToolCard tool={toolData} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Eléctricas')).toBeInTheDocument()
  })

  it('renders condition', () => {
    render(
      <MemoryRouter>
        <ToolCard tool={toolData} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Bueno')).toBeInTheDocument()
  })

  it('renders as link to tool detail', () => {
    render(
      <MemoryRouter>
        <ToolCard tool={toolData} />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /taladro/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('/tools/tool-1')
  })
})

describe('ToolDetailPage', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
    mockUseAuthValue.currentUser = null
    vi.restoreAllMocks()
  })

  const renderPage = (initialEntry = '/tools/tool-1', user = null) => {
    mockUseAuthValue.currentUser = user

    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <ToolDetailPage />
      </MemoryRouter>,
    )
  }

  it('renders tool name and description', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => toolData,
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })
    expect(screen.getByText('Un taladro potente de 500W')).toBeInTheDocument()
  })

  it('renders category, condition, status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => toolData,
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Eléctricas')).toBeInTheDocument()
      expect(screen.getByText('Bueno')).toBeInTheDocument()
      expect(screen.getByText('Disponible')).toBeInTheDocument()
    })
  })

  it('renders "Pedir" button for authenticated user', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => toolData,
    })

    renderPage('/tools/tool-1', { id: 'user-1', name: 'Test User' })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pedir/i })).toBeInTheDocument()
    })
  })

  it('calls GET /api/tools/:id on mount', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => toolData,
    })

    renderPage()

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/tools/tool-1', {
        headers: { 'Content-Type': 'application/json' },
      })
    })
  })

  it('displays error when fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Tool not found' } }),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
