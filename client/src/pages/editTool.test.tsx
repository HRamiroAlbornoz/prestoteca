import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { PublishForm } from './PublishForm'

// LocationProbe: reads useLocation() and renders the path so tests can assert
// real navigation without mocking useNavigate (brief, hard rule 4).
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="login-page">{location.pathname + location.search}</div>
}

// Mock AuthContext — markSignedOut is needed because useApiError calls it
const mockUseAuthValue = {
  currentUser: null as { id: string; name: string } | null,
  isLoading: false,
  login: vi.fn(),
  logout: vi.fn(),
  markSignedOut: vi.fn(),
}
vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => mockUseAuthValue,
}))

// The tool as GET /api/tools/:id returns it (same shape as the real server)
const toolFixture = {
  id: 'tool-1',
  owner_id: 'user-1',
  name: 'Taladro Bosch',
  description: 'Taladro percutor de 650 W',
  category: 'Herramientas eléctricas',
  condition: 'bueno',
  is_paused: false,
  deleted_at: null,
  created_at: '2030-01-01T00:00:00Z',
}

function response(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

let fetchMock: ReturnType<typeof vi.fn>

// Answers GET /api/tools/tool-1 with the fixture, and PATCH with whatever the test decides
function installFakeServer(patchAnswer: () => Promise<unknown>) {
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/tools/tool-1' && method === 'GET') return response(200, toolFixture)
    if (url === '/api/tools/tool-1' && method === 'PATCH') return patchAnswer()
    return response(404, { error: { code: 'TOOL_NOT_FOUND', message: 'Tool not found' } })
  })
  vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch)
}

