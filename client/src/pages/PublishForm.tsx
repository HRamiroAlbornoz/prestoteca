import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import * as z from 'zod/mini'
import {
  EMPTY_TOOL_FORM,
  TOOL_CATEGORIES,
  TOOL_CONDITIONS,
  loadedToolSchema,
  toolFormSchema,
  validateToolField,
  type ToolFormValues,
} from '../utils/toolForm'

type Field = keyof ToolFormValues
type FieldErrors = Partial<Record<Field, string>>

// Edit mode only: loading the tool that will be edited
type LoadState = 'loading' | 'ready' | 'not-found' | 'error'
// Sending the form
type SubmitStatus = 'idle' | 'loading' | 'error' | 'success'

// What the user reads when an edit cannot be saved. The server's own messages are technical and in English.
function editErrorMessage(status: number): string {
  if (status === 403) return 'Solo podés editar tus propias herramientas.'
  if (status === 404) return 'Esta herramienta ya no existe.'
  return 'No se pudieron guardar los cambios. Intentá de nuevo.'
}

async function publishErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data.error?.message || 'Error al publicar la herramienta'
  } catch {
    return 'Error al publicar la herramienta'
  }
}

// One form, two jobs: /publish creates a tool (POST); /tools/:id/edit changes an existing one (PATCH)
export function PublishForm() {
  const { id: toolId } = useParams<{ id: string }>()
  const isEdit = toolId !== undefined
  const navigate = useNavigate()

  const [values, setValues] = useState<ToolFormValues>(EMPTY_TOOL_FORM)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [apiError, setApiError] = useState('')
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [loadState, setLoadState] = useState<LoadState>(isEdit ? 'loading' : 'ready')

  // Edit mode: bring the tool's current data and put it in the form
  useEffect(() => {
    if (!toolId) return
    const controller = new AbortController()

    async function loadTool() {
      try {
        const res = await fetch(`/api/tools/${toolId}`, { signal: controller.signal })
        if (res.status === 404) {
          setLoadState('not-found')
          return
        }
        if (!res.ok) {
          setLoadState('error')
          return
        }
        // Never trust the shape of an answer: if it is not what the form needs, treat it as an error
        const parsed = loadedToolSchema.safeParse(await res.json())
        if (!parsed.success) {
          setLoadState('error')
          return
        }
        const { name, description, category, condition } = parsed.data
        setValues({ name, description, category, condition })
        setLoadState('ready')
      } catch {
        // Leaving the page cancels the request on purpose; that is not an error to show
        if (controller.signal.aborted) return
        setLoadState('error')
      }
    }

    loadTool()
    // Cancel the request if the user leaves before it answers
    return () => controller.abort()
  }, [toolId])

  // While typing: only re-check a field that already shows an error, so the message goes away once it is fixed
  const handleChange = (field: Field) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.value
    setValues((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: validateToolField(field, value) }))
    }
  }

  // When the user leaves a field, check it
  const handleBlur = (field: Field) => () => {
    setErrors((prev) => ({ ...prev, [field]: validateToolField(field, values[field]) }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setApiError('')

    const result = toolFormSchema.safeParse(values)
    if (!result.success) {
      const fieldErrors = z.flattenError(result.error).fieldErrors
      setErrors({
        name: fieldErrors.name?.[0],
        description: fieldErrors.description?.[0],
        category: fieldErrors.category?.[0],
        condition: fieldErrors.condition?.[0],
      })
      return
    }

    setStatus('loading')
    try {
      // result.data has the values already trimmed; only these 4 fields are sent
      const res = await fetch(isEdit ? `/api/tools/${toolId}` : '/api/tools', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.data),
      })

      if (res.ok) {
        setStatus('success')
        navigate(isEdit ? `/tools/${toolId}` : '/')
        return
      }

      // On error, keep everything the user typed so they can fix it or retry
      setApiError(isEdit ? editErrorMessage(res.status) : await publishErrorMessage(res))
      setStatus('error')
    } catch {
      setApiError('Error de conexión. Intentá de nuevo.')
      setStatus('error')
    }
  }

  const isSaving = status === 'loading'
  const title = isEdit ? 'Editar herramienta' : 'Publicar herramienta'

  // Red border when the field has an error
  const fieldClass = (field: Field) =>
    `w-full px-3 py-2 border rounded-md focus:outline-hidden focus:ring-2 focus:ring-violet-500 disabled:opacity-60 ${
      errors[field] ? 'border-red-300' : 'border-gray-300'
    }`

  // Tells screen readers that the field is wrong and which text explains why
  const errorProps = (field: Field, inputId: string) =>
    errors[field] ? { 'aria-invalid': true, 'aria-describedby': `${inputId}-error` } : {}

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center text-gray-900 mb-6">{title}</h1>

        {loadState === 'loading' && (
          <p className="text-center text-gray-600" role="status">Cargando herramienta...</p>
        )}

        {(loadState === 'not-found' || loadState === 'error') && (
          <div className="text-center">
            <p className="text-gray-700 mb-4" role="alert">
              {loadState === 'not-found'
                ? 'Esta herramienta no existe o fue eliminada.'
                : 'No se pudo cargar la herramienta. Revisá tu conexión e intentá de nuevo.'}
            </p>
            <Link to="/" className="inline-block py-2 px-3 text-violet-600 hover:underline">
              Volver al inicio
            </Link>
          </div>
        )}

        {loadState === 'ready' && (
          <>
            {apiError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm mb-4" role="alert">
                {apiError}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* A disabled fieldset disables every field and the button inside it: no double submits */}
              <fieldset disabled={isSaving} className="space-y-4">
                <div>
                  <label htmlFor="tool-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre
                  </label>
                  <input
                    id="tool-name"
                    type="text"
                    required
                    value={values.name}
                    onChange={handleChange('name')}
                    onBlur={handleBlur('name')}
                    className={fieldClass('name')}
                    {...errorProps('name', 'tool-name')}
                  />
                  {errors.name && (
                    <p id="tool-name-error" className="text-red-600 text-sm mt-1">{errors.name}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="tool-description" className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  <textarea
                    id="tool-description"
                    rows={3}
                    required
                    value={values.description}
                    onChange={handleChange('description')}
                    onBlur={handleBlur('description')}
                    className={fieldClass('description')}
                    {...errorProps('description', 'tool-description')}
                  />
                  {errors.description && (
                    <p id="tool-description-error" className="text-red-600 text-sm mt-1">{errors.description}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="tool-category" className="block text-sm font-medium text-gray-700 mb-1">
                    Categoría
                  </label>
                  <select
                    id="tool-category"
                    required
                    value={values.category}
                    onChange={handleChange('category')}
                    onBlur={handleBlur('category')}
                    className={fieldClass('category')}
                    {...errorProps('category', 'tool-category')}
                  >
                    <option value="">Seleccioná una categoría</option>
                    {TOOL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  {errors.category && (
                    <p id="tool-category-error" className="text-red-600 text-sm mt-1">{errors.category}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="tool-condition" className="block text-sm font-medium text-gray-700 mb-1">
                    Estado
                  </label>
                  <select
                    id="tool-condition"
                    required
                    value={values.condition}
                    onChange={handleChange('condition')}
                    onBlur={handleBlur('condition')}
                    className={fieldClass('condition')}
                    {...errorProps('condition', 'tool-condition')}
                  >
                    <option value="">Seleccioná un estado</option>
                    {TOOL_CONDITIONS.map((cond) => (
                      <option key={cond} value={cond}>
                        {cond}
                      </option>
                    ))}
                  </select>
                  {errors.condition && (
                    <p id="tool-condition-error" className="text-red-600 text-sm mt-1">{errors.condition}</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full bg-violet-600 text-white py-2 px-4 rounded-md hover:bg-violet-700 disabled:opacity-50"
                >
                  {isEdit
                    ? (isSaving ? 'Guardando...' : 'Guardar cambios')
                    : (isSaving ? 'Publicando...' : 'Publicar')}
                </button>

                {isEdit && (
                  <Link
                    to={`/tools/${toolId}`}
                    className="block text-center py-2 text-violet-600 hover:underline"
                  >
                    Cancelar
                  </Link>
                )}
              </fieldset>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
