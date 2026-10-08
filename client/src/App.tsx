import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { RegisterPage } from './pages/RegisterPage'
import { LoginPage } from './pages/LoginPage'
import { ToolDetailPage } from './pages/ToolDetailPage'
import { RequestLoanPage } from './pages/RequestLoanPage'
import { PublishForm } from './pages/PublishForm'
import { AuthProvider } from './contexts/AuthContext'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<LoginPage />} />
          <Route path="/tools/:id/request" element={<RequestLoanPage />} />
          <Route path="/tools/:id" element={<ToolDetailPage />} />
          <Route path="/publish" element={<PublishForm />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
