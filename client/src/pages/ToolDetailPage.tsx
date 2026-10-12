import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { Tool } from '../components/ToolCard'

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

export function ToolDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [tool, setTool] = useState<Tool | null>(null)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTool = async () => {
      try {
        const res = await fetch(`/api/tools/${id}`, {
          headers: { 'Content-Type': 'application/json' },
        })

        if (res.ok) {
          const data = await res.json()
          setTool(data)
        } else {
          const data = await res.json()
          setError(data.error?.message || 'Tool not found')
        }
      } catch {
        setError('Network error. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    fetchTool()
  }, [id])

  const handleRequest = () => {
    if (!currentUser) {
      navigate(`/login?returnUrl=/tools/${id}`)
      return
    }
    // TODO: Navigate to loan request form (T025)
    navigate(`/tools/${id}/request`)
  }

  const isOwner = tool?.owner_id === currentUser?.id

  const handleEdit = () => {
    if (!tool) return
    navigate(`/publish/${tool.id}`)
  }

  const handlePause = async () => {
    if (!tool) return
    try {
      const res = await fetch(`/api/tools/${tool.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_paused: true }),
      })

      if (res.ok) {
        setTool({ ...tool, is_paused: true })
      }
    } catch {
      setError('Error al pausar la herramienta')
    }
  }

  const handleDelete = async () => {
    if (!tool) return
    if (!confirm('¿Estás seguro de que querés eliminar esta herramienta?')) return

    try {
      const res = await fetch(`/api/tools/${tool.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })

      if (res.ok) {
        navigate('/')
      } else {
        const data = await res.json()
        setError(data.error?.message || 'Error al eliminar la herramienta')
      }
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Cargando...</p>
      </div>
    )
  }

  if (error || !tool) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4" role="alert">
              {error}
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
              to={`/login?returnUrl=/tools/${tool.id}`}
              className="block w-full bg-violet-600 text-white py-3 px-4 rounded-md hover:bg-violet-700 font-medium text-center"
            >
              Iniciar sesión para pedir
            </Link>
          )}

          {tool.is_paused && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded mt-4">
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
