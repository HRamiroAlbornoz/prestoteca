import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import axe from 'axe-core'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'
import { HomePage } from './HomePage'
import { ToolDetailPage } from './ToolDetailPage'
import { PublishForm } from './PublishForm'
import { RequestLoanPage } from './RequestLoanPage'
import { LoanDetailPage } from './LoanDetailPage'
import { MyLoansPage } from './MyLoansPage'
import { ProfilePage } from './ProfilePage'
import { NavBar } from '../components/NavBar'

// AC-1 and AC-9 (plan error-codes, T015): on every screen, an error the server answers with a
// known code and an ENGLISH message shows the Spanish text of the spec's table, inside an
// element with role="alert" (so a screen reader announces it), never the server's text, and the
// page keeps zero axe violations with the error on screen.
//
// The only mock besides fetch is the session hook. react and react-router-dom are real: routes,
// useParams and navigation work as in the app.

const { logoutMock } = vi.hoisted(() => ({
  logoutMock: vi.fn<() => Promise<'closed' | 'failed'>>(),
}))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { id: 'user-1', name: 'Ana' },
    isLoading: false,
    refreshUser: vi.fn(async () => ({ id: 'user-1', name: 'Ana' })),
    markSignedOut: vi.fn(),
    logout: logoutMock,
  }),
}))

// What the server says in English; it must never reach the screen
const SERVER_TEXT = 'Server English text'

function apiError(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: SERVER_TEXT } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

// Answers each request with what `answer` returns for its method and URL. A request the test did
// not expect makes fetch reject on purpose: the screen then shows the "no connection" text and the
// exact-text assertion fails, naming the problem, instead of a silent 200 hiding a wrong URL.
// A new Response is built per call because a body can be read only once.
function stubFetch(answer: (method: string, url: string) => Response | undefined) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const method = init?.method ?? 'GET'
      const url = String(input)
      const response = answer(method, url)
      if (!response) throw new Error(`unexpected request: ${method} ${url}`)
      return response
    },
  )
}

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search}</p>
}

