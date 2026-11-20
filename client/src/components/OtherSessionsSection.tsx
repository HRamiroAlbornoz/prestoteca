import { useEffect, useId, useRef, useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { useApiError } from '../errors/useApiError'
import { readApiError, fetchFailureCode } from '../errors/apiError'
import { messageFor, type ClientErrorCode } from '../errors/messages'

// What the section shows after a request: nothing yet, the success text, or an error text
type Outcome = { kind: 'none' } | { kind: 'success' } | { kind: 'error'; text: string }

const SUCCESS_TEXT = 'Cerramos la sesión en tus otros dispositivos.'

// The same boxes as the messages of "Cambiar contraseña"
const SUCCESS_BOX = 'bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-sm mb-4'
const ERROR_BOX = 'bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm mb-4'

// "Cerrar sesión en los otros dispositivos" (spec server-sessions AC-11, AC-18, AC-19, AC-32; plan §3.5).
// Asks for confirmation, then closes every session of the account except this one.
export function OtherSessionsSection() {
  const { handle } = useApiError()
  const headingId = useId()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'none' })

  // The button that opens the dialog: the dialog gives the focus back to it when it closes
  const openButtonRef = useRef<HTMLButtonElement>(null)
  // True from the click on "Cerrar sesiones" until the answer: a second click sends nothing,
  // even before React has drawn the disabled buttons
  const sendingRef = useRef(false)
  // The request in flight, so leaving the page cancels it
  const controllerRef = useRef<AbortController | null>(null)

  // Leaving the page (unmount) cancels a request that is still waiting
  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
    }
  }, [])

  // The text for an error code. SESSION_REQUIRED goes to the login (handle returns null).
  // A 429 has its own general text (row 35); every other failure is row 39, never the
  // server's text and never the general "no connection" text (row 36).
  const errorTextFor = (code: ClientErrorCode): string | null => {
    if (code === 'SESSION_REQUIRED') return handle(code)
    if (code === 'RATE_LIMITED') return messageFor('RATE_LIMITED')
    return messageFor('OTHER_SESSIONS_CLOSE_FAILED')
  }

  // Closes the dialog and writes the result in the same update: the focus goes back to the
  // button after the text is already on screen
  const finish = (next: Outcome) => {
    setOutcome(next)
    setBusy(false)
    setDialogOpen(false)
  }

  const handleConfirm = async () => {
    if (sendingRef.current) return
    sendingRef.current = true
    setBusy(true)
    // Both regions start empty on every attempt, so the same text is announced again
    setOutcome({ kind: 'none' })

    const controller = new AbortController()
    controllerRef.current = controller

    try {
      const res = await fetch('/api/me/other-sessions', {
        method: 'DELETE',
        signal: controller.signal,
      })
      if (controller.signal.aborted) return

      if (res.ok) {
        finish({ kind: 'success' })
        return
      }

      const code = await readApiError(res)
      // Checked before errorTextFor: for SESSION_REQUIRED it navigates and forgets the user,
      // which must not happen once the person left the page
      if (controller.signal.aborted) return
      const text = errorTextFor(code)
      if (text === null) return // going to the login: nothing to show here
      finish({ kind: 'error', text })
    } catch (err) {
      // An aborted request means the page went away: there is nothing to show
      if (controller.signal.aborted || fetchFailureCode(err) === null) return
      finish({ kind: 'error', text: messageFor('OTHER_SESSIONS_CLOSE_FAILED') })
    } finally {
      sendingRef.current = false
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }

  const handleOpen = () => {
    setDialogOpen(true)
  }

  const handleCancel = () => {
    setDialogOpen(false)
  }

  return (
    <section aria-labelledby={headingId} className="bg-white rounded-lg shadow-xs p-6">
      <h2 id={headingId} className="text-lg font-semibold text-gray-900 mb-2">
        Sesiones abiertas
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        Si dejaste la sesión abierta en otra compu o en otro teléfono, podés cerrarla desde acá.
      </p>

      {/* Both live regions are always mounted, empty by default: a region that appears together
          with its text is not always announced by screen readers. Empty, they take no space
          (no padding or border), but they are never display:none, which would hide them from
          screen readers too */}
      <div role="status" className={outcome.kind === 'success' ? SUCCESS_BOX : ''}>
        {outcome.kind === 'success' && SUCCESS_TEXT}
      </div>
      <div role="alert" className={outcome.kind === 'error' ? ERROR_BOX : ''}>
        {outcome.kind === 'error' && outcome.text}
      </div>

      {/* Not disabled while waiting: if it were still disabled when the dialog closes, the
          focus could not come back to it */}
      <button
        ref={openButtonRef}
        type="button"
        onClick={handleOpen}
        className="min-h-11 px-4 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 focus:outline-hidden focus:ring-2 focus:ring-violet-500"
      >
        Cerrar sesión en los otros dispositivos
      </button>

      <ConfirmDialog
        open={dialogOpen}
        title="¿Cerrar la sesión en tus otros dispositivos?"
        description="Vas a seguir con la sesión abierta acá."
        confirmLabel="Cerrar sesiones"
        cancelLabel="Cancelar"
        busy={busy}
        busyLabel="Cerrando sesiones..."
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        returnFocusTo={openButtonRef}
      />
    </section>
  )
}
