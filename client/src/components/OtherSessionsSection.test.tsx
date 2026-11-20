// OtherSessionsSection (spec server-sessions AC-11, AC-18, AC-19, AC-32; plan §3.5).
// The section talks to the server through fetch (mocked) and to the session through useAuth (mocked).
// useNavigate is NOT mocked: a session error must end on the real login route.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { OtherSessionsSection } from './OtherSessionsSection'
import { MESSAGES } from '../errors/messages'

const markSignedOut = vi.fn()
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ markSignedOut }),
}))

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

const OPEN_LABEL = 'Cerrar sesión en los otros dispositivos'
const QUESTION = '¿Cerrar la sesión en tus otros dispositivos?'
const SUCCESS = 'Cerramos la sesión en tus otros dispositivos.'
const SERVER_TEXT = 'English text from the server'

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search}</p>
}

function renderSection() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<OtherSessionsSection />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

// A fetch answer with a status and a JSON body (or a body that is not JSON)
function answer(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected token < in JSON')
      return body
    },
  }
}

function apiError(status: number, code: string) {
  return answer(status, { error: { code, message: SERVER_TEXT } })
}

// A request that stays pending until the test answers it
function pendingRequest() {
  let resolve: (value: unknown) => void = () => {}
  mockFetch.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      }),
  )
  return { answer: (value: unknown) => resolve(value) }
}

async function openAndConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: OPEN_LABEL }))
  await user.click(screen.getByRole('button', { name: 'Cerrar sesiones' }))
}

beforeEach(() => {
  mockFetch.mockReset()
  markSignedOut.mockClear()
})

describe('OtherSessionsSection — the confirmation (AC-18)', () => {
  it('S1: both live regions are mounted and empty before anything happens; no request on mount', () => {
    renderSection()

    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    // Empty, they take no space: no box classes (padding, border, margin)
    expect(screen.getByRole('status')).toHaveAttribute('class', '')
    expect(screen.getByRole('alert')).toHaveAttribute('class', '')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('S2: the button opens a modal dialog named by the question, with the focus inside', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('button', { name: OPEN_LABEL }))

    const dialog = screen.getByRole('dialog', { name: QUESTION })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Vas a seguir con la sesión abierta acá.')
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('S3: "Cancelar" closes it, sends nothing, and gives the focus back to the button', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('button', { name: OPEN_LABEL }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: OPEN_LABEL })).toHaveFocus()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
  })

  it('S4: Escape closes it, sends nothing, and gives the focus back to the button', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('button', { name: OPEN_LABEL }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: OPEN_LABEL })).toHaveFocus()
  })

  it('S5: has no accessibility violations, closed and open', async () => {
    const user = userEvent.setup()
    const { container } = renderSection()

    expect((await axe.run(container)).violations).toEqual([])
    await user.click(screen.getByRole('button', { name: OPEN_LABEL }))
    expect((await axe.run(container)).violations).toEqual([])
  })
})

describe('OtherSessionsSection — confirming (AC-18, AC-19)', () => {
  it('S6: sends DELETE /api/me/other-sessions; 204 → success text announced, dialog closed, focus on the button', async () => {
    mockFetch.mockResolvedValueOnce(answer(204))
    const user = userEvent.setup()
    renderSection()

    await openAndConfirm(user)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SUCCESS))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: OPEN_LABEL })).toHaveFocus()
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/me/other-sessions')
    expect(init.method).toBe('DELETE')
    expect(markSignedOut).not.toHaveBeenCalled()
  })

  it('S7: a second success empties the region while waiting and announces the text again', async () => {
    mockFetch.mockResolvedValueOnce(answer(204))
    const user = userEvent.setup()
    renderSection()

    await openAndConfirm(user)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SUCCESS))

    const second = pendingRequest()
    await openAndConfirm(user)
    // While the second request waits, the old text is gone: the new one is a change the reader announces
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    second.answer(answer(204))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SUCCESS))
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('S8: while waiting, both buttons are disabled and more clicks send no second request', async () => {
    const request = pendingRequest()
    const user = userEvent.setup()
    renderSection()

    await openAndConfirm(user)

    const confirm = screen.getByRole('button', { name: 'Cerrar sesiones' })
    expect(confirm).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    // user-event does not click disabled buttons: a direct click is what a fast double tap
    // that lands before the re-render would do
    confirm.click()
    confirm.click()
    expect(mockFetch).toHaveBeenCalledTimes(1)

    request.answer(answer(204))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SUCCESS))
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('S9: a double click on "Cerrar sesiones" in the same moment sends a single request', async () => {
    const request = pendingRequest()
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('button', { name: OPEN_LABEL }))
    const confirm = screen.getByRole('button', { name: 'Cerrar sesiones' })
    // Two clicks before React draws the disabled state: only the ref can stop the second one
    confirm.click()
    confirm.click()
    expect(mockFetch).toHaveBeenCalledTimes(1)

    request.answer(answer(204))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SUCCESS))
  })

  it('S10: after the answer, the button can be used again (the guard is released)', async () => {
    mockFetch.mockResolvedValueOnce(apiError(500, 'INTERNAL_ERROR'))
    mockFetch.mockResolvedValueOnce(answer(204))
    const user = userEvent.setup()
    renderSection()

    await openAndConfirm(user)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.OTHER_SESSIONS_CLOSE_FAILED))

    await openAndConfirm(user)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SUCCESS))
    // The old error is gone: only one message at a time
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