function renderEditPage(toolId = 'tool-1') {
  return render(
    <MemoryRouter initialEntries={[`/tools/${toolId}/edit`]}>
      <Routes>
        <Route path="/tools/:id/edit" element={<PublishForm />} />
        <Route path="/tools/:id" element={<h1>Detalle de la herramienta</h1>} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PublishForm in edit mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockUseAuthValue.currentUser = null
    mockUseAuthValue.markSignedOut.mockClear()
  })

  it('loads the tool and fills the form with its current data', async () => {
    installFakeServer(() => response(200, toolFixture))
    renderEditPage()

    expect(await screen.findByRole('heading', { name: /editar herramienta/i })).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Taladro Bosch')).toBeInTheDocument()
    expect(screen.getByLabelText(/descripción/i)).toHaveValue('Taladro percutor de 650 W')
    expect(screen.getByLabelText(/categoría/i)).toHaveValue('Herramientas eléctricas')
    expect(screen.getByLabelText(/estado/i)).toHaveValue('bueno')
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument()
  })

  it('saves only the editable fields with PATCH and goes back to the tool detail', async () => {
    installFakeServer(() => response(200, { ...toolFixture, name: 'Taladro Bosch GSB' }))
    renderEditPage()

    const name = await screen.findByDisplayValue('Taladro Bosch')
    fireEvent.change(name, { target: { value: '  Taladro Bosch GSB  ' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByRole('heading', { name: /detalle de la herramienta/i })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/tools/tool-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Taladro Bosch GSB',
        description: 'Taladro percutor de 650 W',
        category: 'Herramientas eléctricas',
        condition: 'bueno',
      }),
    })
  })

  // The person leaves before the tool loads: a late 401 must not send them to the login
  it('leaving before the load answers → a late SESSION_REQUIRED touches nothing', async () => {
    let answerLater: (() => void) | undefined
    let signal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined
      return new Promise<Response>((resolve) => {
        answerLater = () =>
          resolve(
            new Response(JSON.stringify({ error: { code: 'SESSION_REQUIRED', message: 'Invalid' } }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            }),
          )
      })
    }) as unknown as typeof fetch)

    const { unmount } = renderEditPage()
    await waitFor(() => expect(answerLater).toBeDefined())
    unmount()
    answerLater?.()

    // Let the late answer run through the page's code.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockUseAuthValue.markSignedOut).not.toHaveBeenCalled()
    expect(signal?.aborted).toBe(true)
  })

  // C7: edit submit 403 TOOL_NOT_OWNER
  it('C7: edit submit 403 TOOL_NOT_OWNER → row 21 text in role="alert"', async () => {
    installFakeServer(() => response(403, { error: { code: 'TOOL_NOT_OWNER', message: 'You can only edit your own tools' } }))
    renderEditPage()

    const name = await screen.findByDisplayValue('Taladro Bosch')
    fireEvent.change(name, { target: { value: 'Otro nombre' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Solo podés modificar tus propias herramientas.')
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('Otro nombre')
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeEnabled()
  })

  // C8: edit submit 404 TOOL_NOT_FOUND
  it('C8: edit submit 404 TOOL_NOT_FOUND → row 20 text in role="alert"', async () => {
    installFakeServer(() => response(404, { error: { code: 'TOOL_NOT_FOUND', message: 'Tool not found' } }))
    renderEditPage()

    const name = await screen.findByDisplayValue('Taladro Bosch')
    fireEvent.change(name, { target: { value: 'Otro nombre' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Esta herramienta no existe o fue eliminada.')
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('Otro nombre')
  })

  // C9: edit load 200 with a body that fails the schema
  it('C9: edit load 200 with bad shape → row 37 text', async () => {
    installFakeServer(() => response(200, toolFixture))
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => response(200, { id: 'x' }))
    renderEditPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal. Intentá de nuevo en un momento.')
    expect(screen.queryByRole('button', { name: /guardar cambios/i })).not.toBeInTheDocument()
  })

  it('edit load 200 non-JSON body → UNKNOWN_ERROR text; NETWORK_ERROR absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('not json', { status: 200 })))
    renderEditPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal. Intentá de nuevo en un momento.')
    expect(screen.getByRole('alert')).not.toHaveTextContent('No hay conexión')
  })

  // C10: edit load 404
  it('C10: edit load 404 → row 20 text', async () => {
    installFakeServer(() => response(200, toolFixture))
    renderEditPage('tool-that-does-not-exist')

    expect(await screen.findByText('Esta herramienta no existe o fue eliminada.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /guardar cambios/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /volver al inicio/i })).toHaveAttribute('href', '/')
  })

  // C11: edit load fetch rejects
  it('C11: edit load fetch rejects → NETWORK_ERROR text', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    renderEditPage()

    expect(await screen.findByText('No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /guardar cambios/i })).not.toBeInTheDocument()
  })

  it('keeps what was typed and lets the user retry when there is no connection', async () => {
    installFakeServer(() => Promise.reject(new TypeError('Failed to fetch')))
    renderEditPage()

    const name = await screen.findByDisplayValue('Taladro Bosch')
    fireEvent.change(name, { target: { value: 'Otro nombre' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.')
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('Otro nombre')
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeEnabled()
  })

  it('disables the fields and the button while saving', async () => {
    // The PATCH never answers, so the form stays in its "saving" state
    installFakeServer(() => new Promise(() => {}))
    renderEditPage()

    await screen.findByDisplayValue('Taladro Bosch')
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByRole('button', { name: /guardando/i })).toBeDisabled()
    expect(screen.getByLabelText(/nombre/i)).toBeDisabled()
    expect(screen.getByLabelText(/descripción/i)).toBeDisabled()
  })

  it('does not send anything while a field is invalid', async () => {
    installFakeServer(() => response(200, toolFixture))
    renderEditPage()

    const name = await screen.findByDisplayValue('Taladro Bosch')
    fireEvent.change(name, { target: { value: 'AB' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByText(/al menos 3 caracteres/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/tools/tool-1', expect.objectContaining({ method: 'PATCH' }))
  })

  // C14: submit 401 SESSION_REQUIRED → ends on /login with returnTo
  it('C14: edit submit 401 SESSION_REQUIRED → ends on /login with returnTo=/tools/tool-1/edit', async () => {
    installFakeServer(() => response(401, { error: { code: 'SESSION_REQUIRED', message: 'Invalid token' } }))
    renderEditPage()

    const name = await screen.findByDisplayValue('Taladro Bosch')
    fireEvent.change(name, { target: { value: 'Otro nombre' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toHaveTextContent('/login?returnTo=%2Ftools%2Ftool-1%2Fedit')
    })
    expect(mockUseAuthValue.markSignedOut).toHaveBeenCalledTimes(1)
  })
})
