import { Link } from 'react-router-dom'

export interface Tool {
  id: string
  owner_id: string
  name: string
  description: string
  category: string
  condition: string
  is_paused: boolean
  deleted_at: string | null
  created_at: string
}

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

export function ToolCard({ tool }: { tool: Tool }) {
  const categoryLabel = categoryLabels[tool.category] || tool.category
  const conditionLabel = conditionLabels[tool.condition] || tool.condition
  const statusLabel = tool.is_paused ? 'Pausada' : 'Disponible'

  const conditionColors: Record<string, string> = {
    nuevo: 'bg-green-100 text-green-800',
    bueno: 'bg-violet-100 text-violet-800',
    usado: 'bg-yellow-100 text-yellow-800',
  }

  return (
    <Link
      to={`/tools/${tool.id}`}
      className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-4"
      aria-label={`Ver detalle de ${tool.name}`}
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{tool.name}</h3>

      <div className="flex flex-wrap gap-2 mb-3">
        <span className="inline-block px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
          {categoryLabel}
        </span>
        <span
          className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
            conditionColors[tool.condition] || 'bg-gray-100 text-gray-700'
          }`}
        >
          {conditionLabel}
        </span>
        <span
          className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
            tool.is_paused
              ? 'bg-red-100 text-red-800'
              : 'bg-green-100 text-green-800'
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <p className="text-sm text-gray-600 line-clamp-2">{tool.description}</p>
    </Link>
  )
}
