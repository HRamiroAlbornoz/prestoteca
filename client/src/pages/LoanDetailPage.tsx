import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoanStatus } from '../components/LoanStatus'

interface Loan {
  id: string
  tool_id: string
  borrower_id: string
  owner_id: string
  start_date: string
  end_date: string
  status: string
  note: string | null
  created_at: string
  updated_at: string
}

export function LoanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [loan, setLoan] = useState<Loan | null>(null)
  const [toolName, setToolName] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchLoan = async () => {
      try {
        const res = await fetch(`/api/loans/${id}`, {
          headers: { 'Content-Type': 'application/json' },
        })

        if (res.ok) {
          const data: Loan = await res.json()
          setLoan(data)
          // Fetch tool name
          const toolRes = await fetch(`/api/tools/${data.tool_id}`)
          if (toolRes.ok) {
            const tool = await toolRes.json()
            setToolName(tool.name)
          }
        } else {
          const data = await res.json()
          setError(data.error?.message || 'Préstamo no encontrado')
        }
      } catch {
        setError('Error de conexión. Intentá de nuevo.')
      } finally {
        setLoading(false)
      }
    }

    fetchLoan()
  }, [id])

  const isOwner = loan?.owner_id === currentUser?.id
  const isBorrower = loan?.borrower_id === currentUser?.id
  const isParticipant = isOwner || isBorrower

  const handleStatusChange = async (newStatus: string) => {
    if (!loan) return

    try {
      const res = await fetch(`/api/loans/${loan.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (res.ok) {
        const updated = await res.json()
        setLoan(updated)
      } else {
        const data = await res.json()
        setError(data.error?.message || 'Error al cambiar el estado')
      }
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-AR')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Cargando...</p>
      </div>
    )
  }

  if (error || !loan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4" role="alert">
              {error}
            </div>
          )}
          <Link to="/" className="text-blue-600 hover:underline">
            Volver al inicio
          </Link>
        </div>
      </div>
    )
  }

  const actionButtons = () => {
    if (!isParticipant) return null

    switch (loan.status) {
      case 'pendiente':
        if (isOwner) {
          return (
            <>
              <button
                onClick={() => handleStatusChange('aceptado')}
                className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 font-medium"
              >
                Aceptar
              </button>
              <button
                onClick={() => handleStatusChange('rechazado')}
                className="flex-1 bg-red-100 text-red-700 py-2 px-4 rounded-md hover:bg-red-200 font-medium"
              >
                Rechazar
              </button>
              <button
                onClick={() => handleStatusChange('cancelado')}
                className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 font-medium"
              >
                Cancelar
              </button>
            </>
          )
        }
        return null

      case 'aceptado':
        if (isOwner) {
          return (
            <>
              <button
                onClick={() => handleStatusChange('entregado')}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 font-medium"
              >
                Marcar entregado
              </button>
              <button
                onClick={() => handleStatusChange('cancelado')}
                className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 font-medium"
              >
                Cancelar
              </button>
            </>
          )
        }
        if (isBorrower) {
          return (
            <button
              onClick={() => handleStatusChange('cancelado')}
              className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 font-medium"
            >
              Cancelar
            </button>
          )
        }
        return null

      case 'entregado':
        if (isOwner) {
          return (
            <button
              onClick={() => handleStatusChange('devuelto')}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 font-medium"
            >
              Marcar devuelto
            </button>
          )
        }
        return null

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Volver al inicio
        </Link>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900">Préstamo</h1>
            <LoanStatus status={loan.status} />
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-medium text-gray-500">Herramienta</h2>
              <p className="text-gray-900">{toolName || 'Cargando...'}</p>
            </div>

            <div>
              <h2 className="text-sm font-medium text-gray-500">Fechas</h2>
              <p className="text-gray-900">
                {formatDate(loan.start_date)} — {formatDate(loan.end_date)}
              </p>
            </div>

            {loan.note && (
              <div>
                <h2 className="text-sm font-medium text-gray-500">Nota</h2>
                <p className="text-gray-900">{loan.note}</p>
              </div>
            )}

            {loan.status === 'pendiente' && (
              <div>
                <h2 className="text-sm font-medium text-gray-500">Solicitante</h2>
                <p className="text-gray-900">
                  {isBorrower ? currentUser?.name : 'Pendiente'}
                </p>
              </div>
            )}
          </div>

          {isParticipant && actionButtons() && (
            <div className="mt-6 pt-4 border-t border-gray-200 flex flex-col gap-2">
              {actionButtons()}
            </div>
          )}

          {['devuelto', 'cancelado', 'rechazado', 'vencido'].includes(loan.status) && (
            <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-500 text-center">
              Este préstamo ha finalizado.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
