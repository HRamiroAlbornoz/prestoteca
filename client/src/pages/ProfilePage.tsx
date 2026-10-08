import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoanStatus } from '../components/LoanStatus'
import { ToolCard, type Tool } from '../components/ToolCard'

interface Loan {
  id: string
  tool_id: string
  tool_name?: string
  borrower_id: string
  owner_id: string
  start_date: string
  end_date: string
  status: string
  note: string | null
  created_at: string
  updated_at: string
}

type TabType = 'tools' | 'received' | 'made' | 'history'

interface ProfileData {
  tools: Tool[]
  receivedLoans: Loan[]
  madeLoans: Loan[]
}

export function ProfilePage() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('tools')
  const [profileData, setProfileData] = useState<ProfileData>({
    tools: [],
    receivedLoans: [],
    madeLoans: [],
  })
  const [history, setHistory] = useState<Loan[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser) return

      try {
        const [profileRes, historyRes] = await Promise.all([
          fetch('/api/me/tools', {
            headers: { 'Content-Type': 'application/json' },
          }),
          fetch('/api/me/history', {
            headers: { 'Content-Type': 'application/json' },
          }),
        ])

        if (!profileRes.ok) {
          setError('Error al cargar el perfil')
          return
        }

        const data: ProfileData = await profileRes.json()
        setProfileData(data)

        if (historyRes.ok) {
          const historyData: Loan[] = await historyRes.json()
          setHistory(historyData)
        }
      } catch {
        setError('Error de conexión. Intentá de nuevo.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
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

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'tools', label: 'Mis herramientas', count: profileData.tools.length },
    { key: 'received', label: 'Pedidos recibidos', count: profileData.receivedLoans.length },
    { key: 'made', label: 'Pedidos hechos', count: profileData.madeLoans.length },
    { key: 'history', label: 'Historial', count: history.length },
  ]

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Mi perfil
        </h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4" role="alert">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6 overflow-x-auto" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-0 py-3 px-4 text-center font-medium text-sm border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div role="tabpanel">
          {/* Tools tab */}
          {activeTab === 'tools' && (
            <>
              {profileData.tools.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No tenés herramientas publicadas</p>
                  <button
                    onClick={() => navigate('/publish')}
                    className="mt-3 text-blue-600 hover:underline"
                  >
                    Publicá tu primera herramienta
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {profileData.tools.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Received loans tab */}
          {activeTab === 'received' && (
            <>
              {profileData.receivedLoans.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>Nadie te pidió prestada una herramienta</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {profileData.receivedLoans.map((loan) => (
                    <button
                      key={loan.id}
                      onClick={() => handleLoanClick(loan.id)}
                      className="w-full bg-white rounded-lg shadow-sm p-4 text-left hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-gray-900">
                          {loan.tool_name || `Herramienta #${loan.tool_id.slice(0, 8)}`}
                        </h3>
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
            </>
          )}

          {/* Made loans tab */}
          {activeTab === 'made' && (
            <>
              {profileData.madeLoans.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No solicitaste ningún préstamo</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {profileData.madeLoans.map((loan) => (
                    <button
                      key={loan.id}
                      onClick={() => handleLoanClick(loan.id)}
                      className="w-full bg-white rounded-lg shadow-sm p-4 text-left hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-gray-900">
                          {loan.tool_name || `Herramienta #${loan.tool_id.slice(0, 8)}`}
                        </h3>
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
            </>
          )}

          {/* History tab */}
          {activeTab === 'history' && (
            <>
              {history.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No tenés préstamos terminados</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((loan) => (
                    <button
                      key={loan.id}
                      onClick={() => handleLoanClick(loan.id)}
                      className="w-full bg-white rounded-lg shadow-sm p-4 text-left hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-gray-900">
                          {loan.tool_name || `Herramienta #${loan.tool_id.slice(0, 8)}`}
                        </h3>
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
