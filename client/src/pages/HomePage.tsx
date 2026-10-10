import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ToolCard, type Tool } from '../components/ToolCard'

const CATEGORIES = [
  'Herramientas eléctricas',
  'Herramientas manuales',
  'Jardín',
  'Limpieza',
  'Escaleras y altura',
  'Otros',
] as const

const CATEGORY_LABELS: Record<string, string> = {
  'Herramientas eléctricas': 'Herramientas eléctricas',
  'Herramientas manuales': 'Herramientas manuales',
  'Jardín': 'Jardín',
  'Limpieza': 'Limpieza',
  'Escaleras y altura': 'Escaleras y altura',
  'Otros': 'Otros',
}

interface PaginatedTools {
  items: Tool[]
  total: number
  page: number
  pages: number
}

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tools, setTools] = useState<Tool[]>([])
  const [pagination, setPagination] = useState<PaginatedTools>({
    items: [],
    total: 0,
    page: 1,
    pages: 1,
  })
  const [loading, setLoading] = useState(false)

  // Read filters from URL params
  const q = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ''
  const neighborhood = searchParams.get('neighborhood') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1', 10) || 1

  const fetchTools = useCallback(async (params: Record<string, string>) => {
    setLoading(true)
    try {
      const query = new URLSearchParams(params)
      const res = await fetch(`/api/tools?${query}`)
      if (!res.ok) throw new Error('Failed to fetch tools')
      const data: PaginatedTools = await res.json()
      setTools(data.items)
      setPagination(data)
    } catch {
      setTools([])
      setPagination({ items: [], total: 0, page, pages: 1 })
    } finally {
      setLoading(false)
    }
  }, [page])

  // Initial load from URL params
  useEffect(() => {
    const params: Record<string, string> = { page: String(page) }
    if (q) params.q = q
    if (category) params.category = category
    if (neighborhood) params.neighborhood = neighborhood
    fetchTools(params)
  }, [page, q, category, neighborhood, fetchTools])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params: Record<string, string> = { page: '1' }
    if (q) params.q = q
    if (category) params.category = category
    if (neighborhood) params.neighborhood = neighborhood
    setSearchParams(params)
  }

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCategory = e.target.value
    const params: Record<string, string> = { page: '1' }
    if (q) params.q = q
    if (newCategory) params.category = newCategory
    if (neighborhood) params.neighborhood = neighborhood
    setSearchParams(params)
  }

  const handleNeighborhoodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newNeighborhood = e.target.value
    const params: Record<string, string> = { page: '1' }
    if (q) params.q = q
    if (category) params.category = category
    if (newNeighborhood) params.neighborhood = newNeighborhood
    setSearchParams(params)
  }

  const goToPage = (newPage: number) => {
    const params: Record<string, string> = { page: String(newPage) }
    if (q) params.q = q
    if (category) params.category = category
    if (neighborhood) params.neighborhood = neighborhood
    setSearchParams(params)
  }

  const clearFilters = () => {
    setSearchParams({ page: '1' })
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Prestoteca
        </h1>
        <p className="text-gray-600">
          Encontrá herramientas para prestar y pedir en tu barrio
        </p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="mb-6 space-y-4" aria-label="Filtros de búsqueda">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search input */}
          <div className="flex-1">
            <label htmlFor="search-input" className="sr-only">
              Buscar herramienta
            </label>
            <input
              id="search-input"
              type="text"
              placeholder="Buscar por nombre..."
              value={q}
              onChange={(e) => {
                // Update URL param without triggering form submit
                const params = new URLSearchParams(searchParams)
                if (e.target.value) {
                  params.set('q', e.target.value)
                } else {
                  params.delete('q')
                }
                params.set('page', '1')
                setSearchParams(params)
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Buscar herramienta por nombre"
            />
          </div>

          {/* Category filter */}
          <div>
            <label htmlFor="category-select" className="sr-only">
              Categoría
            </label>
            <select
              id="category-select"
              value={category}
              onChange={handleCategoryChange}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Filtrar por categoría"
            >
              <option value="">Todas las categorías</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>

          {/* Neighborhood filter */}
          <div>
            <label htmlFor="neighborhood-input" className="sr-only">
              Barrio
            </label>
            <input
              id="neighborhood-input"
              type="text"
              placeholder="Barrio..."
              value={neighborhood}
              onChange={handleNeighborhoodChange}
              className="w-full sm:w-40 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Filtrar por barrio"
            />
          </div>

          {/* Search button */}
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Buscar
          </button>
        </div>

        {/* Clear filters */}
        {(q || category || neighborhood) && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-blue-600 hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </form>

      {/* Results count */}
      <p className="text-sm text-gray-600 mb-4">
        {loading ? 'Cargando...' : `${pagination.total} herramienta${pagination.total !== 1 ? 's' : ''} encontrada${pagination.total !== 1 ? 's' : ''}`}
      </p>

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" role="status" aria-label="Cargando herramientas">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-lg shadow-md p-4 animate-pulse"
            >
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {/* Tools grid */}
      {!loading && tools.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && tools.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            No se encontraron herramientas
          </p>
          <p className="text-gray-400 text-sm mt-2">
            Probá con otros filtros o buscá otra cosa
          </p>
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <nav className="flex justify-center items-center gap-2 mt-6" aria-label="Paginación de resultados">
          <button
            onClick={() => goToPage(pagination.page - 1)}
            disabled={pagination.page === 1}
            className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            aria-label="Página anterior"
          >
            ← Anterior
          </button>

          {Array.from({ length: pagination.pages }, (_, i) => i + 1)
            .filter((p) => {
              // Show first, last, current, and adjacent pages
              if (p === 1 || p === pagination.pages) return true
              if (Math.abs(p - pagination.page) <= 1) return true
              return false
            })
            .map((p, idx, arr) => {
              // Add ellipsis between non-adjacent pages
              const showEllipsis = idx > 0 && p - arr[idx - 1] > 1
              return (
                <span key={p}>
                  {showEllipsis && (
                    <span className="px-2 text-gray-400">...</span>
                  )}
                  <button
                    onClick={() => goToPage(p)}
                    className={`px-3 py-1 rounded border ${
                      p === pagination.page
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 hover:bg-gray-100'
                    }`}
                    aria-label={`Página ${p}`}
                    aria-current={p === pagination.page ? 'page' : undefined}
                  >
                    {p}
                  </button>
                </span>
              )
            })}

          <button
            onClick={() => goToPage(pagination.page + 1)}
            disabled={pagination.page === pagination.pages}
            className="px-3 py-1 rounded border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            aria-label="Página siguiente"
          >
            Siguiente →
          </button>
        </nav>
      )}
    </div>
  )
}
