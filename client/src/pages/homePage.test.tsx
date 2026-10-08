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

describe('HomePage', () => {
  beforeEach(() => {
    mockFetch.mockClear()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [],
        total: 0,
        page: 1,
        pages: 1,
      }),
    })
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

    expect(screen.getByRole('option', { name: /eléctricas/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /manuales/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /jardinería/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /plomería/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /gas/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /pintura/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /medición/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /construcción/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /otros/i })).toBeInTheDocument()
  })

  it('fetches tools on mount', async () => {
    renderHome()

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/tools'))
    })
  })

  it('shows empty state when no tools', async () => {
    renderHome()

    await waitFor(() => {
      expect(screen.getByText(/no se encontraron herramientas/i)).toBeInTheDocument()
    })
  })

  it('searches by name and updates URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
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
        total: 1,
        page: 1,
        pages: 1,
      }),
    })

    renderHome()

    const searchInput = screen.getByLabelText(/buscar herramienta por nombre/i)
    fireEvent.change(searchInput, { target: { value: 'taladro' } })
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('q=taladro'))
    })
  })

  it('filters by category and updates URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
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
        total: 1,
        page: 1,
        pages: 1,
      }),
    })

    renderHome()

    const categorySelect = screen.getByLabelText(/filtrar por categoría/i)
    fireEvent.change(categorySelect, { target: { value: 'electricas' } })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('category=electricas'))
    })
  })

  it('filters by neighborhood and updates URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
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
        total: 1,
        page: 1,
        pages: 1,
      }),
    })

    renderHome()

    const neighborhoodInput = screen.getByLabelText(/filtrar por barrio/i)
    fireEvent.change(neighborhoodInput, { target: { value: 'centro' } })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('neighborhood=centro'))
    })
  })

  it('shows results count', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
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
        total: 5,
        page: 1,
        pages: 1,
      }),
    })

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
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [],
        total: 25,
        page: 1,
        pages: 3,
      }),
    })

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
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [],
        total: 25,
        page: 1,
        pages: 3,
      }),
    })

    renderHome()

    await waitFor(() => {
      const prevBtn = screen.getByLabelText('Página anterior')
      expect(prevBtn).toBeDisabled()
    })
  })

  it('navigates to next page on click', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [],
        total: 25,
        page: 1,
        pages: 3,
      }),
    })

    renderHome()

    await waitFor(() => {
      expect(screen.getByLabelText('Página siguiente')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Página siguiente'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('page=2'))
    })
  })

  it('disables next button on last page', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [],
        total: 25,
        page: 3,
        pages: 3,
      }),
    })

    renderHome('/?page=3')

    await waitFor(() => {
      const nextBtn = screen.getByLabelText('Página siguiente')
      expect(nextBtn).toBeDisabled()
    })
  })

  it('displays tools from fetch result', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'tool-1',
            owner_id: 'user-1',
            name: 'Taladro',
            description: 'Un taladro potente',
            category: 'electricas',
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
    })

    renderHome()

    await waitFor(() => {
      expect(screen.getByText('Taladro')).toBeInTheDocument()
    })
  })
})
