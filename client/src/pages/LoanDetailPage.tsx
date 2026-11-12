import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoanStatus } from '../components/LoanStatus'
import { readApiError, fetchFailureCode } from '../errors/apiError'
import { useApiError } from '../errors/useApiError'
import { type ClientErrorCode, messageFor } from '../errors/messages'

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

// Never trust the shape of an answer: the page needs the ids that decide who sees which button
function isLoanShape(data: unknown): data is Loan {
  if (typeof data !== 'object' || data === null) return false
  const candidate = data as Partial<Record<keyof Loan, unknown>>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.tool_id === 'string' &&
    typeof candidate.owner_id === 'string' &&
    typeof candidate.borrower_id === 'string' &&
    typeof candidate.status === 'string'
  )
}

// Module-level load function that never throws
// Returns either { loan: Loan } or { code: ClientErrorCode | null }
// TypeScript uses discriminated union to narrow types correctly
type LoanLoadResult = { loan: Loan } | { code: ClientErrorCode | null }

async function loadLoan(
  id: string,
  signal: AbortSignal
): Promise<LoanLoadResult> {
  try {
    const res = await fetch(`/api/loans/${id}`, {
      headers: { 'Content-Type': 'application/json' },
      signal,
    })

    if (!res.ok) {
      const code = await readApiError(res)
      return { code }
    }

    let data: unknown
    try {
      data = await res.json()
    } catch {
      // A 2xx whose body is not JSON is a broken answer, not a lost connection
      return { code: signal.aborted ? null : 'UNKNOWN_ERROR' }
    }

    return isLoanShape(data) ? { loan: data } : { code: 'UNKNOWN_ERROR' }
  } catch (err) {
    return { code: fetchFailureCode(err) }
  }
}

// Module-level tool name loader — never throws, keeps loan even if it fails
async function loadToolName(toolId: string, signal: AbortSignal): Promise<string> {
  try {
    const res = await fetch(`/api/tools/${toolId}`, { signal })
    if (res.ok) {
      const tool = await res.json()
      return typeof tool?.name === 'string' ? tool.name : ''
    }
    return ''
  } catch {
    return ''
  }
}

export function LoanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { currentUser } = useAuth()
  const { handle } = useApiError()
  const [loan, setLoan] = useState<Loan | null>(null)
  const [toolName, setToolName] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [actionError, setActionError] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    loadLoan(id ?? '', controller.signal)
      .then(result => {
        if (controller.signal.aborted) return

        if ('loan' in result) {
          setError('')
          setLoan(result.loan)

          // Fetch tool name (optional, keep loan even if it fails)
          loadToolName(result.loan.tool_id, controller.signal).then(
            name => { if (!controller.signal.aborted) setToolName(name) },
          )
        } else if (result.code) {
          setError(handle(result.code) ?? '')
          setLoading(false)
          return
        }

        setLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [id, handle])

  const isOwner = loan?.owner_id === currentUser?.id
  const isBorrower = loan?.borrower_id === currentUser?.id
  const isParticipant = isOwner || isBorrower

  const handleStatusChange = async (newStatus: string) => {
    if (!loan) return

    setActionError('')

    try {
      const res = await fetch(`/api/loans/${loan.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (res.ok) {
        let updated: unknown
        try {
          updated = await res.json()
        } catch {
          // A 2xx whose body is not JSON is a broken answer: keep the loan we have
          setActionError(messageFor('UNKNOWN_ERROR'))
          return
        }

        // Same check as the load, so a half answer never hides the buttons
        if (isLoanShape(updated)) {
          setLoan(updated)
        } else {
          setActionError(messageFor('UNKNOWN_ERROR'))
        }
      } else {
        const code = await readApiError(res)
        setActionError(handle(code) ?? '')
      }
    } catch (err) {
      const code = fetchFailureCode(err)
      if (code) setActionError(messageFor(code))
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
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm mb-4" role="alert">
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
        // The borrower can withdraw the request until the tool is handed over (MVP spec line 66)
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

      case 'aceptado':
        if (isOwner) {
          return (
            <>
              <button
                onClick={() => handleStatusChange('entregado')}
                className="flex-1 bg-violet-600 text-white py-2 px-4 rounded-md hover:bg-violet-700 font-medium"
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
        <Link to="/" className="text-violet-600 hover:underline mb-4 inline-block py-2 px-3">
          ← Volver al inicio
        </Link>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-gray-900">Préstamo</h1>
            <LoanStatus status={loan.status} />
          </div>

          {actionError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm mb-4" role="alert">
              {actionError}
            </div>
          )}

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
