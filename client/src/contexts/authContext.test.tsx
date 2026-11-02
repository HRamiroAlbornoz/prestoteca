import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

// A tiny consumer that shows what the context knows and exposes logout
function Probe() {
  const { currentUser, isLoading, logout } = useAuth()
  if (isLoading) return <p>cargando</p>
  return (
    <div>
      <p>{currentUser ? `usuario: ${currentUser.name}` : 'sin sesión'}</p>
      <button onClick={() => void logout()}>salir</button>
    </div>
  )
}

describe('AuthContext', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  it('asks the server who is logged in when it starts', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'user-1', name: 'Ana' }) })

    render(<AuthProvider><Probe /></AuthProvider>)

    expect(await screen.findByText('usuario: Ana')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/me')
  })

  it('ends with no user when the server answers 401', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })

    render(<AuthProvider><Probe /></AuthProvider>)

    expect(await screen.findByText('sin sesión')).toBeInTheDocument()
  })

  it('ends with no user when the server cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))

    render(<AuthProvider><Probe /></AuthProvider>)

    expect(await screen.findByText('sin sesión')).toBeInTheDocument()
  })

  it('logout asks the server to clear the httpOnly cookie and forgets the user', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'user-1', name: 'Ana' }) })
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) })

    render(<AuthProvider><Probe /></AuthProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'salir' }))

    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
  })
})
