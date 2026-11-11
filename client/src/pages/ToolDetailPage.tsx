import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { Tool } from '../components/ToolCard'
import { readApiError, fetchFailureCode } from '../errors/apiError'
import { useApiError } from '../errors/useApiError'
import { messageFor, type ClientErrorCode } from '../errors/messages'

const categoryLabels: Record<string, string> = {
  'Herramientas eléctricas': 'Herramientas eléctricas',
  'Herramientas manuales': 'Herramientas manuales',
  'Jardín': 'Jardín',
  'Limpieza': 'Limpieza',
  'Escaleras y altura': 'Escaleras y altura',
  'Otros': 'Otros',
}

const conditionLabels: Record<string, string> = {
  nuevo: 'Nuevo',
  bueno: 'Bueno',
  usado: 'Usado',
}

// Never trust the shape of an answer: the page needs at least the tool's id and name.
function isToolShape(data: unknown): data is Tool {
  if (typeof data !== 'object' || data === null) return false
  const candidate = data as { id?: unknown; name?: unknown }
  return typeof candidate.id === 'string' && typeof candidate.name === 'string'
}

// How loading the tool ended: the tool, or an error code (null = the request was cancelled, nothing to show).
type ToolLoad = { tool: Tool } | { code: ClientErrorCode | null }

async function loadTool(id: string | undefined, signal: AbortSignal): Promise<ToolLoad> {
  try {
    const res = await fetch(`/api/tools/${id}`, {
      signal,
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) return { code: await readApiError(res) }
    try {
      const data: unknown = await res.json()
      return isToolShape(data) ? { tool: data } : { code: 'UNKNOWN_ERROR' }
    } catch {
      // A 2xx whose body is not JSON is a broken answer, not a lost connection
      return { code: signal.aborted ? null : 'UNKNOWN_ERROR' }
    }
  } catch (err) {
    return { code: fetchFailureCode(err) }
  }
}

export function ToolDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const { handle } = useApiError()
  const [tool, setTool] = useState<Tool | null>(null)
  const [loadError, setLoadError] = useState<string>('')
  const [actionError, setActionError] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    loadTool(id, controller.signal).then((result) => {
      // The person left the page (or opened another tool): this answer is old, touch nothing
      if (controller.signal.aborted) return
      if ('tool' in result) {
        setTool(result.tool)
      } else if (result.code) {
        // SESSION_REQUIRED goes to the login (handle gives null); any other code, its text
        setLoadError(handle(result.code) ?? '')
      }
      setLoading(false)
    })

    // Cancel the request if the person leaves before it answers
    return () => controller.abort()
  }, [id, handle])

  const handleRequest = () => {
    if (!currentUser) {
      // returnTo is what the login reads (it used to be returnUrl, which the login ignored)
      navigate(`/login?returnTo=${encodeURIComponent(`/tools/${id}`)}`)
      return
    }
    // TODO: Navigate to loan request form (T025)
    navigate(`/tools/${id}/request`)
  }

  const isOwner = tool?.owner_id === currentUser?.id

  const handleEdit = () => {
    if (!tool) return
    navigate(`/tools/${tool.id}/edit`)
  }

  const handlePause = async () => {
    if (!tool) return
    setActionError('')
    try {
      const res = await fetch(`/api/tools/${tool.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_paused: true }),
      })

      if (res.ok) {
        setTool({ ...tool, is_paused: true })
      } else {
        // SESSION_REQUIRED leads to the login (handle gives null); any other code, its text above the tool
        setActionError(handle(await readApiError(res)) ?? '')
      }
    } catch (err) {
      const code = fetchFailureCode(err)
      if (code) setActionError(messageFor(code))
    }
  }

  const handleDelete = async () => {
    if (!tool) return
    if (!confirm('¿Estás seguro de que querés eliminar esta herramienta?')) return

    setActionError('')
    try {
      const res = await fetch(`/api/tools/${tool.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })

      if (res.ok) {
        navigate('/')
      } else {
        setActionError(handle(await readApiError(res)) ?? '')
      }
    } catch (err) {
      const code = fetchFailureCode(err)
      if (code) setActionError(messageFor(code))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Cargando...</p>
      </div>
    )
  }

  if (loadError || !tool) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          {loadError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm mb-4" role="alert">
              {loadError}
            </div>
          )}
          <Link to="/" className="text-violet-600 hover:underline">
            Volver al inicio
          </Link>
        </div>
      </div>
    )
  }

  const categoryLabel = categoryLabels[tool.category] || tool.category
  const conditionLabel = conditionLabels[tool.condition] || tool.condition
  const statusLabel = tool.is_paused ? 'Pausada' : 'Disponible'

  const conditionColors: Record<string, string> = {
    nuevo: 'bg-green-100 text-green-800',
    bueno: 'bg-violet-100 text-violet-800',
    usado: 'bg-yellow-100 text-yellow-800',
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-violet-600 hover:underline mb-4 inline-block py-2 px-3">
          ← Volver al inicio
        </Link>

        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm mb-4" role="alert">
            {actionError}
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{tool.name}</h1>

          <div className="flex flex-wrap gap-2 mb-4">
            <span className="inline-block px-3 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-700">
              {categoryLabel}
            </span>
            <span
              className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${
                conditionColors[tool.condition] || 'bg-gray-100 text-gray-700'
              }`}
            >
              {conditionLabel}
            </span>
            <span
              className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${
                tool.is_paused
                  ? 'bg-red-100 text-red-800'
                  : 'bg-green-100 text-green-800'
              }`}
            >
              {statusLabel}
            </span>
          </div>

          <p className="text-gray-700 mb-6">{tool.description}</p>

          {!tool.is_paused && currentUser && (
            <button
              onClick={handleRequest}
              className="w-full bg-violet-600 text-white py-3 px-4 rounded-md hover:bg-violet-700 font-medium"
            >
              Pedir prestada
            </button>
          )}

          {!currentUser && (
            <Link
              to={`/login?returnTo=${encodeURIComponent(`/tools/${tool.id}`)}`}
              className="block w-full bg-violet-600 text-white py-3 px-4 rounded-md hover:bg-violet-700 font-medium text-center"
            >
              Iniciar sesión para pedir
            </Link>
          )}

          {tool.is_paused && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-sm mt-4">
              Esta herramienta está pausada momentáneamente.
            </div>
          )}

          {isOwner && (
            <div className="mt-4 pt-4 border-t border-gray-200 flex flex-col gap-2">
              <button
                onClick={handleEdit}
                className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200"
              >
                Editar
              </button>
              <button
                onClick={handlePause}
                className="w-full bg-yellow-100 text-yellow-700 py-2 px-4 rounded-md hover:bg-yellow-200"
              >
                Pausar
              </button>
              <button
                onClick={handleDelete}
                className="w-full bg-red-100 text-red-700 py-2 px-4 rounded-md hover:bg-red-200"
              >
                Eliminar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
