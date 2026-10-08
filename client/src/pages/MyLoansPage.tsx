import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoanStatus } from '../components/LoanStatus'

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

export function MyLoansPage() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('pedidos')
  const [pedidos, setPedidos] = useState<Loan[]>([])
  const [recibidos, setRecibidos] = useState<Loan[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchLoans = async () => {
      if (!currentUser) return

      try {
        const [pedidosRes, recibidosRes] = await Promise.all([
          fetch('/api/loans?type=pedidos', {
            headers: { 'Content-Type': 'application/json' },
          }),
          fetch('/api/loans?type=recibidos', {
            headers: { 'Content-Type': 'application/json' },
          }),
        ])

        if (!pedidosRes.ok || !recibidosRes.ok) {
          setError('Error al cargar los préstamos')
          return
        }

        const pedidosData: Loan[] = await pedidosRes.json()
        const recibidosData: Loan[] = await recibidosRes.json()

        setPedidos(pedidosData)
        setRecibidos(recibidosData)
      } catch {
        setError('Error de conexión. Intentá de nuevo.')
      } finally {
        setLoading(false)
      }
    }

    fetchLoans()
  }, [currentUser])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-AR')
  }

  const handleLoanClick = (loanId: string) => {
    navigate(`/loans/${loanId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Cargando...</p>
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4" role="alert">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'pedidos'}
            onClick={() => setActiveTab('pedidos')}
            className={`flex-1 py-3 px-4 text-center font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'pedidos'
                ? 'border-blue-600 text-blue-600'
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
                ? 'border-blue-600 text-blue-600'
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
                  className="w-full bg-white rounded-lg shadow-sm p-4 text-left hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
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
