import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { RegisterPage } from './pages/RegisterPage'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { ProfilePage } from './pages/ProfilePage'
import { ToolDetailPage } from './pages/ToolDetailPage'
import { RequestLoanPage } from './pages/RequestLoanPage'
import { PublishForm } from './pages/PublishForm'
import { AuthProvider, ProtectedRoute } from './contexts/AuthContext'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  // The AuthProvider tracks currentUser from the cookie.
  // If no user, redirect to /login with returnTo so the user comes back.
  const hasUser = typeof window !== 'undefined'
    && document.cookie.split(';').some(row => row.startsWith('token='))

  if (!hasUser) {
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/'
    return <Navigate to={`/login?returnTo=${encodeURIComponent(currentPath)}`} replace />
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
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