// `pattern` is the route as App.tsx declares it ('/tools/:id'), `path` the address the person is
// on ('/tools/7'). Using the address as the pattern would leave useParams() without an id.
function renderAt(element: ReactElement, pattern: string, path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={element} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

// The three checks every case shares: exact Spanish text in the single alert, no server text,
// and no accessibility violation with the error visible.
async function expectSpanishAlert(container: HTMLElement, text: string) {
  const alert = await screen.findByRole('alert')
  expect(alert.textContent?.trim()).toBe(text)
  expect(screen.queryByText(SERVER_TEXT)).toBeNull()
  expect((await axe.run(container)).violations).toEqual([])
}

const TOOL = {
  id: '7',
  owner_id: 'user-1',
  name: 'Taladro',
  description: 'Un taladro percutor',
  category: 'Herramientas eléctricas',
  condition: 'bueno',
  is_paused: false,
  created_at: '2026-01-01T00:00:00.000Z',
}

// A loan of someone else's request on Ana's tool, still pending: Ana (the owner) sees "Aceptar"
const LOAN = {
  id: '42',
  tool_id: '7',
  borrower_id: 'user-2',
  owner_id: 'user-1',
  start_date: '2030-01-15',
  end_date: '2030-01-20',
  status: 'pendiente',
  note: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

describe('error alerts (AC-1, AC-9)', () => {
  beforeEach(() => {
    logoutMock.mockReset()
    logoutMock.mockResolvedValue('closed')
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('E1 LoginPage: login 401 INVALID_CREDENTIALS shows row 7', async () => {
    stubFetch((method, url) =>
      method === 'POST' && url === '/api/auth/login' ? apiError(401, 'INVALID_CREDENTIALS') : undefined,
    )
    const { container } = renderAt(<LoginPage />, '/login', '/login')

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ana@example.com' } })
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'wrongpass' } })
    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await expectSpanishAlert(container, 'El email o la contraseña no son correctos.')
  })

  it('E2 RegisterPage: register 409 EMAIL_TAKEN shows row 5', async () => {
    stubFetch((method, url) =>
      method === 'POST' && url === '/api/auth/register' ? apiError(409, 'EMAIL_TAKEN') : undefined,
    )
    const { container } = renderAt(<RegisterPage />, '/register', '/register')

    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Ana García' } })
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ana@example.com' } })
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'ana12345' } })
    fireEvent.change(screen.getByLabelText(/barrio/i), { target: { value: 'Centro' } })
    fireEvent.click(screen.getByRole('button', { name: /registrarse/i }))

    await expectSpanishAlert(container, 'Ya hay una cuenta con ese email. Iniciá sesión o usá otro email.')
  })

  it('E3 HomePage: first load 500 INTERNAL_ERROR shows row 34', async () => {
    stubFetch((method, url) =>
      method === 'GET' && url.startsWith('/api/tools') ? apiError(500, 'INTERNAL_ERROR') : undefined,
    )
    const { container } = renderAt(<HomePage />, '/', '/')

    await expectSpanishAlert(container, 'No pudimos cargar las herramientas. Intentá de nuevo en un momento.')
  })

  it('E4 ToolDetailPage: load 404 TOOL_NOT_FOUND shows row 20', async () => {
    stubFetch((method, url) =>
      method === 'GET' && url === '/api/tools/7' ? apiError(404, 'TOOL_NOT_FOUND') : undefined,
    )
    const { container } = renderAt(<ToolDetailPage />, '/tools/:id', '/tools/7')

    await expectSpanishAlert(container, 'Esta herramienta no existe o fue eliminada.')
  })

  it('E5 ToolDetailPage: pause 403 TOOL_NOT_OWNER shows row 21 and the tool stays', async () => {
    stubFetch((method, url) => {
      if (url !== '/api/tools/7') return undefined
      if (method === 'GET') return ok(TOOL)
      if (method === 'PATCH') return apiError(403, 'TOOL_NOT_OWNER')
      return undefined
    })
    const { container } = renderAt(<ToolDetailPage />, '/tools/:id', '/tools/7')

    fireEvent.click(await screen.findByRole('button', { name: /pausar/i }))

    await expectSpanishAlert(container, 'Solo podés modificar tus propias herramientas.')
    expect(screen.getByText('Taladro')).toBeInTheDocument()
  })

  it('E5b ToolDetailPage: delete 409 TOOL_HAS_ACTIVE_LOANS shows row 22 and the tool stays', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    stubFetch((method, url) => {
      if (url !== '/api/tools/7') return undefined
      if (method === 'GET') return ok(TOOL)
      if (method === 'DELETE') return apiError(409, 'TOOL_HAS_ACTIVE_LOANS')
      return undefined
    })
    const { container } = renderAt(<ToolDetailPage />, '/tools/:id', '/tools/7')

    fireEvent.click(await screen.findByRole('button', { name: /eliminar/i }))

    await expectSpanishAlert(container, 'No podés eliminar esta herramienta mientras tenga préstamos en curso.')
    expect(screen.getByText('Taladro')).toBeInTheDocument()
  })

  it('E6 PublishForm: publish 400 TOOL_NAME_LENGTH shows row 18', async () => {
    stubFetch((method, url) =>
      method === 'POST' && url === '/api/tools' ? apiError(400, 'TOOL_NAME_LENGTH') : undefined,
    )
    const { container } = renderAt(<PublishForm />, '/publish', '/publish')

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Taladro' } })
    fireEvent.change(screen.getByLabelText(/descripción/i), { target: { value: 'Un taladro percutor' } })
    fireEvent.change(screen.getByLabelText(/categoría/i), { target: { value: 'Herramientas eléctricas' } })
    fireEvent.change(screen.getByLabelText(/estado/i), { target: { value: 'bueno' } })
    fireEvent.click(screen.getByRole('button', { name: /publicar/i }))

    await expectSpanishAlert(container, 'El nombre tiene que tener entre 3 y 60 caracteres.')
  })

  it('E6b PublishForm (edit): load 404 TOOL_NOT_FOUND shows row 20', async () => {
    stubFetch((method, url) =>
      method === 'GET' && url === '/api/tools/7' ? apiError(404, 'TOOL_NOT_FOUND') : undefined,
    )
    const { container } = renderAt(<PublishForm />, '/tools/:id/edit', '/tools/7/edit')

    await expectSpanishAlert(container, 'Esta herramienta no existe o fue eliminada.')
  })

  it('E7 RequestLoanPage: request 409 LOAN_DATES_OVERLAP shows row 29', async () => {
    stubFetch((method, url) =>
      method === 'POST' && url === '/api/tools/7/loans' ? apiError(409, 'LOAN_DATES_OVERLAP') : undefined,
    )
    const { container } = renderAt(<RequestLoanPage />, '/tools/:id/request', '/tools/7/request')

    // Far in the future, so the dates are valid whatever day the suite runs
    fireEvent.change(screen.getByLabelText(/fecha de inicio/i), { target: { value: '2030-01-15' } })
    fireEvent.change(screen.getByLabelText(/fecha de fin/i), { target: { value: '2030-01-20' } })
    fireEvent.click(screen.getByRole('button', { name: /solicitar préstamo/i }))

    await expectSpanishAlert(container, 'La herramienta ya está reservada en esas fechas. Probá con otras.')
  })

  it('E8 LoanDetailPage: load 404 LOAN_NOT_FOUND shows row 32', async () => {
    stubFetch((method, url) =>
      method === 'GET' && url === '/api/loans/42' ? apiError(404, 'LOAN_NOT_FOUND') : undefined,
    )
    const { container } = renderAt(<LoanDetailPage />, '/loans/:id', '/loans/42')

    await expectSpanishAlert(container, 'Este préstamo no existe.')
  })

  it('E9 LoanDetailPage: status change 409 LOAN_TRANSITION_INVALID shows row 30 and the loan stays', async () => {
    stubFetch((method, url) => {
      if (method === 'GET' && url === '/api/loans/42') return ok(LOAN)
      if (method === 'GET' && url === '/api/tools/7') return ok(TOOL)
      if (method === 'PATCH' && url === '/api/loans/42/status') return apiError(409, 'LOAN_TRANSITION_INVALID')
      return undefined
    })
    const { container } = renderAt(<LoanDetailPage />, '/loans/:id', '/loans/42')

    await screen.findByText('Taladro')
    fireEvent.click(screen.getByRole('button', { name: /aceptar/i }))

    await expectSpanishAlert(container, 'Este préstamo ya cambió de estado. Recargá la página para ver cómo está.')
    expect(screen.getByText('Taladro')).toBeInTheDocument()
  })

  // A code with its own text (not the generic one), so a screen that always showed the generic
  // text would fail here
  it('E10 MyLoansPage: both lists 429 RATE_LIMITED show row 35', async () => {
    stubFetch((method, url) =>
      method === 'GET' && url.startsWith('/api/loans?type=') ? apiError(429, 'RATE_LIMITED') : undefined,
    )
    const { container } = renderAt(<MyLoansPage />, '/loans', '/loans')

    await expectSpanishAlert(container, 'Hubo demasiados pedidos en poco tiempo. Esperá un minuto y volvé a intentar.')
  })

  it('E11 ProfilePage: both loads 429 RATE_LIMITED show row 35', async () => {
    stubFetch((method, url) =>
      method === 'GET' && (url === '/api/me/tools' || url === '/api/me/history')
        ? apiError(429, 'RATE_LIMITED')
        : undefined,
    )
    const { container } = renderAt(<ProfilePage />, '/profile', '/profile')

    await expectSpanishAlert(container, 'Hubo demasiados pedidos en poco tiempo. Esperá un minuto y volvé a intentar.')
  })

  it('E12 ProfilePage: password change 401 CURRENT_PASSWORD_INCORRECT shows row 12 and stays', async () => {
    stubFetch((method, url) => {
      if (method === 'GET' && url === '/api/me/tools') return ok({ tools: [], receivedLoans: [], madeLoans: [] })
      if (method === 'GET' && url === '/api/me/history') return ok([])
      if (method === 'PATCH' && url === '/api/me/password') return apiError(401, 'CURRENT_PASSWORD_INCORRECT')
      return undefined
    })
    const { container } = renderAt(<ProfilePage />, '/profile', '/profile')

    fireEvent.click(await screen.findByText('Configuración (0)'))
    fireEvent.change(screen.getByLabelText(/contraseña actual/i), { target: { value: 'current123' } })
    fireEvent.change(screen.getByLabelText(/^nueva contraseña/i), { target: { value: 'newpassword1' } })
    fireEvent.change(screen.getByLabelText(/^confirmar nueva contraseña/i), { target: { value: 'newpassword1' } })
    fireEvent.click(screen.getByRole('button', { name: /cambiar contraseña/i }))

    await expectSpanishAlert(container, 'La contraseña actual no es correcta. Revisala e intentá de nuevo.')
    // A wrong current password is a 401, but not a session problem: it does not go to the login
    expect(screen.queryByTestId('location')).toBeNull()
  })

  it('E12b ProfilePage: delete account 409 ACCOUNT_HAS_ACTIVE_LOANS shows row 16', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    stubFetch((method, url) => {
      if (method === 'GET' && url === '/api/me/tools') return ok({ tools: [], receivedLoans: [], madeLoans: [] })
      if (method === 'GET' && url === '/api/me/history') return ok([])
      if (method === 'DELETE' && url === '/api/me/account') return apiError(409, 'ACCOUNT_HAS_ACTIVE_LOANS')
      return undefined
    })
    const { container } = renderAt(<ProfilePage />, '/profile', '/profile')

    fireEvent.click(await screen.findByText('Configuración (0)'))
    fireEvent.click(screen.getByRole('button', { name: /eliminar mi cuenta/i }))

    await expectSpanishAlert(container, 'No podés eliminar tu cuenta mientras tengas préstamos en curso.')
  })

  it('E13 NavBar: logout that fails shows row 10', async () => {
    // NavBar talks to the server through useAuth().logout, mocked here: no request is expected
    stubFetch(() => undefined)
    logoutMock.mockResolvedValueOnce('failed')
    const { container } = renderAt(<NavBar />, '/', '/')

    fireEvent.click(screen.getByRole('button', { name: /salir/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent?.trim()).toBe(
      'No pudimos cerrar tu sesión. Revisá tu conexión e intentá de nuevo en un momento.',
    )
    expect((await axe.run(container)).violations).toEqual([])
  })
})
