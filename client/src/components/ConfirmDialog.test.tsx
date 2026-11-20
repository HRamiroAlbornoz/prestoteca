// ConfirmDialog (spec server-sessions AC-18, plan §3.5, decision D13). Keyboard with user-event.
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { useRef, useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

const TITLE = '¿Cerrar la sesión en tus otros dispositivos?'
const DESCRIPTION = 'Vas a seguir con la sesión abierta acá.'
const CONFIRM_LABEL = 'Cerrar sesiones'
const CANCEL_LABEL = 'Cancelar'

function Harness({
  onCancel,
  onConfirm,
  waitOnConfirm,
}: {
  onCancel: () => void
  onConfirm: () => void
  waitOnConfirm?: boolean
}) {
  const openerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleCancel = () => {
    onCancel()
    setOpen(false)
  }

  const handleConfirm = () => {
    onConfirm()
    if (waitOnConfirm) {
      setBusy(true)
    } else {
      setOpen(false)
    }
  }

  return (
    <>
      <button type="button" ref={openerRef} onClick={() => setOpen(true)}>
        Abrir
      </button>
      <ConfirmDialog
        open={open}
        title={TITLE}
        description={DESCRIPTION}
        confirmLabel={CONFIRM_LABEL}
        cancelLabel={CANCEL_LABEL}
        busy={busy}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        returnFocusTo={openerRef}
      />
    </>
  )
}

describe('ConfirmDialog (AC-18)', () => {
  it('C1: renders nothing while closed', () => {
    render(
      <ConfirmDialog
        open={false}
        title={TITLE}
        description={DESCRIPTION}
        confirmLabel={CONFIRM_LABEL}
        cancelLabel={CANCEL_LABEL}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        returnFocusTo={{ current: null }}
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('C2: open, it is a modal dialog named by the question and described by the text', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName(TITLE)
    expect(dialog).toHaveAccessibleDescription(DESCRIPTION)
  })

  it('C3: the focus starts on the cancel button', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(screen.getByRole('button', { name: CANCEL_LABEL })).toHaveFocus()
  })

  it('C4: Tab cycles inside: Cancelar → Cerrar sesiones → Cancelar', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.tab()
    expect(screen.getByRole('button', { name: CONFIRM_LABEL })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: CANCEL_LABEL })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Abrir' })).not.toHaveFocus()
  })

  it('C5: Shift+Tab cycles inside: Cancelar → Cerrar sesiones → Cancelar', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: CONFIRM_LABEL })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: CANCEL_LABEL })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Abrir' })).not.toHaveFocus()
  })

  it('C6: while busy, both buttons are disabled, the focus is on the dialog and nothing can be used', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    const props = {
      open: true,
      busy: true,
      title: TITLE,
      description: DESCRIPTION,
      confirmLabel: CONFIRM_LABEL,
      cancelLabel: CANCEL_LABEL,
      onConfirm,
      onCancel,
      returnFocusTo: { current: null },
    }
    render(<ConfirmDialog {...props} />)
    const dialog = screen.getByRole('dialog')
    const cancelBtn = screen.getByRole('button', { name: CANCEL_LABEL })
    const confirmBtn = screen.getByRole('button', { name: CONFIRM_LABEL })
    expect(cancelBtn).toBeDisabled()
    expect(confirmBtn).toBeDisabled()
    expect(dialog).toHaveAttribute('aria-busy', 'true')
    expect(dialog).toHaveFocus()
    await user.tab()
    expect(dialog).toHaveFocus()
    await user.tab({ shift: true })
    expect(dialog).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
    await user.click(confirmBtn)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeNull()
  })

  it('C7: Escape cancels, closes the dialog and gives the focus back to the opener', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus()
  })

  it('C8: Cancelar cancels, closes the dialog and gives the focus back to the opener', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.click(screen.getByRole('button', { name: CANCEL_LABEL }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus()
  })

  it('C9: Cerrar sesiones confirms once and does not cancel', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.click(screen.getByRole('button', { name: CONFIRM_LABEL }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('C10: when the parent closes it after confirming, the focus goes back to the opener', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.click(screen.getByRole('button', { name: CONFIRM_LABEL }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Abrir' })).toHaveFocus()
  })

  it('C11: open, axe finds no accessibility violations', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    const results = await axe.run(screen.getByRole('dialog'))
    expect(results.violations).toHaveLength(0)
  })

  it('C12: a press on the overlay does nothing, the focus stays inside and the buttons still work', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    const overlay = screen.getByRole('dialog').parentElement as HTMLElement
    await user.click(overlay)
    expect(onCancel).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeNull()
    expect(screen.getByRole('button', { name: CANCEL_LABEL })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: CANCEL_LABEL }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('C13: the buttons show the labels it receives', () => {
    render(
      <ConfirmDialog
        open
        title="¿Estás seguro?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Sí, cerrar"
        cancelLabel="No"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        returnFocusTo={{ current: null }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Sí, cerrar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: CANCEL_LABEL })).toBeNull()
  })

  it('C14: confirming while the parent waits keeps the focus inside the dialog', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <Harness
        onCancel={onCancel}
        onConfirm={onConfirm}
        waitOnConfirm
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.tab()
    expect(screen.getByRole('button', { name: CONFIRM_LABEL })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const cancelBtn = screen.getByRole('button', { name: CANCEL_LABEL })
    const confirmBtn = screen.getByRole('button', { name: CONFIRM_LABEL })
    expect(cancelBtn).toBeDisabled()
    expect(confirmBtn).toBeDisabled()
    expect(screen.getByRole('dialog')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('dialog')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Abrir' })).not.toHaveFocus()
    await user.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeNull()
  })

  it('C15: when busy ends with the dialog still open, the focus goes back to Cancelar', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const props = {
      open: true,
      busy: true,
      title: TITLE,
      description: DESCRIPTION,
      confirmLabel: CONFIRM_LABEL,
      cancelLabel: CANCEL_LABEL,
      onConfirm,
      onCancel,
      returnFocusTo: { current: null },
    }
    const { rerender } = render(<ConfirmDialog {...props} />)
    expect(screen.getByRole('dialog')).toHaveFocus()
    rerender(<ConfirmDialog {...props} busy={false} />)
    expect(screen.getByRole('button', { name: CANCEL_LABEL })).toHaveFocus()
    expect(screen.getByRole('button', { name: CANCEL_LABEL })).not.toBeDisabled()
  })

  it('C16: after a click on the text, Escape still cancels', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.click(screen.getByRole('heading', { name: TITLE }))
    expect(screen.getByRole('dialog')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('C17: two dialogs on one page do not share ids', () => {
    render(
      <div>
        <ConfirmDialog
          open
          title="Uno"
          description="Descripción uno"
          confirmLabel="Confirmar"
          cancelLabel="Cancelar"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          returnFocusTo={{ current: null }}
        />
        <ConfirmDialog
          open
          title="Dos"
          description="Descripción dos"
          confirmLabel="Confirmar"
          cancelLabel="Cancelar"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          returnFocusTo={{ current: null }}
        />
      </div>,
    )
    const [a, b] = screen.getAllByRole('dialog')
    expect(a.getAttribute('aria-labelledby')).not.toEqual(
      b.getAttribute('aria-labelledby'),
    )
    expect(a.getAttribute('aria-describedby')).not.toEqual(
      b.getAttribute('aria-describedby'),
    )
    expect(a).toHaveAccessibleName('Uno')
    expect(b).toHaveAccessibleName('Dos')
  })

  it('C18: after a click on the text, Tab and Shift+Tab go into the buttons', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<Harness onCancel={onCancel} onConfirm={onConfirm} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.click(screen.getByRole('heading', { name: TITLE }))
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: CONFIRM_LABEL })).toHaveFocus()
    await user.click(screen.getByRole('heading', { name: TITLE }))
    await user.tab()
    expect(screen.getByRole('button', { name: CANCEL_LABEL })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Abrir' })).not.toHaveFocus()
  })

  it('C19: inside a form, the buttons never submit it', async () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <form onSubmit={onSubmit}>
        <ConfirmDialog
          open
          title={TITLE}
          description={DESCRIPTION}
          confirmLabel={CONFIRM_LABEL}
          cancelLabel={CANCEL_LABEL}
          onConfirm={onConfirm}
          onCancel={onCancel}
          returnFocusTo={{ current: null }}
        />
      </form>,
    )
    await user.click(screen.getByRole('button', { name: CONFIRM_LABEL }))
    await user.click(screen.getByRole('button', { name: CANCEL_LABEL }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
