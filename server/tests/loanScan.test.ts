import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createLoanScan, stopLoanScan } from '../src/modules/loans/loanScan.js'

function createMockQuery() {
  const loans = new Map<string, any>()

  const query = vi.fn(async (text: string, values?: unknown[]) => {
    // Handle findById for loan lookup
    if (text.includes('SELECT * FROM loans WHERE id')) {
      const loanId = values?.[0] as string
      const loan = loans.get(loanId)
      if (loan) {
        return { rows: [loan], rowCount: 1 } as { rows: unknown[]; rowCount: number | null }
      }
      return { rows: [], rowCount: 0 } as { rows: unknown[]; rowCount: number | null }
    }
    // Handle UPDATE status
    if (text.includes('UPDATE loans SET status')) {
      const status = values?.[0] as string
      const loanId = values?.[1] as string
      const loan = loans.get(loanId)
      if (loan) {
        loan.status = status
        loan.updated_at = new Date().toISOString()
        return { rows: [loan], rowCount: 1 } as { rows: unknown[]; rowCount: number | null }
      }
      return { rows: [], rowCount: 0 } as { rows: unknown[]; rowCount: number | null }
    }
    if (text.includes('SELECT id, end_date FROM loans WHERE status')) {
      const status = values?.[0] as string
      const rows = Array.from(loans.values())
        .filter((l) => l.status === status)
        .map((l) => ({ id: l.id, end_date: l.end_date }))
      return { rows, rowCount: rows.length } as { rows: unknown[]; rowCount: number | null }
    }
    return { rows: [], rowCount: 0 } as { rows: unknown[]; rowCount: number | null }
  })

  const updateStatus = vi.fn(async (id: string, status: string) => {
    const loan = loans.get(id)
    if (loan) {
      loan.status = status
      loan.updated_at = new Date().toISOString()
    }
    return loan ?? null
  })

  return { query, updateStatus, loans }
}

describe('loanScan cron', () => {
  let mock: ReturnType<typeof createMockQuery>

  beforeEach(() => {
    mock = createMockQuery()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    stopLoanScan()
    vi.restoreAllMocks()
  })

  it('creates a service and runs scan immediately', async () => {
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

    const originalDate = global.Date
    global.Date = class extends originalDate {
      constructor() {
        super()
      }
      static now() {
        return new originalDate('2026-09-20').getTime()
      }
    } as any

    const { service, stop } = createLoanScan(mock.query as any, 60000)

    // Scan runs immediately — loan should be vencido
    const updated = await service['repo'].findById('loan-1')
    expect(updated!.status).toBe('vencido')

    global.Date = originalDate
    stop()
  })

  it('runs scan at interval', async () => {
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

    const originalDate = global.Date
    global.Date = class extends originalDate {
      constructor() {
        super()
      }
      static now() {
        return new originalDate('2026-09-20').getTime()
      }
    } as any

    const { stop } = createLoanScan(mock.query as any, 60000)

    // Wait for the first interval
    await vi.advanceTimersByTimeAsync(60000)

    // The scan should have run again (loan is already vencido, so no change)
    // But we verify the timer fired without error

    global.Date = originalDate
    stop()
  })

  it('stop() clears the interval', async () => {
    const { stop } = createLoanScan(mock.query as any, 60000)

    stop()

    // Should not throw
    expect(() => stop()).not.toThrow()
  })

  it('handles scan error without crashing', async () => {
    // Mock query to throw
    const badQuery = vi.fn(async () => {
      throw new Error('DB connection failed')
    })

    // Should not throw — error is caught internally
    const { stop } = createLoanScan(badQuery as any, 60000)

    // Wait for interval
    await vi.advanceTimersByTimeAsync(60000)

    stop()
  })
})
