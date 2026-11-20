import { useRef, useEffect, useId } from 'react'
import type { RefObject } from 'react'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  busy?: boolean
  // Shown on the confirm button while busy, so a sighted person sees the wait (not only dimmed buttons)
  busyLabel?: string
  onConfirm: () => void
  onCancel: () => void
  returnFocusTo: RefObject<HTMLElement | null>
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
  returnFocusTo,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return
    const target = returnFocusTo.current
    cancelRef.current?.focus()
    return () => {
      target?.focus()
    }
  }, [open, returnFocusTo])

  useEffect(() => {
    if (!open) return
    if (busy) panelRef.current?.focus()
    else cancelRef.current?.focus()
  }, [open, busy])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      const enabled = Array.from(
        panelRef.current?.querySelectorAll<HTMLButtonElement>(
          'button:not([disabled])',
        ) ?? [],
      )
      const first = enabled[0]
      const last = enabled[enabled.length - 1]

      if (enabled.length === 0) {
        // Waiting: no button can take the focus, so it stays on the panel
        event.preventDefault()
        panelRef.current?.focus()
      } else if (!enabled.some((button) => button === document.activeElement)) {
        // The focus is on the panel itself (a click on the text) or on a button that just got disabled
        event.preventDefault()
        if (event.shiftKey) last.focus()
        else first.focus()
      } else if (document.activeElement === last && !event.shiftKey) {
        // Tab on the last button goes back to the first one
        event.preventDefault()
        first.focus()
      } else if (document.activeElement === first && event.shiftKey) {
        // Shift+Tab on the first button goes to the last one
        event.preventDefault()
        last.focus()
      }
      // Otherwise the browser moves the focus to the next button on its own
    } else if (event.key === 'Escape') {
      if (busy) return
      onCancel()
    }
  }

  const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      event.preventDefault()
    }
  }

  if (!open) return null

  return (
    <div onMouseDown={handleOverlayMouseDown} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        tabIndex={-1}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl focus:outline-hidden"
      >
        <h2 id={titleId} className="text-lg font-semibold text-gray-900">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-gray-700">
          {description}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            ref={cancelRef}
            disabled={busy}
            className="min-h-[44px] rounded-md border border-gray-500 bg-white px-4 py-2 text-gray-700 disabled:cursor-not-allowed disabled:text-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            className="min-h-[44px] rounded-md bg-red-600 px-4 py-2 text-white enabled:hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            onClick={onConfirm}
          >
            {busy && busyLabel ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