describe('OtherSessionsSection — failures (AC-11, AC-32)', () => {
  it('S11: 429 RATE_LIMITED → row 35 in the alert, never row 39 or the server text', async () => {
    mockFetch.mockResolvedValueOnce(apiError(429, 'RATE_LIMITED'))
    const user = userEvent.setup()
    renderSection()

    await openAndConfirm(user)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.RATE_LIMITED))
    expect(screen.getByRole('alert').textContent).toBe(MESSAGES.RATE_LIMITED)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.queryByText(SERVER_TEXT)).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: OPEN_LABEL })).toHaveFocus()
  })

  it.each([
    ['500 INTERNAL_ERROR', () => mockFetch.mockResolvedValueOnce(apiError(500, 'INTERNAL_ERROR'))],
    ['403 ORIGIN_NOT_ALLOWED', () => mockFetch.mockResolvedValueOnce(apiError(403, 'ORIGIN_NOT_ALLOWED'))],
    ['502 with an HTML body (not JSON)', () => mockFetch.mockResolvedValueOnce(answer(502))],
    ['500 with an unknown code', () => mockFetch.mockResolvedValueOnce(apiError(500, 'SOMETHING_NEW'))],
    ['a network failure', () => mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))],
  ])('S12: %s → row 39 in the alert (not row 36 or 37), dialog closed, focus on the button', async (_name, arrange) => {
    arrange()
    const user = userEvent.setup()
    const { container } = renderSection()

    await openAndConfirm(user)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.OTHER_SESSIONS_CLOSE_FAILED))
    expect(screen.getByRole('alert').textContent).toBe(MESSAGES.OTHER_SESSIONS_CLOSE_FAILED)
    expect(screen.queryByText(SERVER_TEXT)).toBeNull()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: OPEN_LABEL })).toHaveFocus()
    // Still logged in: the session is not touched
    expect(markSignedOut).not.toHaveBeenCalled()
    expect(screen.queryByTestId('location')).toBeNull()
    expect((await axe.run(container)).violations).toEqual([])
  })

  it('S13: 401 SESSION_REQUIRED → the login with returnTo=/profile, the user forgotten, not row 39', async () => {
    mockFetch.mockResolvedValueOnce(apiError(401, 'SESSION_REQUIRED'))
    const user = userEvent.setup()
    renderSection()

    await openAndConfirm(user)

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login?returnTo=%2Fprofile'))
    expect(markSignedOut).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(MESSAGES.OTHER_SESSIONS_CLOSE_FAILED)).toBeNull()
  })

  it('S14: an AbortError shows nothing and keeps the session', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'))
    const user = userEvent.setup()
    renderSection()

    await openAndConfirm(user)

    // Let the rejected request run through the section's code
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByRole('alert')).toBeEmptyDOMElement()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(markSignedOut).not.toHaveBeenCalled()
  })

  it('S15: leaving the page while waiting aborts the request; a late 401 does not go to the login', async () => {
    const request = pendingRequest()
    const user = userEvent.setup()
    const { unmount } = renderSection()

    await openAndConfirm(user)
    const signal = (mockFetch.mock.calls[0][1] as RequestInit).signal as AbortSignal
    expect(signal.aborted).toBe(false)

    unmount()
    expect(signal.aborted).toBe(true)

    // A server that answers anyway: only the "aborted → do nothing" check stops the navigation
    request.answer(apiError(401, 'SESSION_REQUIRED'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(markSignedOut).not.toHaveBeenCalled()
  })

  it('S16: leaving the page while the 401 body is being read does not go to the login', async () => {
    // The answer arrives, but its body is still on its way when the person leaves
    let sendBody: (body: unknown) => void = () => {}
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () =>
        new Promise((resolve) => {
          sendBody = resolve
        }),
    })
    const user = userEvent.setup()
    const { unmount } = renderSection()

    await openAndConfirm(user)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    unmount()

    sendBody({ error: { code: 'SESSION_REQUIRED', message: SERVER_TEXT } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(markSignedOut).not.toHaveBeenCalled()
  })

  it('S17: after a success and after an error, the box classes are there (and only on the one with text)', async () => {
    mockFetch.mockResolvedValueOnce(answer(204))
    mockFetch.mockResolvedValueOnce(apiError(500, 'INTERNAL_ERROR'))
    const user = userEvent.setup()
    renderSection()

    await openAndConfirm(user)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SUCCESS))
    expect(screen.getByRole('status')).not.toHaveAttribute('class', '')
    expect(screen.getByRole('alert')).toHaveAttribute('class', '')

    await openAndConfirm(user)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.OTHER_SESSIONS_CLOSE_FAILED))
    expect(screen.getByRole('alert')).not.toHaveAttribute('class', '')
    expect(screen.getByRole('status')).toHaveAttribute('class', '')
  })
})
