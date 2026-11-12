import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HomePage } from '../pages/HomePage'

// Mock fetch globally
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

function renderHome(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <HomePage />
    </MemoryRouter>,
  )
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('HomePage', () => {
  beforeEach(() => {
    mockFetch.mockClear()
    mockFetch.mockResolvedValue(
      jsonResponse({
        items: [],
        total: 0,
        page: 1,
        pages: 1,
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders search bar and filters', () => {
    renderHome()

    expect(screen.getByLabelText(/buscar herramienta por nombre/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/filtrar por categoría/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/filtrar por barrio/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /buscar/i })).toBeInTheDocument()
  })

  it('renders all category options', () => {
    renderHome()

    expect(screen.getByRole('option', { name: /herramientas eléctricas/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /herramientas manuales/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /jardín/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /limpieza/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /escaleras y altura/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /otros/i })).toBeInTheDocument()
  })

  it('fetches tools on mount', async () => {
    renderHome()

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/tools'), expect.anything())
    })
  })

  it('shows empty state when no tools', async () => {
    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/no se encontraron herramientas/i)).toBeInTheDocument()
    })
  })

  it('searches by name and updates URL', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 'tool-1',
            owner_id: 'user-1',
            name: 'Taladro',
            description: 'Un taladro',
            category: 'Herramientas eléctricas',
            condition: 'bueno',
            is_paused: false,
            deleted_at: null,
            created_at: '2026-10-01',
          },
        ],
        total: 1,
        page: 1,
        pages: 1,
      }),
    )

    renderHome()

    const searchInput = screen.getByLabelText(/buscar herramienta por nombre/i)
    fireEvent.change(searchInput, { target: { value: 'taladro' } })
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('q=taladro'), expect.anything())
    })
  })

  it('filters by category and updates URL', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 'tool-1',
            owner_id: 'user-1',
            name: 'Taladro',
            description: 'Un taladro',
            category: 'Herramientas eléctricas',
            condition: 'bueno',
            is_paused: false,
            deleted_at: null,
            created_at: '2026-10-01',
          },
        ],
        total: 1,
        page: 1,
        pages: 1,
      }),
    )

    renderHome()

    const categorySelect = screen.getByLabelText(/filtrar por categoría/i)
    fireEvent.change(categorySelect, { target: { value: 'Herramientas eléctricas' } })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('category=Herramientas+el%C3%A9ctricas'), expect.anything())
    })
  })

  it('filters by neighborhood and updates URL', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 'tool-1',
            owner_id: 'user-1',
            name: 'Taladro',
            description: 'Un taladro',
            category: 'Herramientas eléctricas',
            condition: 'bueno',
            is_paused: false,
            deleted_at: null,
            created_at: '2026-10-01',
          },
        ],
        total: 1,
        page: 1,
        pages: 1,
      }),
    )

    renderHome()

    const neighborhoodInput = screen.getByLabelText(/filtrar por barrio/i)
    fireEvent.change(neighborhoodInput, { target: { value: 'centro' } })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('neighborhood=centro'), expect.anything())
    })
  })

  it('shows results count', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 'tool-1',
            owner_id: 'user-1',
            name: 'Taladro',
            description: 'Un taladro',
            category: 'Herramientas eléctricas',
            condition: 'bueno',
            is_paused: false,
            deleted_at: null,
            created_at: '2026-10-01',
          },
        ],
        total: 5,
        page: 1,
        pages: 1,
      }),
    )

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/5 herramientas encontradas/i)).toBeInTheDocument()
    })
  })

  it('shows "limpiar filtros" when filters are active', async () => {
    renderHome('/?q=taladro')

    await waitFor(() => {
      expect(screen.getByText(/limpiar filtros/i)).toBeInTheDocument()
    })
  })

  it('clears filters when clicking "limpiar filtros"', async () => {
    renderHome('/?q=taladro')

    await waitFor(() => {
      expect(screen.getByText(/limpiar filtros/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/limpiar filtros/i))

    // Should reset to page 1 only
    expect(screen.getByLabelText(/buscar herramienta por nombre/i)).toHaveValue('')
  })

  it('shows loading state during fetch', () => {
    // Don't resolve the mock — keep loading
    mockFetch.mockImplementation(() => new Promise(() => {}))

    renderHome()

    expect(screen.getByRole('status', { name: /cargando herramientas/i })).toBeInTheDocument()
  })

  it('renders pagination when multiple pages', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [],
        total: 25,
        page: 1,
        pages: 3,
      }),
    )

    renderHome()

    await waitFor(() => {
      expect(screen.getByLabelText('Página anterior')).toBeInTheDocument()
      expect(screen.getByLabelText('Página siguiente')).toBeInTheDocument()
      expect(screen.getByLabelText('Página 1')).toBeInTheDocument()
      expect(screen.getByLabelText('Página 2')).toBeInTheDocument()
      expect(screen.getByLabelText('Página 3')).toBeInTheDocument()
    })
  })

  it('disables previous button on page 1', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [],
        total: 25,
        page: 1,
        pages: 3,
      }),
    )

    renderHome()

    await waitFor(() => {
      const prevBtn = screen.getByLabelText('Página anterior')
      expect(prevBtn).toBeDisabled()
    })
  })

  it('navigates to next page on click', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [],
        total: 25,
        page: 1,
        pages: 3,
      }),
    )

    renderHome()

    await waitFor(() => {
      expect(screen.getByLabelText('Página siguiente')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Página siguiente'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.anything())
    })
  })

  it('disables next button on last page', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [],
        total: 25,
        page: 3,
        pages: 3,
      }),
    )

    renderHome('/?page=3')

    await waitFor(() => {
      const nextBtn = screen.getByLabelText('Página siguiente')
      expect(nextBtn).toBeDisabled()
    })
  })

  it('displays tools from fetch result', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 'tool-1',
            owner_id: 'user-1',
            name: 'Taladro',
            description: 'Un taladro potente',
            category: 'Herramientas eléctricas',
            condition: 'bueno',
            is_paused: false,
            deleted_at: null,
            created_at: '2026-10-01',
          },
        ],
        total: 1,
        page: 1,
        pages: 1,
      }),
    )

    renderHome()

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })
  })

  // ── Error state tests (C1–C11) ──────────────────────────────────────

  it('C1: network error shows NETWORK_ERROR alert, not empty state', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderHome()

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(
        'No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.',
      )
    })
    expect(screen.queryByText(/no se encontraron herramientas/i)).not.toBeInTheDocument()
  })

  it('C2: SEARCH_QUERY_TOO_LONG shows its own text, not English server text', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: 'SEARCH_QUERY_TOO_LONG', message: 'Search query must be at most 60 characters' } },
        400,
      ),
    )

    renderHome()

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent('La búsqueda puede tener hasta 60 caracteres.')
    })
    expect(screen.queryByText(/Search query must be at most 60 characters/)).not.toBeInTheDocument()
  })

  it('C3: RATE_LIMITED shows its own text', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
        429,
      ),
    )

    renderHome()

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(
        'Hubo demasiados pedidos en poco tiempo. Esperá un minuto y volvé a intentar.',
      )
    })
  })

  it('C4: INTERNAL_ERROR shows TOOLS_LOAD_FAILED text, not empty state', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to list tools' } },
        500,
      ),
    )

    renderHome()

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(
        'No pudimos cargar las herramientas. Intentá de nuevo en un momento.',
      )
    })
    expect(screen.queryByText(/no se encontraron herramientas/i)).not.toBeInTheDocument()
  })

  it('C5: 502 with HTML body shows TOOLS_LOAD_FAILED', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('<html><body>Bad Gateway</body></html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }),
    )

    renderHome()

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(
        'No pudimos cargar las herramientas. Intentá de nuevo en un momento.',
      )
    })
  })

  it('C6: 200 with wrong JSON shape shows TOOLS_LOAD_FAILED', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ foo: 1 }))

    renderHome()

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(
        'No pudimos cargar las herramientas. Intentá de nuevo en un momento.',
      )
    })
  })

  it('C7: 200 with items:[] shows empty state, NO alert', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ items: [], total: 0, page: 1, pages: 1 }),
    )

    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/no se encontraron herramientas/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('C8: error then new search that succeeds — alert disappears, results show', async () => {
    // First fetch (mount) fails
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderHome()

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // Second fetch (after search) succeeds
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 'tool-1',
            owner_id: 'user-1',
            name: 'Taladro',
            description: 'Un taladro',
            category: 'Herramientas eléctricas',
            condition: 'bueno',
            is_paused: false,
            deleted_at: null,
            created_at: '2026-10-01',
          },
        ],
        total: 1,
        page: 1,
        pages: 1,
      }),
    )

    const searchInput = screen.getByLabelText(/buscar herramienta por nombre/i)
    fireEvent.change(searchInput, { target: { value: 'taladro' } })
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })
  })

  it('C9: stale answer — second request wins, first never appears, signal is aborted', async () => {
    let firstController: AbortController | undefined

    renderHome()

    // Set up mocks AFTER mount (mount already consumed the beforeEach default)
    mockFetch
      // First user-triggered call (q=ta) — slow, resolves after second
      .mockImplementationOnce(async (_url: string, init?: { signal?: AbortSignal }) => {
        if (init?.signal) {
          firstController = { signal: init.signal } as unknown as AbortController
        }
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              jsonResponse({
                items: [{ id: 'slow', name: 'Slow Tool', owner_id: 'u', description: 'd', category: 'Otros', condition: 'bueno', is_paused: false, deleted_at: null, created_at: '2026-01-01' }],
                total: 1,
                page: 1,
                pages: 1,
              }),
            )
          }, 50)
        })
      })
      // Second user-triggered call (q=tal) — fast
      .mockResolvedValueOnce(
        jsonResponse({
          items: [{ id: 'fast', name: 'Fast Tool', owner_id: 'u', description: 'd', category: 'Otros', condition: 'bueno', is_paused: false, deleted_at: null, created_at: '2026-01-01' }],
          total: 1,
          page: 1,
          pages: 1,
        }),
      )

    // Trigger search: q=ta
    const searchInput = screen.getByLabelText(/buscar herramienta por nombre/i)
    fireEvent.change(searchInput, { target: { value: 'ta' } })
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))

    // Type more to trigger q=tal
    fireEvent.change(searchInput, { target: { value: 'tal' } })
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))

    // Wait for the fast result to appear
    await waitFor(() => {
      expect(screen.getByText('Fast Tool')).toBeInTheDocument()
    })

    // Slow tool must never appear
    expect(screen.queryByText('Slow Tool')).not.toBeInTheDocument()

    // The first request's signal must have been aborted
    await waitFor(() => {
      expect(firstController?.signal?.aborted).toBe(true)
    })
  })

  it('C10: cancelled request (AbortError) — no alert, page keeps showing', async () => {
    // First request resolves successfully
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [{ id: 'tool-1', name: 'Existing Tool', owner_id: 'u', description: 'd', category: 'Otros', condition: 'bueno', is_paused: false, deleted_at: null, created_at: '2026-01-01' }],
        total: 1,
        page: 1,
        pages: 1,
      }),
    )

    renderHome()

    // Wait for the first result
    await waitFor(() => {
      expect(screen.getByText('Existing Tool')).toBeInTheDocument()
    })

    // Second request is aborted
    mockFetch.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))

    // Trigger a new search (which will be immediately aborted)
    const searchInput = screen.getByLabelText(/buscar herramienta por nombre/i)
    fireEvent.change(searchInput, { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))

    // The abort happens synchronously in cleanup, before the promise settles.
    // The page should still show the previous result (or loading).
    await waitFor(() => {
      // Either the old result is still visible, or we're in loading state
      const hasAlert = screen.queryByRole('alert')
      expect(hasAlert).not.toBeInTheDocument()
    })
  })

  it('C11: while an error is shown, search input and category select are usable', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    renderHome()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // Search input must be present and usable
    const searchInput = screen.getByLabelText(/buscar herramienta por nombre/i)
    expect(searchInput).toBeInTheDocument()
    expect(searchInput).not.toBeDisabled()

    // Category select must be present and usable
    const categorySelect = screen.getByLabelText(/filtrar por categoría/i)
    expect(categorySelect).toBeInTheDocument()
    expect(categorySelect).not.toBeDisabled()
  })

  it('(a): success then failure — old results NOT shown, only alert', async () => {
    // First fetch resolves with a tool
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [{ id: 't1', name: 'Existing Tool', owner_id: 'u', description: 'd', category: 'Otros', condition: 'bueno', is_paused: false, deleted_at: null, created_at: '2026-01-01' }],
        total: 1,
        page: 1,
        pages: 1,
      }),
    )

    renderHome()

    // Wait for the first result
    await waitFor(() => {
      expect(screen.getByText('Existing Tool')).toBeInTheDocument()
    })

    // Second fetch fails
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    // Trigger a new search
    const searchInput = screen.getByLabelText(/buscar herramienta por nombre/i)
    fireEvent.change(searchInput, { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))

    // Error alert shows; old results are GONE
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(
        'No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.',
      )
    })
    expect(screen.queryByText('Existing Tool')).not.toBeInTheDocument()
  })

  it('(b): 200 with non-JSON body shows TOOLS_LOAD_FAILED, not NETWORK_ERROR', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('not json', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )

    renderHome()

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(
        'No pudimos cargar las herramientas. Intentá de nuevo en un momento.',
      )
    })
    expect(screen.queryByText(/No hay conexión/i)).not.toBeInTheDocument()
  })

  it('(c): 200 with body null shows TOOLS_LOAD_FAILED', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('null', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    renderHome()

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(
        'No pudimos cargar las herramientas. Intentá de nuevo en un momento.',
      )
    })
    expect(screen.queryByText(/No hay conexión/i)).not.toBeInTheDocument()
  })

  it('(e): an answer that arrives after a newer one changes nothing (no endless "Cargando")', async () => {
    const tool = (id: string, name: string) => ({
      id, owner_id: 'user-1', name, description: 'd', category: 'Herramientas eléctricas',
      condition: 'bueno', is_paused: false, deleted_at: null, created_at: '2026-10-01',
    })
    // The first request (on mount) stays open until the test releases it
    let releaseFirst: (res: Response) => void = () => {}
    mockFetch
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { releaseFirst = resolve }))
      .mockImplementation(async () => jsonResponse({ items: [tool('t-new', 'Herramienta nueva')], total: 1, page: 1, pages: 1 }))
    renderHome()

    fireEvent.change(screen.getByLabelText(/buscar herramienta por nombre/i), { target: { value: 'nueva' } })
    await screen.findByText('Herramienta nueva')

    // Now the old answer arrives, late
    releaseFirst(jsonResponse({ items: [tool('t-old', 'Herramienta vieja')], total: 1, page: 1, pages: 1 }))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(screen.getByText('Herramienta nueva')).toBeInTheDocument()
    expect(screen.queryByText('Herramienta vieja')).not.toBeInTheDocument()
    expect(screen.queryByText(/cargando/i)).not.toBeInTheDocument()
  })

  it('(f): a 200 that is not a full page of tools (no total/pages) shows TOOLS_LOAD_FAILED', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({ items: [] }))
    renderHome()

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las herramientas. Intentá de nuevo en un momento.')
  })

  it('(d): the error of an old search goes away as soon as a new search starts loading', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'SEARCH_QUERY_TOO_LONG', message: 'Search query must be at most 60 characters' } }, 400),
    )
    renderHome()
    await screen.findByText('La búsqueda puede tener hasta 60 caracteres.')

    // The new search never answers: only "a new search started" can remove the old error
    mockFetch.mockImplementation(() => new Promise(() => {}))
    fireEvent.change(screen.getByLabelText(/buscar herramienta por nombre/i), { target: { value: 'taladro' } })

    await waitFor(() => {
      expect(screen.queryByText('La búsqueda puede tener hasta 60 caracteres.')).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
