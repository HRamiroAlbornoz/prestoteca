import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { RegisterPage } from './pages/RegisterPage'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { ProfilePage } from './pages/ProfilePage'
import { ToolDetailPage } from './pages/ToolDetailPage'
import { RequestLoanPage } from './pages/RequestLoanPage'
import { PublishForm } from './pages/PublishForm'
import { MyLoansPage } from './pages/MyLoansPage'
import { LoanDetailPage } from './pages/LoanDetailPage'
import { AuthProvider, useAuth } from './contexts/AuthContext'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  // The session cookie is httpOnly, so the AuthProvider asks the server who is logged in.
  // Until it answers we cannot tell "logged out" from "not known yet", so we wait.
  const { currentUser, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" role="status">
        <p className="text-gray-600">Cargando...</p>
      </div>
    )
  }

  if (!currentUser) {
    // Remember where the user was going, so the login can bring them back
    const returnTo = location.pathname + location.search
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/tools/:id" element={<ToolDetailPage />} />

          {/* Private routes — require authentication */}
          <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
          <Route path="/publish" element={<PrivateRoute><PublishForm /></PrivateRoute>} />
          <Route path="/tools/:id/request" element={<PrivateRoute><RequestLoanPage /></PrivateRoute>} />
          <Route path="/loans" element={<PrivateRoute><MyLoansPage /></PrivateRoute>} />
          <Route path="/loans/:id" element={<PrivateRoute><LoanDetailPage /></PrivateRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
