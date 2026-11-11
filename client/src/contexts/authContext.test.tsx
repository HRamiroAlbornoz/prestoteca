import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'

// A tiny consumer that shows what the context knows, and what logout answered
function Probe() {
  const { currentUser, isLoading, logout, markSignedOut } = useAuth()
  const [result, setResult] = useState('')
  if (isLoading) return <p>cargando</p>
  return (
    <div>
      <p>{currentUser ? `usuario: ${currentUser.name}` : 'sin sesión'}</p>
      <p>{result && `resultado: ${result}`}</p>
      <button onClick={() => void logout().then(setResult)}>salir</button>
      <button onClick={markSignedOut}>olvidar</button>
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

  // logout only reports; whoever calls it decides when to forget the user (plan §3.6)
  it('logout asks the server to clear the httpOnly cookie, answers "closed" and keeps the user', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'user-1', name: 'Ana' }) })
      .mockResolvedValueOnce({ ok: true, status: 204, json: async () => ({}) })

    render(<AuthProvider><Probe /></AuthProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'salir' }))

    expect(await screen.findByText('resultado: closed')).toBeInTheDocument()
    expect(screen.getByText('usuario: Ana')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
  })

  it.each([
    ['the server refuses it', () => Promise.resolve({ ok: false, status: 429, json: async () => ({}) })],
    ['there is no connection', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('logout answers "failed" when %s', async (_case, logoutReply) => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'user-1', name: 'Ana' }) })
      .mockImplementationOnce(logoutReply)

    render(<AuthProvider><Probe /></AuthProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'salir' }))

    expect(await screen.findByText('resultado: failed')).toBeInTheDocument()
    expect(screen.getByText('usuario: Ana')).toBeInTheDocument()
  })

  it('markSignedOut forgets the user without asking the server', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'user-1', name: 'Ana' }) })

    render(<AuthProvider><Probe /></AuthProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'olvidar' }))

    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(1) // only the first /api/me
  })
})
