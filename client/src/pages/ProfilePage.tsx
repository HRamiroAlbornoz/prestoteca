import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LoanStatus } from '../components/LoanStatus'
import { ToolCard, type Tool } from '../components/ToolCard'
import { useApiError } from '../errors/useApiError'
import { readApiError, fetchFailureCode } from '../errors/apiError'
import { messageFor, type ClientErrorCode } from '../errors/messages'

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

type TabType = 'tools' | 'received' | 'made' | 'history' | 'settings'

interface ProfileData {
  tools: Tool[]
  receivedLoans: Loan[]
  madeLoans: Loan[]
}

// Result of a single load request: success with parsed data, or failure with a code.
// code is null when the request was aborted (not a real error).
type LoadResult =
  | { status: 'ok'; data: unknown }
  | { status: 'fail'; code: ClientErrorCode | null }

// Shape validator for tools response.
const isValidProfileData = (body: unknown): body is ProfileData =>
  typeof body === 'object' &&
  body !== null &&
  Array.isArray((body as ProfileData).tools) &&
  Array.isArray((body as ProfileData).receivedLoans) &&
  Array.isArray((body as ProfileData).madeLoans)

// Shape validator for history response.
const isValidHistory = (body: unknown): body is Loan[] => Array.isArray(body)

// Generic fetch helper — ONE per load, shared between tools and history.
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
    const code = fetchFailureCode(err)
    if (code === null) return { status: 'fail', code: 'NETWORK_ERROR' }
    return { status: 'fail', code }
  }
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
  const [reloadKey, setReloadKey] = useState(0)
  // The retry button, to give it the focus back when a retry fails again
  const retryButtonRef = useRef<HTMLButtonElement>(null)
  // True only between a click on "Reintentar" and the next error view: the first load never moves the focus
  const retriedRef = useRef(false)

  // Settings state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [settingsError, setSettingsError] = useState('')
  const [settingsSuccess, setSettingsSuccess] = useState('')
  const [deleting, setDeleting] = useState(false)

  const { handle } = useApiError()

  useEffect(() => {
    const controller = new AbortController()

    const fetchData = async () => {
      if (!currentUser) return

      const [toolsResult, historyResult] = await Promise.allSettled([
        loadJson('/api/me/tools', controller.signal, isValidProfileData),
        loadJson('/api/me/history', controller.signal, isValidHistory),
      ])

      // First line after settle: cancellation → do nothing
      if (controller.signal.aborted) return

      // Both should be fulfilled since loadJson catches all errors
      if (toolsResult.status === 'rejected' || historyResult.status === 'rejected') {
        setError(messageFor('UNKNOWN_ERROR'))
        setLoading(false)
        return
      }

      const toolsRes = toolsResult.value
      const historyRes = historyResult.value

      // Priority: if any gave SESSION_REQUIRED, it wins and handle is called only once
      const toolsIsSession = toolsRes.status === 'fail' && toolsRes.code === 'SESSION_REQUIRED'
      const historyIsSession = historyRes.status === 'fail' && historyRes.code === 'SESSION_REQUIRED'
      if (toolsIsSession || historyIsSession) {
        handle('SESSION_REQUIRED')
        setLoading(false)
        return
      }

      // Both failed → show the first failure (tools before history)
      if (toolsRes.status === 'fail' && historyRes.status === 'fail') {
        if (toolsRes.code !== null) setError(messageFor(toolsRes.code))
        setLoading(false)
        return
      }

      // Both succeeded
      if (toolsRes.status === 'ok' && historyRes.status === 'ok') {
        setProfileData(toolsRes.data as ProfileData)
        setHistory(historyRes.data as Loan[])
        setLoading(false)
        return
      }

      // Partial load: one succeeded, one failed → show load error, not the part that loaded
      if (toolsRes.status === 'fail' && toolsRes.code !== null) {
        setError(messageFor(toolsRes.code))
      } else if (historyRes.status === 'fail' && historyRes.code !== null) {
        setError(messageFor(historyRes.code))
      }
      setLoading(false)
    }

    fetchData()

    return () => {
      controller.abort()
    }
  }, [currentUser, handle, reloadKey])

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-AR')
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setSettingsError('')
    setSettingsSuccess('')

    if (newPassword !== confirmPassword) {
      setSettingsError('Las contraseñas no coinciden')
      return
    }

    if (newPassword.length < 8 || newPassword.length > 72) {
      setSettingsError('La contraseña debe tener entre 8 y 72 caracteres')
      return
    }

    if (/^\s+$/.test(newPassword)) {
      setSettingsError('La contraseña no puede ser solo espacios')
      return
    }

    try {
      const res = await fetch('/api/me/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })

      if (res.ok) {
        setSettingsSuccess('Contraseña cambiada correctamente')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        setSettingsError(handle(await readApiError(res)) ?? '')
      }
    } catch (err) {
      const code = fetchFailureCode(err)
      if (code) setSettingsError(messageFor(code))
    }
  }

  const handleDeleteAccount = async () => {
    if (!window.confirm('¿Estás seguro? Esta acción no se puede deshacer.')) return

    setDeleting(true)
    setSettingsError('')

    try {
      const res = await fetch('/api/me/account', {
        method: 'DELETE',
      })

      if (res.ok) {
        localStorage.removeItem('token')
        window.location.href = '/'
      } else {
        setSettingsError(handle(await readApiError(res)) ?? '')
      }
    } catch (err) {
      const code = fetchFailureCode(err)
      if (code) setSettingsError(messageFor(code))
    } finally {
      setDeleting(false)
    }
  }

  const handleLoanClick = (loanId: string) => {
    navigate(`/loans/${loanId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600" role="status">Cargando...</p>
      </div>
    )
  }

  // A load error leaves only "Configuración": the other tabs would show "0", which is false
  const loadFailed = error !== ''
  const shownTab: TabType = loadFailed ? 'settings' : activeTab
  const tabs: { key: TabType; label: string; count: number | null }[] = loadFailed
    ? [{ key: 'settings' as TabType, label: 'Configuración', count: null }]
    : [
        { key: 'tools', label: 'Mis herramientas', count: profileData.tools.length },
        { key: 'received', label: 'Pedidos recibidos', count: profileData.receivedLoans.length },
        { key: 'made', label: 'Pedidos hechos', count: profileData.madeLoans.length },
        { key: 'history', label: 'Historial', count: history.length },
        { key: 'settings', label: 'Configuración', count: 0 },
      ]

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Mi perfil
        </h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm mb-4" role="alert">
            {error}
          </div>
        )}

        {loadFailed && (
          <button
            ref={retryButtonRef}
            type="button"
            onClick={handleRetry}
            className="min-h-11 mb-6 px-6 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 focus:outline-hidden focus:ring-2 focus:ring-violet-500"
          >
            Reintentar
          </button>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6 overflow-x-auto" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={shownTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 min-w-0 py-3 px-4 text-center font-medium text-sm border-b-2 transition-colors ${
                shownTab === tab.key
                  ? 'border-violet-600 text-violet-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.count === null ? tab.label : `${tab.label} (${tab.count})`}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div role="tabpanel">
          {/* Tools tab */}
          {shownTab === 'tools' && (
            <>
              {profileData.tools.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No tenés herramientas publicadas</p>
                  <button
                    onClick={() => navigate('/publish')}
                    className="mt-3 text-violet-600 hover:underline"
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
          {shownTab === 'received' && (
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
                      className="w-full bg-white rounded-lg shadow-xs p-4 text-left hover:shadow-md transition-shadow focus:outline-hidden focus:ring-2 focus:ring-violet-500"
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
          {shownTab === 'made' && (
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
                      className="w-full bg-white rounded-lg shadow-xs p-4 text-left hover:shadow-md transition-shadow focus:outline-hidden focus:ring-2 focus:ring-violet-500"
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
          {shownTab === 'history' && (
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
                      className="w-full bg-white rounded-lg shadow-xs p-4 text-left hover:shadow-md transition-shadow focus:outline-hidden focus:ring-2 focus:ring-violet-500"
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

          {/* Settings tab */}
          {shownTab === 'settings' && (
            <div className="space-y-8">
              {/* Change password */}
              <div className="bg-white rounded-lg shadow-xs p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Cambiar contraseña
                </h2>

                {settingsError && shownTab === 'settings' && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm mb-4" role="alert">
                    {settingsError}
                  </div>
                )}

                {settingsSuccess && (
                  <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-sm mb-4" role="status">
                    {settingsSuccess}
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1">
                      Contraseña actual
                    </label>
                    <input
                      id="current-password"
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
                      Nueva contraseña
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                      placeholder="8-72 caracteres"
                    />
                  </div>

                  <div>
                    <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                      Confirmar nueva contraseña
                    </label>
                    <input
                      id="confirm-password"
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                      placeholder="Repetí la nueva contraseña"
                    />
                  </div>

                  <button
                    type="submit"
                    className="px-4 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 focus:outline-hidden focus:ring-2 focus:ring-violet-500"
                  >
                    Cambiar contraseña
                  </button>
                </form>
              </div>

              {/* Delete account */}
              <div className="bg-white rounded-lg shadow-xs p-6 border border-red-200">
                <h2 className="text-lg font-semibold text-red-700 mb-2">
                  Eliminar cuenta
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  Esta acción eliminará todas tus herramientas (borrado lógico) y tu cuenta. Los préstamos mantendrán su historio pero tu nombre será borrado.
                </p>

                <button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 focus:outline-hidden focus:ring-2 focus:ring-red-500"
                >
                  {deleting ? 'Eliminando...' : 'Eliminar mi cuenta'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
