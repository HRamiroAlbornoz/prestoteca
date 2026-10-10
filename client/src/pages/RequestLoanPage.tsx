import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const today = new Date()
const todayStr = today.toISOString().split('T')[0]

export function RequestLoanPage() {
  const { id } = useParams<{ id: string }>()
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Validation
  const isStartDateInPast = startDate && startDate < todayStr
  const isEndDateBeforeStart = startDate && endDate && endDate < startDate
  const noteTooLong = note.length > 300
  const formValid = startDate && endDate && endDate >= startDate && !isStartDateInPast && !noteTooLong

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formValid || !id || submitting) return

    setSubmitting(true)
    setError('')

    try {
      const res = await fetch(`/api/tools/${id}/loans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate,
          note: note || undefined,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        navigate(`/loans/${data.id}`)
      } else {
        const data = await res.json()
        setError(data.error?.message || 'Error al solicitar el préstamo')
      }
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!currentUser) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="text-violet-600 hover:underline mb-4 inline-block py-2 px-3"
        >
          ← Volver
        </button>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Solicitar préstamo</h1>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de inicio
              </label>
              <input
                type="date"
                id="startDate"
                value={startDate}
                min={todayStr}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                required
              />
              {isStartDateInPast && (
                <p className="text-red-600 text-sm mt-1">La fecha de inicio debe ser hoy o posterior</p>
              )}
            </div>

            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de fin
              </label>
              <input
                type="date"
                id="endDate"
                value={endDate}
                min={startDate || todayStr}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                required
              />
              {isEndDateBeforeStart && (
                <p className="text-red-600 text-sm mt-1">La fecha de fin debe ser igual o posterior a la de inicio</p>
              )}
            </div>

            <div>
              <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">
                Nota (opcional)
              </label>
              <textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="¿Para qué la necesitás?"
              />
              <p className={`text-sm mt-1 ${noteTooLong ? 'text-red-600' : 'text-gray-500'}`}>
                {note.length}/300
              </p>
              {noteTooLong && (
                <p className="text-red-600 text-sm mt-1">La nota no puede superar los 300 caracteres</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!formValid || submitting}
              className="w-full bg-violet-600 text-white py-3 px-4 rounded-md hover:bg-violet-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Solicitando...' : 'Solicitar préstamo'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
