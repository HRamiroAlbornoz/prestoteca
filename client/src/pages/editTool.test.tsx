import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { PublishForm } from './PublishForm'

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
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body })
}

let fetchMock: ReturnType<typeof vi.fn>

// Answers GET /api/tools/tool-1 with the fixture, and PATCH with whatever the test decides
function installFakeServer(patchAnswer: () => Promise<unknown>) {
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url === '/api/tools/tool-1' && method === 'GET') return response(200, toolFixture)
    if (url === '/api/tools/tool-1' && method === 'PATCH') return patchAnswer()
    return response(404, { error: { code: 'NOT_FOUND', message: 'Not found' } })
  })
  vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch)
}

function renderEditPage(toolId = 'tool-1') {
  render(
    <MemoryRouter initialEntries={[`/tools/${toolId}/edit`]}>
      <Routes>
        <Route path="/tools/:id/edit" element={<PublishForm />} />
        <Route path="/tools/:id" element={<h1>Detalle de la herramienta</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PublishForm in edit mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
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

  it('explains that only the owner can edit when the server answers 403, and keeps what was typed', async () => {
    installFakeServer(() => response(403, { error: { code: 'FORBIDDEN', message: 'You can only edit your own tools' } }))
    renderEditPage()

    const name = await screen.findByDisplayValue('Taladro Bosch')
    fireEvent.change(name, { target: { value: 'Otro nombre' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/solo podés editar tus propias herramientas/i)
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('Otro nombre')
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeEnabled()
  })

  it('keeps what was typed and lets the user retry when there is no connection', async () => {
    installFakeServer(() => Promise.reject(new TypeError('Failed to fetch')))
    renderEditPage()

    const name = await screen.findByDisplayValue('Taladro Bosch')
    fireEvent.change(name, { target: { value: 'Otro nombre' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/error de conexión/i)
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

  it('says the tool does not exist when the server answers 404 on load', async () => {
    installFakeServer(() => response(200, toolFixture))
    renderEditPage('tool-that-does-not-exist')

    expect(await screen.findByText(/esta herramienta no existe/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /guardar cambios/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /volver al inicio/i })).toHaveAttribute('href', '/')
  })

  it('says the tool could not be loaded when there is no connection', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    renderEditPage()

    expect(await screen.findByText(/no se pudo cargar la herramienta/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /guardar cambios/i })).not.toBeInTheDocument()
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
})
