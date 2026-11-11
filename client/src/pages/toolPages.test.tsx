import { describe, expect, it, vi, beforeEach, afterEach, afterAll } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation, Link, useParams } from 'react-router-dom'
import { ToolCard } from '../components/ToolCard'
import { ToolDetailPage } from './ToolDetailPage'

// LocationProbe: reads useLocation() and renders the path so tests can assert
// real navigation without mocking useNavigate (brief, hard rule 4).
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="login-page">{location.pathname + location.search}</div>
}

// Mock AuthContext — set via mockUseAuthValue in beforeEach
interface User {
  id: string
  name: string
}
const mockUseAuthValue = {
  currentUser: null as User | null,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  markSignedOut: vi.fn(),
}
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
  category: 'Herramientas eléctricas',
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
    expect(screen.getByText('Herramientas eléctricas')).toBeInTheDocument()
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
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch as unknown as typeof fetch)
    mockUseAuthValue.currentUser = null
    mockUseAuthValue.markSignedOut.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const renderPage = (initialEntry = '/tools/tool-1', user: User | null = null) => {
    mockUseAuthValue.currentUser = user

    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/tools/:id" element={<ToolDetailPage />} />
          <Route path="/tools/:id/edit" element={<EditPageLink />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  function EditPageLink() {
    const { id } = useParams()
    return <Link to={`/tools/${id}`}>Detalle de la herramienta</Link>
  }

  const renderPageWithLogin = (initialEntry = '/tools/tool-1', user: User | null = null) => {
    mockUseAuthValue.currentUser = user

    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/tools/:id" element={<ToolDetailPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
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
      expect(screen.getByText('Herramientas eléctricas')).toBeInTheDocument()
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
        signal: expect.any(AbortSignal),
        headers: { 'Content-Type': 'application/json' },
      })
    })
  })

  // C1: detail load 404 TOOL_NOT_FOUND
  it('C1: detail load 404 TOOL_NOT_FOUND → exact text in role="alert", English absent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'TOOL_NOT_FOUND', message: 'Tool not found' } }),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Esta herramienta no existe o fue eliminada.')
    })
    expect(screen.getByRole('alert')).not.toHaveTextContent('Tool not found')
  })

  // C2: detail load fetch rejects (TypeError)
  it('C2: detail load fetch rejects → NETWORK_ERROR text', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.')
    })
  })

  it('detail load 200 non-JSON body → UNKNOWN_ERROR text; NETWORK_ERROR absent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => { throw new SyntaxError('Invalid JSON') },
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal. Intentá de nuevo en un momento.')
    })
    expect(screen.getByRole('alert')).not.toHaveTextContent('No hay conexión')
  })

  it('detail load 200 {} → UNKNOWN_ERROR text; NETWORK_ERROR absent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal. Intentá de nuevo en un momento.')
    })
    expect(screen.getByRole('alert')).not.toHaveTextContent('No hay conexión')
  })

  // C3: pause fails 403 TOOL_NOT_OWNER — tool stays visible
  it('C3: pause fails 403 TOOL_NOT_OWNER → row 21 text AND tool name, status, buttons still visible', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => toolData,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: 'TOOL_NOT_OWNER', message: 'You can only pause your own tools' } }),
      })

    renderPage('/tools/tool-1', { id: 'user-1', name: 'Owner User' })

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /pausar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Solo podés modificar tus propias herramientas.')
    })
    expect(screen.getByText('Taladro')).toBeInTheDocument()
    expect(screen.getByText('Disponible')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pausar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /eliminar/i })).toBeInTheDocument()
  })

  // An old action error does not stay next to a later success
  it('pause fails, then pause succeeds → the old error is gone', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => toolData })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })

    renderPage('/tools/tool-1', { id: 'user-1', name: 'Owner User' })

    fireEvent.click(await screen.findByRole('button', { name: /pausar/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.',
    )

    fireEvent.click(screen.getByRole('button', { name: /pausar/i }))
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  // Same for delete: a new attempt hides the old error while it waits for the answer
  it('delete fails, then a slow second delete → the old error is gone while it waits', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => toolData })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Boom' } }),
      })
      .mockReturnValueOnce(new Promise(() => {})) // the second delete has not answered yet

    renderPage('/tools/tool-1', { id: 'user-1', name: 'Owner User' })

    fireEvent.click(await screen.findByRole('button', { name: /eliminar/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal. Intentá de nuevo en un momento.')

    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }))
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  // C4: delete fails 409 TOOL_HAS_ACTIVE_LOANS
  it('C4: delete fails 409 TOOL_HAS_ACTIVE_LOANS → row 22 text AND tool still visible', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => toolData,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: { code: 'TOOL_HAS_ACTIVE_LOANS', message: 'Has active loans' } }),
      })

    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderPage('/tools/tool-1', { id: 'user-1', name: 'Owner User' })

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No podés eliminar esta herramienta mientras tenga préstamos en curso.')
    })
    expect(screen.getByText('Taladro')).toBeInTheDocument()
  })

  // C5: pause fetch rejects (network)
  it('C5: pause fetch rejects → NETWORK_ERROR text; tool still visible', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => toolData,
      })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderPage('/tools/tool-1', { id: 'user-1', name: 'Owner User' })

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /pausar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.')
    })
    expect(screen.getByText('Taladro')).toBeInTheDocument()
  })

  // C6: the page unmounts before the load answers — no state update, fetch signal aborted
  it('C6: page unmounts before load answers — no state update, fetch signal aborted', async () => {
    const capturedSignals: AbortSignal[] = []
    const answerLater: Array<() => void> = []

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

    const { unmount } = renderPage()
    await waitFor(() => expect(answerLater).toHaveLength(1))
    unmount()
    answerLater.forEach((answer) => answer())

    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockUseAuthValue.markSignedOut).not.toHaveBeenCalled()
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument()
    expect(capturedSignals).toHaveLength(1)
    expect(capturedSignals[0].aborted).toBe(true)
  })

  // C14: submit 401 SESSION_REQUIRED → ends on /login with returnTo
  it('C14: detail load 401 SESSION_REQUIRED → ends on /login with returnTo=/tools/tool-1', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'Invalid token' } }),
    })

    renderPageWithLogin()

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toHaveTextContent('/login?returnTo=%2Ftools%2Ftool-1')
    })
    expect(mockUseAuthValue.markSignedOut).toHaveBeenCalledTimes(1)
  })

  it('does NOT show owner actions for non-owner user', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => toolData,
    })

    renderPage('/tools/tool-1', { id: 'user-2', name: 'Other User' })

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pausar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument()
  })

  it('does NOT show owner actions when not logged in', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => toolData,
    })

    renderPage('/tools/tool-1', null)

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pausar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /eliminar/i })).not.toBeInTheDocument()
  })

  it('shows owner actions for tool owner', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => toolData,
    })

    renderPage('/tools/tool-1', { id: 'user-1', name: 'Owner User' })

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pausar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /eliminar/i })).toBeInTheDocument()
  })

  it('calls PATCH /api/tools/:id on pause', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => toolData,
    })

    renderPage('/tools/tool-1', { id: 'user-1', name: 'Owner User' })

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /pausar/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/tools/tool-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_paused: true }),
      })
    })
  })

  it('shows the Spanish message of the code when pausing fails, never the server text', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => toolData,
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { code: 'TOOL_NOT_OWNER', message: 'You can only pause your own tools' } }),
      })

    renderPage('/tools/tool-1', { id: 'user-1', name: 'Owner User' })

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /pausar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Solo podés modificar tus propias herramientas.')
    })
    expect(screen.getByRole('alert')).not.toHaveTextContent('You can only pause')
  })

  it('calls DELETE /api/tools/:id on delete', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => toolData,
    })

    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderPage('/tools/tool-1', { id: 'user-1', name: 'Owner User' })

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/tools/tool-1', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
    })
  })

  it('navigates to the edit page on edit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => toolData,
    })

    renderPage('/tools/tool-1', { id: 'user-1', name: 'Owner User' })

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /detalle de la herramienta/i })).toHaveAttribute('href', '/tools/tool-1')
    })
  })
})
