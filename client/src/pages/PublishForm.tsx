import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

const TOOL_CATEGORIES = [
  'electricas',
  'manuales',
  'jardineria',
  'plomeria',
  'gas',
  'pintura',
  'medicion',
  'construccion',
  'otros',
] as const

const TOOL_CONDITIONS = ['nuevo', 'bueno', 'usado'] as const

interface PublishFormData {
  name: string
  description: string
  category: string
  condition: string
}

export function PublishForm() {
  const [formData, setFormData] = useState<PublishFormData>({
    name: '',
    description: '',
    category: '',
    condition: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (formData.name.length < 3) {
      newErrors.name = 'El nombre debe tener al menos 3 caracteres'
    }
    if (formData.name.length > 60) {
      newErrors.name = 'El nombre no puede tener más de 60 caracteres'
    }
    if (formData.description.length > 500) {
      newErrors.description = 'La descripción no puede tener más de 500 caracteres'
    }
    if (!formData.category) {
      newErrors.category = 'Seleccioná una categoría'
    }
    if (!formData.condition) {
      newErrors.condition = 'Seleccioná un estado'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setApiError('')

    if (!validate()) return

    setLoading(true)

    try {
      const res = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          category: formData.category,
          condition: formData.condition,
        }),
      })

      if (res.ok) {
        navigate('/')
      } else {
        const data = await res.json()
        setApiError(data.error?.message || 'Error al publicar la herramienta')
      }
    } catch {
      setApiError('Error de conexión. Intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">
          Publicar herramienta
        </h1>

        {apiError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4" role="alert">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="tool-name" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre
            </label>
            <input
              id="tool-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.name && (
              <p className="text-red-600 text-sm mt-1">{errors.name}</p>
            )}
          </div>

          <div>
            <label htmlFor="tool-description" className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              id="tool-description"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.description ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.description && (
              <p className="text-red-600 text-sm mt-1">{errors.description}</p>
            )}
          </div>

          <div>
            <label htmlFor="tool-category" className="block text-sm font-medium text-gray-700 mb-1">
              Categoría
            </label>
            <select
              id="tool-category"
              required
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.category ? 'border-red-300' : 'border-gray-300'
              }`}
            >
              <option value="">Seleccioná una categoría</option>
              {TOOL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            {errors.category && (
              <p className="text-red-600 text-sm mt-1">{errors.category}</p>
            )}
          </div>

          <div>
            <label htmlFor="tool-condition" className="block text-sm font-medium text-gray-700 mb-1">
              Estado
            </label>
            <select
              id="tool-condition"
              required
              value={formData.condition}
              onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.condition ? 'border-red-300' : 'border-gray-300'
              }`}
            >
              <option value="">Seleccioná un estado</option>
              {TOOL_CONDITIONS.map((cond) => (
                <option key={cond} value={cond}>
                  {cond}
                </option>
              ))}
            </select>
            {errors.condition && (
              <p className="text-red-600 text-sm mt-1">{errors.condition}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Publicando...' : 'Publicar'}
          </button>
        </form>
      </div>
    </div>
  )
}
