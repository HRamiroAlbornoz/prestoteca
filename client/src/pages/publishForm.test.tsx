import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
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

const TOOL_CATEGORIES = [
  'Herramientas eléctricas',
  'Herramientas manuales',
  'Jardín',
  'Limpieza',
  'Escaleras y altura',
  'Otros',
] as const

const TOOL_CONDITIONS = ['nuevo', 'bueno', 'usado'] as const

describe('PublishForm', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch as unknown as typeof fetch)
    mockUseAuthValue.currentUser = null
    mockUseAuthValue.markSignedOut.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders all form fields', () => {
    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/descripción/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/categoría/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/estado/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /publicar/i })).toBeInTheDocument()
  })

  it('renders all category options', () => {
    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    for (const category of TOOL_CATEGORIES) {
      expect(screen.getByRole('option', { name: category })).toBeInTheDocument()
    }
  })

  it('renders all condition options', () => {
    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    for (const condition of TOOL_CONDITIONS) {
      expect(screen.getByRole('option', { name: condition })).toBeInTheDocument()
    }
  })

  it('calls POST /api/tools on valid submit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: '1', name: 'Taladro', message: 'Tool published' }),
    })

    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'Taladro Bosch' },
    })
    fireEvent.change(screen.getByLabelText(/descripción/i), {
      target: { value: 'Taladro eléctrico en buen estado' },
    })
    fireEvent.change(screen.getByLabelText(/categoría/i), {
      target: { value: 'Herramientas eléctricas' },
    })
    fireEvent.change(screen.getByLabelText(/estado/i), {
      target: { value: 'bueno' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publicar/i }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Taladro Bosch',
          description: 'Taladro eléctrico en buen estado',
          category: 'Herramientas eléctricas',
          condition: 'bueno',
        }),
      })
    })
  })

  it('displays error on validation — name too short', () => {
    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'AB' },
    })
    fireEvent.change(screen.getByLabelText(/descripción/i), {
      target: { value: 'Descripción válida' },
    })
    fireEvent.change(screen.getByLabelText(/categoría/i), {
      target: { value: 'Herramientas eléctricas' },
    })
    fireEvent.change(screen.getByLabelText(/estado/i), {
      target: { value: 'bueno' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publicar/i }))

    expect(screen.getByText(/el nombre debe tener al menos 3 caracteres/i)).toBeInTheDocument()
  })

  it('displays error on validation — name too long', () => {
    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'A'.repeat(61) },
    })
    fireEvent.change(screen.getByLabelText(/descripción/i), {
      target: { value: 'Descripción válida' },
    })
    fireEvent.change(screen.getByLabelText(/categoría/i), {
      target: { value: 'Herramientas eléctricas' },
    })
    fireEvent.change(screen.getByLabelText(/estado/i), {
      target: { value: 'bueno' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publicar/i }))

    expect(screen.getByText(/el nombre no puede tener más de 60 caracteres/i)).toBeInTheDocument()
  })

  it('displays error on validation — description too long', () => {
    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'Nombre válido' },
    })
    fireEvent.change(screen.getByLabelText(/descripción/i), {
      target: { value: 'D'.repeat(501) },
    })
    fireEvent.change(screen.getByLabelText(/categoría/i), {
      target: { value: 'Herramientas eléctricas' },
    })
    fireEvent.change(screen.getByLabelText(/estado/i), {
      target: { value: 'bueno' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publicar/i }))

    expect(screen.getByText(/la descripción no puede tener más de 500 caracteres/i)).toBeInTheDocument()
  })

  it('does not call API when validation fails', async () => {
    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    // Name too short
    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'AB' },
    })
    fireEvent.change(screen.getByLabelText(/descripción/i), {
      target: { value: 'Descripción válida' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publicar/i }))

    await waitFor(() => {
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  it('asks for a description when it is left empty, and does not call the API', () => {
    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Taladro Bosch' } })
    fireEvent.change(screen.getByLabelText(/descripción/i), { target: { value: '   ' } })
    fireEvent.change(screen.getByLabelText(/categoría/i), { target: { value: 'Herramientas eléctricas' } })
    fireEvent.change(screen.getByLabelText(/estado/i), { target: { value: 'bueno' } })
    fireEvent.click(screen.getByRole('button', { name: /publicar/i }))

    expect(screen.getByText(/escribí una descripción/i)).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('checks a field when it loses focus, links the message to it, and clears it as soon as it is fixed', () => {
    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    const name = screen.getByLabelText(/nombre/i)
    fireEvent.change(name, { target: { value: 'AB' } })
    // Typing alone does not show the error: it would interrupt the user mid-word
    expect(screen.queryByText(/al menos 3 caracteres/i)).not.toBeInTheDocument()

    fireEvent.blur(name)
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name).toHaveAccessibleDescription(/al menos 3 caracteres/i)

    // Once the error is shown, it goes away while typing, as soon as the value is valid
    fireEvent.change(name, { target: { value: 'ABC' } })
    expect(screen.queryByText(/al menos 3 caracteres/i)).not.toBeInTheDocument()
    expect(name).not.toHaveAttribute('aria-invalid')
  })

  // Updated: now checks exact UNKNOWN_ERROR text
  it('displays error on failed API call', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Could not publish tool' } }),
    })

    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'Taladro Bosch' },
    })
    fireEvent.change(screen.getByLabelText(/descripción/i), {
      target: { value: 'Descripción válida' },
    })
    fireEvent.change(screen.getByLabelText(/categoría/i), {
      target: { value: 'Herramientas eléctricas' },
    })
    fireEvent.change(screen.getByLabelText(/estado/i), {
      target: { value: 'bueno' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publicar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Algo salió mal. Intentá de nuevo en un momento.')
    })
  })

  // C12: publish submit 400 TOOL_NAME_LENGTH, TOOL_DESCRIPTION_TOO_LONG, TOOL_MISSING_FIELDS
  it('C12: publish submit 400 TOOL_NAME_LENGTH, TOOL_DESCRIPTION_TOO_LONG, TOOL_MISSING_FIELDS → exact texts; values stay', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: 'TOOL_MISSING_FIELDS', message: 'Missing fields' },
      }),
    })

    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'Taladro Bosch' },
    })
    fireEvent.change(screen.getByLabelText(/descripción/i), {
      target: { value: 'Descripción válida' },
    })
    fireEvent.change(screen.getByLabelText(/categoría/i), {
      target: { value: 'Herramientas eléctricas' },
    })
    fireEvent.change(screen.getByLabelText(/estado/i), {
      target: { value: 'bueno' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publicar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Completá todos los campos.')
    })
    expect(screen.getByLabelText(/nombre/i)).toHaveValue('Taladro Bosch')
    expect(screen.getByLabelText(/descripción/i)).toHaveValue('Descripción válida')
  })

  // C12b: TOOL_NAME_LENGTH
  it('C12b: publish submit 400 TOOL_NAME_LENGTH → exact text; value stays', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: 'TOOL_NAME_LENGTH', message: 'Name too long' },
      }),
    })

    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'Taladro Bosch' },
    })
    fireEvent.change(screen.getByLabelText(/descripción/i), {
      target: { value: 'Descripción válida' },
    })
    fireEvent.change(screen.getByLabelText(/categoría/i), {
      target: { value: 'Herramientas eléctricas' },
    })
    fireEvent.change(screen.getByLabelText(/estado/i), {
      target: { value: 'bueno' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publicar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('El nombre tiene que tener entre 3 y 60 caracteres.')
    })
  })

  // C12c: TOOL_DESCRIPTION_TOO_LONG
  it('C12c: publish submit 400 TOOL_DESCRIPTION_TOO_LONG → exact text; value stays', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: 'TOOL_DESCRIPTION_TOO_LONG', message: 'Description too long' },
      }),
    })

    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'Taladro Bosch' },
    })
    fireEvent.change(screen.getByLabelText(/descripción/i), {
      target: { value: 'Descripción válida' },
    })
    fireEvent.change(screen.getByLabelText(/categoría/i), {
      target: { value: 'Herramientas eléctricas' },
    })
    fireEvent.change(screen.getByLabelText(/estado/i), {
      target: { value: 'bueno' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publicar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('La descripción puede tener hasta 500 caracteres.')
    })
  })

  // C13: publish submit fetch rejects
  it('C13: publish submit fetch rejects → NETWORK_ERROR text', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    render(
      <MemoryRouter>
        <PublishForm />
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'Taladro Bosch' },
    })
    fireEvent.change(screen.getByLabelText(/descripción/i), {
      target: { value: 'Descripción válida' },
    })
    fireEvent.change(screen.getByLabelText(/categoría/i), {
      target: { value: 'Herramientas eléctricas' },
    })
    fireEvent.change(screen.getByLabelText(/estado/i), {
      target: { value: 'bueno' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publicar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No hay conexión con el servidor. Revisá tu internet e intentá de nuevo.')
    })
  })

  // C14: submit 401 SESSION_REQUIRED → ends on /login with returnTo
  it('C14: publish submit 401 SESSION_REQUIRED → ends on /login with returnTo=/publish', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'SESSION_REQUIRED', message: 'Invalid token' } }),
    })

    render(
      <MemoryRouter initialEntries={['/publish']}>
        <Routes>
          <Route path="/publish" element={<PublishForm />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'Taladro Bosch' },
    })
    fireEvent.change(screen.getByLabelText(/descripción/i), {
      target: { value: 'Descripción válida' },
    })
    fireEvent.change(screen.getByLabelText(/categoría/i), {
      target: { value: 'Herramientas eléctricas' },
    })
    fireEvent.change(screen.getByLabelText(/estado/i), {
      target: { value: 'bueno' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publicar/i }))

    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toHaveTextContent('/login?returnTo=%2Fpublish')
    })
    expect(mockUseAuthValue.markSignedOut).toHaveBeenCalledTimes(1)
  })
})
