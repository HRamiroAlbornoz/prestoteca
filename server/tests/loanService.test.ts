import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LoanRepository } from '../src/modules/loans/loanRepo.js'
import { LoanService } from '../src/modules/loans/loanService.js'

function createMockLoanRepo() {
  const loans = new Map<string, any>()
  let nextId = 1

  const repo = {
    create: vi.fn(async (input: any) => {
      const id = `loan-uuid-${nextId++}`
      const loan = {
        id,
        tool_id: input.toolId,
        borrower_id: input.borrowerId,
        owner_id: input.ownerId,
        start_date: input.startDate,
        end_date: input.endDate,
        status: input.status,
        note: input.note ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      loans.set(id, loan)
      return loan
    }),
    findById: vi.fn(async (id: string) => {
      return loans.get(id) ?? null
    }),
    findAllByTool: vi.fn(async (toolId: string) => {
      return Array.from(loans.values()).filter((l) => l.tool_id === toolId)
    }),
    findAllByBorrower: vi.fn(async (borrowerId: string) => {
      return Array.from(loans.values()).filter((l) => l.borrower_id === borrowerId)
    }),
    findAllByOwner: vi.fn(async (ownerId: string) => {
      return Array.from(loans.values()).filter((l) => l.owner_id === ownerId)
    }),
    findAllByStatus: vi.fn(async (status: string) => {
      return Array.from(loans.values()).filter((l) => l.status === status)
    }),
    updateStatus: vi.fn(async (id: string, status: string) => {
      const loan = loans.get(id)
      if (loan) {
        loan.status = status
        loan.updated_at = new Date().toISOString()
      }
      return loan ?? null
    }),
    hasActiveLoans: vi.fn(async (toolId: string) => {
      const activeLoans = Array.from(loans.values()).filter(
        (l) => l.tool_id === toolId && ['pendiente', 'aceptado', 'entregado', 'vencido'].includes(l.status),
      )
      return activeLoans.length > 0
    }),
    hasOverlappingDates: vi.fn(async (toolId: string, startDate: string, endDate: string, excludeLoanId?: string) => {
      const overlapping = Array.from(loans.values()).filter((l) => {
        if (l.tool_id !== toolId) return false
        if (!['pendiente', 'aceptado', 'entregado', 'vencido'].includes(l.status)) return false
        if (excludeLoanId && l.id === excludeLoanId) return false
        return l.start_date <= endDate && l.end_date >= startDate
      })
      return overlapping.length > 0
    }),
  } as unknown as LoanRepository

  const query = vi.fn(async (text: string, values?: unknown[]) => {
    if (text.includes('SELECT id, end_date FROM loans WHERE status')) {
      const status = values?.[0] as string
      const rows = Array.from(loans.values())
        .filter((l) => l.status === status)
        .map((l) => ({ id: l.id, end_date: l.end_date }))
      return { rows, rowCount: rows.length } as { rows: unknown[]; rowCount: number | null }
    }
    return { rows: [], rowCount: 0 } as { rows: unknown[]; rowCount: number | null }
  })

  return { repo, loans, query }
}

describe('LoanService', () => {
  let mock: ReturnType<typeof createMockLoanRepo>
  let service: LoanService

  beforeEach(() => {
    mock = createMockLoanRepo()
    service = new LoanService(mock.repo, mock.query.bind(mock))
  })

  it('rejects creating a loan for own tool', async () => {
    await expect(
      service.create({
        toolId: 'tool-1',
        userId: 'user-1',
        ownerId: 'user-1',
        startDate: '2026-10-10',
        endDate: '2026-10-20',
        note: 'Necesito el taladro',
      }),
    ).rejects.toThrow('No puedes pedir tu propia herramienta')
  })

  it('rejects creating a loan with overlapping dates', async () => {
    mock.loans.set('loan-1', {
      id: 'loan-1',
      tool_id: 'tool-1',
      borrower_id: 'user-2',
      owner_id: 'user-1',
      start_date: '2026-10-10',
      end_date: '2026-10-20',
      status: 'pendiente',
      note: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    mock.repo.hasOverlappingDates.mockResolvedValueOnce(true)

    await expect(
      service.create({
        toolId: 'tool-1',
        userId: 'user-3',
        ownerId: 'user-1',
        startDate: '2026-10-15',
        endDate: '2026-10-25',
        note: 'Conflicto de fechas',
      }),
    ).rejects.toThrow(/solapada|overlap/i)
  })

  it('creates a loan with status pendiente', async () => {
    mock.repo.hasOverlappingDates.mockResolvedValueOnce(false)

    const loan = await service.create({
      toolId: 'tool-1',
      userId: 'user-2',
      ownerId: 'user-1',
      startDate: '2026-10-10',
      endDate: '2026-10-20',
      note: 'Necesito el taladro',
    })

    expect(loan.status).toBe('pendiente')
    expect(mock.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        toolId: 'tool-1',
        borrowerId: 'user-2',
        ownerId: 'user-1',
        status: 'pendiente',
      }),
    )
  })

  it('rejects invalid status transition: pendiente → devuelto', async () => {
    mock.loans.set('loan-1', {
      id: 'loan-1',
      tool_id: 'tool-1',
      borrower_id: 'user-2',
      owner_id: 'user-1',
      start_date: '2026-10-10',
      end_date: '2026-10-20',
      status: 'pendiente',
      note: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    await expect(
      service.transition('loan-1', 'devuelto', 'user-2'),
    ).rejects.toThrow(/transición inválida|invalid.*transition/i)
  })

  it('allows valid transition: pendiente → aceptado (owner)', async () => {
    mock.loans.set('loan-1', {
      id: 'loan-1',
      tool_id: 'tool-1',
      borrower_id: 'user-2',
      owner_id: 'user-1',
      start_date: '2026-10-10',
      end_date: '2026-10-20',
      status: 'pendiente',
      note: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const result = await service.transition('loan-1', 'aceptado', 'user-1')
    expect(result.status).toBe('aceptado')
  })

  it('allows valid transition: aceptado → entregado (owner)', async () => {
    mock.loans.set('loan-1', {
      id: 'loan-1',
      tool_id: 'tool-1',
      borrower_id: 'user-2',
      owner_id: 'user-1',
      start_date: '2026-10-10',
      end_date: '2026-10-20',
      status: 'aceptado',
      note: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const result = await service.transition('loan-1', 'entregado', 'user-1')
    expect(result.status).toBe('entregado')
  })

  it('allows valid transition: entregado → devuelto (owner)', async () => {
    mock.loans.set('loan-1', {
      id: 'loan-1',
      tool_id: 'tool-1',
      borrower_id: 'user-2',
      owner_id: 'user-1',
      start_date: '2026-10-10',
      end_date: '2026-10-20',
      status: 'entregado',
      note: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const result = await service.transition('loan-1', 'devuelto', 'user-1')
    expect(result.status).toBe('devuelto')
  })

  it('allows valid transition: aceptado → cancelado (borrower)', async () => {
    mock.loans.set('loan-1', {
      id: 'loan-1',
      tool_id: 'tool-1',
      borrower_id: 'user-2',
      owner_id: 'user-1',
      start_date: '2026-10-10',
      end_date: '2026-10-20',
      status: 'aceptado',
      note: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const result = await service.transition('loan-1', 'cancelado', 'user-2')
    expect(result.status).toBe('cancelado')
  })

  it('allows valid transition: pendiente → cancelado (owner)', async () => {
    mock.loans.set('loan-1', {
      id: 'loan-1',
      tool_id: 'tool-1',
      borrower_id: 'user-2',
      owner_id: 'user-1',
      start_date: '2026-10-10',
      end_date: '2026-10-20',
      status: 'pendiente',
      note: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const result = await service.transition('loan-1', 'cancelado', 'user-1')
    expect(result.status).toBe('cancelado')
  })

  it('rejects transition for non-participant', async () => {
    mock.loans.set('loan-1', {
      id: 'loan-1',
      tool_id: 'tool-1',
      borrower_id: 'user-2',
      owner_id: 'user-1',
      start_date: '2026-10-10',
      end_date: '2026-10-20',
      status: 'pendiente',
      note: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    await expect(
      service.transition('loan-1', 'aceptado', 'user-99'),
    ).rejects.toThrow(/particip|participant/i)
  })

  it('rejects transition for non-existent loan', async () => {
    await expect(
      service.transition('non-existent', 'aceptado', 'user-1'),
    ).rejects.toThrow(/no encontrado|not found/i)
  })

  it('auto-vencido: entregado loan past end_date → vencido', async () => {
    mock.loans.set('loan-1', {
      id: 'loan-1',
      tool_id: 'tool-1',
      borrower_id: 'user-2',
      owner_id: 'user-1',
      start_date: '2026-09-01',
      end_date: '2026-09-15',
      status: 'entregado',
      note: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    // Mock today as 2026-09-20 (past end_date)
    const originalDate = global.Date
    global.Date = class extends originalDate {
      constructor() {
        super()
      }
      static now() {
        return new originalDate('2026-09-20').getTime()
      }
    } as any

    const result = await service.autoVencido()
    expect(result).toBe(1)

    const updated = await mock.repo.findById('loan-1')
    expect(updated!.status).toBe('vencido')

    global.Date = originalDate
  })

  it('auto-vencido: entregado loan not past end_date → no change', async () => {
    mock.loans.set('loan-1', {
      id: 'loan-1',
      tool_id: 'tool-1',
      borrower_id: 'user-2',
      owner_id: 'user-1',
      start_date: '2026-10-01',
      end_date: '2026-10-20',
      status: 'entregado',
      note: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    const originalDate = global.Date
    global.Date = class extends originalDate {
      constructor() {
        super()
      }
      static now() {
        return new originalDate('2026-10-10').getTime()
      }
    } as any

    const result = await service.autoVencido()
    expect(result).toBe(0)

    const updated = await mock.repo.findById('loan-1')
    expect(updated!.status).toBe('entregado')

    global.Date = originalDate
  })
})
