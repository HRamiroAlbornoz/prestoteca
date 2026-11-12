import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoanStatus } from '../components/LoanStatus'
import { readApiError, fetchFailureCode } from '../errors/apiError'
import { useApiError } from '../errors/useApiError'
import { type ClientErrorCode } from '../errors/messages'

interface Loan {
  id: string
  tool_id: string
  tool_name: string
  borrower_id: string
  owner_id: string
  start_date: string
  end_date: string
  status: string
  note: string | null
  created_at: string
  updated_at: string
}

type TabType = 'pedidos' | 'recibidos'

// Result of a single load request: success with parsed data, or failure with a code.
type LoadResult =
  | { status: 'ok'; data: unknown }
  | { status: 'fail'; code: ClientErrorCode | null }

// Shape validator for loans response.
const isValidLoans = (body: unknown): body is Loan[] => Array.isArray(body)

// Generic fetch helper — ONE per load, shared between pedidos and recibidos.
async function loadJson(
  url: string,
  signal: AbortSignal,
  isValid: (body: unknown) => boolean,
): Promise<LoadResult> {
  try {
    const res = await fetch(url, {
      signal,
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      const code = await readApiError(res)
      return { status: 'fail', code }
    }
    let data: unknown
    try {
      data = await res.json()
    } catch {
      return { status: 'fail', code: 'UNKNOWN_ERROR' }
    }
    if (!isValid(data)) {
      return { status: 'fail', code: 'UNKNOWN_ERROR' }
    }
    return { status: 'ok', data }
  } catch (err) {
    if (signal.aborted) return { status: 'fail', code: null }
    return { status: 'fail', code: fetchFailureCode(err) }
  }
}

export function MyLoansPage() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const { handle } = useApiError()
  const [activeTab, setActiveTab] = useState<TabType>('pedidos')
  const [pedidos, setPedidos] = useState<Loan[]>([])
  const [recibidos, setRecibidos] = useState<Loan[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  // The retry button, to give it the focus back when a retry fails again
  const retryButtonRef = useRef<HTMLButtonElement>(null)
  // True only between a click on "Reintentar" and the next error view: the first load never moves the focus
  const retriedRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()

    const fetchData = async () => {
      if (!currentUser) return

      const [pedidosResult, recibidosResult] = await Promise.allSettled([
        loadJson('/api/loans?type=pedidos', controller.signal, isValidLoans),
        loadJson('/api/loans?type=recibidos', controller.signal, isValidLoans),
      ])

      // First line after settle: cancellation → do nothing
      if (controller.signal.aborted) return

      // loadJson never rejects, so both results are always fulfilled
      if (pedidosResult.status !== 'fulfilled' || recibidosResult.status !== 'fulfilled') return

      const pedidosRes = pedidosResult.value
      const recibidosRes = recibidosResult.value

      // Priority: if any gave SESSION_REQUIRED, it wins and handle is called only once
      const pedidosIsSession = pedidosRes.status === 'fail' && pedidosRes.code === 'SESSION_REQUIRED'
      const recibidosIsSession = recibidosRes.status === 'fail' && recibidosRes.code === 'SESSION_REQUIRED'
      if (pedidosIsSession || recibidosIsSession) {
        // Stay on "Cargando..." until the login replaces this page: never flash "0 loans"
        handle('SESSION_REQUIRED')
        return
      }

      // Any failure → show the first failure in list order (pedidos before recibidos)
      if (pedidosRes.status === 'fail' && pedidosRes.code !== null) {
        setError(handle(pedidosRes.code) ?? '')
        setLoading(false)
        return
      }
      if (recibidosRes.status === 'fail' && recibidosRes.code !== null) {
        setError(handle(recibidosRes.code) ?? '')
        setLoading(false)
        return
      }

      // Both succeeded
      if (pedidosRes.status === 'ok' && recibidosRes.status === 'ok') {
        setPedidos(pedidosRes.data as Loan[])
        setRecibidos(recibidosRes.data as Loan[])
        setLoading(false)
        return
      }
    }

    fetchData()

    return () => {
      controller.abort()
    }
  }, [currentUser, handle, reloadKey])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-AR')
  }

  const handleLoanClick = (loanId: string) => {
    navigate(`/loans/${loanId}`)
  }

  const handleRetry = () => {
    retriedRef.current = true
    setError('')
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  // After a retry that failed again, put the focus back on "Reintentar"
  useEffect(() => {
    if (!loading && error && retriedRef.current) {
      retriedRef.current = false
      retryButtonRef.current?.focus()
    }
  }, [loading, error])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600" role="status">Cargando...</p>
      </div>
    )
  }

  // Load error: only the error and a way to retry, never "0 loans"
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Mis préstamos</h1>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm mb-4" role="alert">
            {error}
          </div>
          <button
            ref={retryButtonRef}
            type="button"
            onClick={handleRetry}
            className="min-h-11 px-6 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 focus:outline-hidden focus:ring-2 focus:ring-violet-500"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const currentLoans = activeTab === 'pedidos' ? pedidos : recibidos
  const emptyMessage = activeTab === 'pedidos'
    ? 'No tenés préstamos solicitados'
    : 'Nadie te pidió prestada una herramienta'

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Mis préstamos</h1>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'pedidos'}
            onClick={() => setActiveTab('pedidos')}
            className={`flex-1 py-3 px-4 text-center font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'pedidos'
                ? 'border-violet-600 text-violet-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Pedí ({pedidos.length})
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'recibidos'}
            onClick={() => setActiveTab('recibidos')}
            className={`flex-1 py-3 px-4 text-center font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'recibidos'
                ? 'border-violet-600 text-violet-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Me pidieron ({recibidos.length})
          </button>
        </div>

        {/* Loan list */}
        <div role="tabpanel">
          {currentLoans.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {emptyMessage}
            </div>
          ) : (
            <div className="space-y-3">
              {currentLoans.map((loan) => (
                <button
                  key={loan.id}
                  onClick={() => handleLoanClick(loan.id)}
                  className="w-full bg-white rounded-lg shadow-xs p-4 text-left hover:shadow-md transition-shadow focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-900">{loan.tool_name}</h3>
                    <LoanStatus status={loan.status} />
                  </div>
                  <p className="text-sm text-gray-500">
                    {formatDate(loan.start_date)} — {formatDate(loan.end_date)}
                  </p>
                  {loan.note && (
                    <p className="text-sm text-gray-600 mt-1 italic">{loan.note}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
