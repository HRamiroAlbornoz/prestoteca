import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PublishForm } from './PublishForm'

const TOOL_CATEGORIES = [
  'electricas',
  'manuales',
  'jardineria',
  'plomeria',
  'gas',
  'pintura',
  'medicion',
  'construccion',
  'otros',
] as const

const TOOL_CONDITIONS = ['nuevo', 'bueno', 'usado'] as const

describe('PublishForm', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch)
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
      target: { value: 'electricas' },
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
          category: 'electricas',
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
      target: { value: 'electricas' },
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
      target: { value: 'electricas' },
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
      target: { value: 'electricas' },
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
      target: { value: 'electricas' },
    })
    fireEvent.change(screen.getByLabelText(/estado/i), {
      target: { value: 'bueno' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publicar/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
