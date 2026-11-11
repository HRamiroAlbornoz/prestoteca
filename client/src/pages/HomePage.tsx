import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ToolCard, type Tool } from '../components/ToolCard'
import { fetchFailureCode, readApiError } from '../errors/apiError'
import { messageFor, type ClientErrorCode } from '../errors/messages'

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

type ResultState = {
  key: string
  data?: PaginatedTools
  code?: ClientErrorCode
}

// Asks for one page of tools. Never throws for an answer: a failed response or a 2xx whose
// body is not a page of tools comes back as a code. Only fetch itself can throw (no connection,
// or the request was cancelled).
async function fetchTools(
  query: string,
  signal: AbortSignal,
): Promise<{ data: PaginatedTools } | { code: ClientErrorCode }> {
  const res = await fetch(`/api/tools?${query}`, { signal })
  if (!res.ok) return { code: await readApiError(res) }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return { code: 'TOOLS_LOAD_FAILED' } // not JSON
  }
  const page = data as Partial<PaginatedTools> | null
  const isPage =
    typeof page === 'object' &&
    page !== null &&
    Array.isArray(page.items) &&
    typeof page.total === 'number' &&
    typeof page.page === 'number' &&
    typeof page.pages === 'number'
  return isPage ? { data: page as PaginatedTools } : { code: 'TOOLS_LOAD_FAILED' }
}

function mapErrorCode(code: ClientErrorCode): ClientErrorCode {
  switch (code) {
    case 'NETWORK_ERROR':
    case 'SEARCH_QUERY_TOO_LONG':
    case 'RATE_LIMITED':
      return code
    default:
      return 'TOOLS_LOAD_FAILED'
  }
}

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [result, setResult] = useState<ResultState | null>(null)

  // Read filters from URL params
  const q = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? ''
  const neighborhood = searchParams.get('neighborhood') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1', 10) || 1

  // The current filters as a query string. It is both what is asked to the server and the
  // "name" of the answer: an answer counts only while its key is still the current one.
  const requestKey = new URLSearchParams({
    page: String(page),
    ...(q && { q }),
    ...(category && { category }),
    ...(neighborhood && { neighborhood }),
  }).toString()

  // Derive loading from whether the latest result matches the current key
  const isLoading = result?.key !== requestKey

  // Fetch tools when filters change
  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      let outcome: { data: PaginatedTools } | { code: ClientErrorCode }
      try {
        outcome = await fetchTools(requestKey, controller.signal)
      } catch (err: unknown) {
        // fetch itself failed: no connection, or this request was cancelled (null)
        const code = fetchFailureCode(err)
        if (code === null || controller.signal.aborted) return
        setResult({ key: requestKey, code: mapErrorCode(code) })
        return
      }

      // A newer request replaced this one: its answer must not touch the screen
      if (controller.signal.aborted) return

      setResult('code' in outcome ? { key: requestKey, code: mapErrorCode(outcome.code) } : { key: requestKey, data: outcome.data })
    }

    load()

    return () => {
      controller.abort()
    }
  }, [requestKey])

  // Derive display values from result — only when this result is still current
  const current = result?.key === requestKey ? result : null
  const tools = current?.data?.items ?? []
  // While a new page loads, the page buttons stay (from the last list): taking them away would
  // drop the keyboard focus from the button just pressed. After an error there is no list, so none.
  const pagination: PaginatedTools =
    current?.data ?? (isLoading ? result?.data : undefined) ?? { items: [], total: 0, page, pages: 1 }
  const errorMessage = current?.code ? messageFor(current.code) : null

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
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-violet-500"
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
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-violet-500"
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
              className="w-full sm:w-40 px-4 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-violet-500"
              aria-label="Filtrar por barrio"
            />
          </div>

          {/* Search button */}
          <button
            type="submit"
            className="px-6 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 focus:outline-hidden focus:ring-2 focus:ring-violet-500"
          >
            Buscar
          </button>
        </div>

        {/* Clear filters */}
        {(q || category || neighborhood) && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-violet-600 hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </form>

      {/* Error message */}
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md" role="alert">
          <p className="text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* Results count */}
      <p className="text-sm text-gray-600 mb-4">
        {isLoading ? 'Cargando...' : `${pagination.total} herramienta${pagination.total !== 1 ? 's' : ''} encontrada${pagination.total !== 1 ? 's' : ''}`}
      </p>

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" role="status" aria-label="Cargando herramientas">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-lg shadow-md p-4 animate-pulse"
            >
              <div className="h-5 bg-gray-200 rounded-sm w-3/4 mb-3" />
              <div className="h-3 bg-gray-200 rounded-sm w-1/2 mb-2" />
              <div className="h-3 bg-gray-200 rounded-sm w-2/3" />
            </div>
          ))}
        </div>
      )}

      {/* Tools grid */}
      {!isLoading && tools.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && tools.length === 0 && !errorMessage && (
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
            className="px-3 py-1 rounded-sm border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
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
                    className={`px-3 py-1 rounded-sm border ${
                      p === pagination.page
                        ? 'bg-violet-600 text-white border-violet-600'
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
            className="px-3 py-1 rounded-sm border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
            aria-label="Página siguiente"
          >
            Siguiente →
          </button>
        </nav>
      )}
    </div>
  )
}
