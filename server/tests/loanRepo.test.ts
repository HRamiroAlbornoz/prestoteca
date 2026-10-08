import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest'
import { Pool, type QueryResult } from 'pg'
import { LoanRepository } from '../src/modules/loans/loanRepo.js'

function createMockPool() {
  const queries: Array<{ text: string; values: unknown[] }> = []
  let nextId = 1

  // Store loans by id for lookup
  const loansById = new Map<string, any>()

  const mockPool = {
    query: vi.fn(async (text: string, values?: unknown[]) => {
      queries.push({ text, values: values ?? [] })

      // Simulate INSERT INTO loans RETURNING
      if (text.includes('INSERT INTO loans') && text.includes('RETURNING')) {
        const [toolId, borrowerId, ownerId, startDate, endDate, status, note] = values ?? []
        const id = `loan-uuid-${nextId++}`
        const loan = {
          id,
          tool_id: toolId,
          borrower_id: borrowerId,
          owner_id: ownerId,
          start_date: startDate,
          end_date: endDate,
          status,
          note: note ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        loansById.set(id, loan)
        return {
          rows: [loan],
          rowCount: 1,
        } as QueryResult
      }

      // Simulate SELECT by id
      if (text.includes('SELECT * FROM loans WHERE id =')) {
        const id = values?.[0] as string
        const loan = loansById.get(id)
        if (loan) {
          return { rows: [loan], rowCount: 1 } as QueryResult
        }
        return { rows: [], rowCount: 0 } as QueryResult
      }

      // Simulate SELECT with WHERE tool_id
      if (text.includes('SELECT * FROM loans') && text.includes('tool_id')) {
        const toolId = values?.[0] as string
        const filtered = Array.from(loansById.values()).filter(
          (l) => l.tool_id === toolId,
        )
        return { rows: filtered, rowCount: filtered.length } as QueryResult
      }

      // Simulate SELECT with WHERE borrower_id
      if (text.includes('SELECT * FROM loans') && text.includes('borrower_id')) {
        const borrowerId = values?.[0] as string
        const filtered = Array.from(loansById.values()).filter(
          (l) => l.borrower_id === borrowerId,
        )
        return { rows: filtered, rowCount: filtered.length } as QueryResult
      }

      // Simulate SELECT with WHERE owner_id
      if (text.includes('SELECT * FROM loans') && text.includes('owner_id')) {
        const ownerId = values?.[0] as string
        const filtered = Array.from(loansById.values()).filter(
          (l) => l.owner_id === ownerId,
        )
        return { rows: filtered, rowCount: filtered.length } as QueryResult
      }

      // Simulate hasActiveLoans: SELECT 1 FROM loans WHERE tool_id = $1 AND status IN (...) LIMIT 1
      // Must NOT have comparison operators (overlapping query has <= and >=)
      if (text.includes('SELECT 1 FROM loans') && text.includes('LIMIT 1') && !text.includes('<=')) {
        const toolId = values?.[0] as string
        const activeStatuses = ['pendiente', 'aceptado', 'entregado', 'vencido']
        const active = Array.from(loansById.values()).filter(
          (l) => l.tool_id === toolId && activeStatuses.includes(l.status),
        )
        return { rows: active.slice(0, 1), rowCount: active.length } as QueryResult
      }

      // Simulate hasOverlappingDates: SELECT 1 FROM loans WHERE tool_id ... AND start_date <= $2 AND end_date >= $3 LIMIT 1
      // Must have both <= and >= operators (unique to overlapping query)
      const hasOverlapCheck = text.includes('SELECT 1 FROM loans') && text.includes('LIMIT 1') && text.includes('<=') && text.includes('>=')
      if (hasOverlapCheck) {
        const toolId = values?.[0] as string
        const newEndDate = values?.[1] as string
        const newStartDate = values?.[2] as string
        const excludeId = values?.[3] as string | undefined
        const activeStatuses = ['pendiente', 'aceptado', 'entregado', 'vencido']
        const overlapping = Array.from(loansById.values()).filter((l) => {
          if (l.tool_id !== toolId) return false
          if (!activeStatuses.includes(l.status)) return false
          if (excludeId && l.id === excludeId) return false
          // Overlap: start_date <= new_end_date AND end_date >= new_start_date
          return l.start_date <= newEndDate && l.end_date >= newStartDate
        })
        return { rows: overlapping.slice(0, 1), rowCount: overlapping.length } as QueryResult
      }

      // Simulate UPDATE status
      if (text.includes('UPDATE loans SET status') && text.includes('WHERE id =')) {
        const id = values?.[values.length - 1] as string
        const status = values?.[0] as string
        const loan = loansById.get(id)
        if (loan) {
          loan.status = status
          loan.updated_at = new Date().toISOString()
          return { rows: [loan], rowCount: 1 } as QueryResult
        }
        return { rows: [], rowCount: 0 } as QueryResult
      }

      // Simulate UPDATE with updated_at
      if (text.includes('UPDATE loans') && text.includes('updated_at') && text.includes('status')) {
        const parts = text.split('WHERE')[1]?.trim() || ''
        const idMatch = parts.match(/id = \$\d+/)
        if (idMatch) {
          const idIndex = parseInt(idMatch[0].split('$')[1]) - 1
          const id = values?.[idIndex] as string
          const loan = loansById.get(id)
          if (loan) {
            loan.status = values?.[0] as string
            loan.updated_at = new Date().toISOString()
            return { rows: [loan], rowCount: 1 } as QueryResult
          }
        }
        return { rows: [], rowCount: 0 } as QueryResult
      }

      // Simulate UPDATE SET updated_at
      if (text.includes('UPDATE loans') && text.includes('updated_at')) {
        const parts = text.split('WHERE')[1]?.trim() || ''
        const idMatch = parts.match(/id = \$\d+/)
        if (idMatch) {
          const idIndex = parseInt(idMatch[0].split('$')[1]) - 1
          const id = values?.[idIndex] as string
          const loan = loansById.get(id)
          if (loan) {
            loan.updated_at = new Date().toISOString()
            return { rows: [loan], rowCount: 1 } as QueryResult
          }
        }
        return { rows: [], rowCount: 0 } as QueryResult
      }

      // Default: empty result
      return { rows: [], rowCount: 0 } as QueryResult
    }),
    getQueries: () => queries,
    getLoansById: () => loansById,
  }

  return mockPool
}

describe('LoanRepository', () => {
  let mockPool: ReturnType<typeof createMockPool>
  let repo: LoanRepository

  beforeEach(() => {
    mockPool = createMockPool()
    repo = new LoanRepository(mockPool.query.bind(mockPool))
  })

  it('creates a loan', async () => {
    const loan = await repo.create({
      toolId: 'tool-1',
      borrowerId: 'user-2',
      ownerId: 'user-1',
      startDate: '2026-10-10',
      endDate: '2026-10-20',
      status: 'pendiente',
      note: 'Necesito para un proyecto',
    })

    expect(loan.id).toBeDefined()
    expect(loan.tool_id).toBe('tool-1')
    expect(loan.borrower_id).toBe('user-2')
    expect(loan.owner_id).toBe('user-1')
    expect(loan.status).toBe('pendiente')
    expect(loan.note).toBe('Necesito para un proyecto')
  })

  it('returns null for non-existent loan', async () => {
    const loan = await repo.findById('non-existent')
    expect(loan).toBeNull()
  })

  it('finds loan by id', async () => {
    const created = await repo.create({
      toolId: 'tool-1',
      borrowerId: 'user-2',
      ownerId: 'user-1',
      startDate: '2026-10-10',
      endDate: '2026-10-20',
      status: 'pendiente',
    })

    const found = await repo.findById(created.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(created.id)
    expect(found!.status).toBe('pendiente')
  })

  it('finds loans by tool id', async () => {
    await repo.create({
      toolId: 'tool-1',
      borrowerId: 'user-2',
      ownerId: 'user-1',
      startDate: '2026-10-10',
      endDate: '2026-10-20',
      status: 'pendiente',
    })
    await repo.create({
      toolId: 'tool-1',
      borrowerId: 'user-3',
      ownerId: 'user-1',
      startDate: '2026-10-25',
      endDate: '2026-11-01',
      status: 'pendiente',
    })
    await repo.create({
      toolId: 'tool-2',
      borrowerId: 'user-2',
      ownerId: 'user-4',
      startDate: '2026-10-10',
      endDate: '2026-10-15',
      status: 'pendiente',
    })

    const toolLoans = await repo.findAllByTool('tool-1')
    expect(toolLoans).toHaveLength(2)
    expect(toolLoans.every((l) => l.tool_id === 'tool-1')).toBe(true)
  })

  it('finds loans by borrower id', async () => {
    await repo.create({
      toolId: 'tool-1',
      borrowerId: 'user-2',
      ownerId: 'user-1',
      startDate: '2026-10-10',
      endDate: '2026-10-20',
      status: 'pendiente',
    })
    await repo.create({
      toolId: 'tool-2',
      borrowerId: 'user-2',
      ownerId: 'user-4',
      startDate: '2026-10-10',
      endDate: '2026-10-15',
      status: 'pendiente',
    })

    const borrowerLoans = await repo.findAllByBorrower('user-2')
    expect(borrowerLoans).toHaveLength(2)
    expect(borrowerLoans.every((l) => l.borrower_id === 'user-2')).toBe(true)
  })

  it('finds loans by owner id', async () => {
    await repo.create({
      toolId: 'tool-1',
      borrowerId: 'user-2',
      ownerId: 'user-1',
      startDate: '2026-10-10',
      endDate: '2026-10-20',
      status: 'pendiente',
    })
    await repo.create({
      toolId: 'tool-2',
      borrowerId: 'user-3',
      ownerId: 'user-1',
      startDate: '2026-10-10',
      endDate: '2026-10-15',
      status: 'pendiente',
    })

    const ownerLoans = await repo.findAllByOwner('user-1')
    expect(ownerLoans).toHaveLength(2)
    expect(ownerLoans.every((l) => l.owner_id === 'user-1')).toBe(true)
  })

  it('updates loan status', async () => {
    const created = await repo.create({
      toolId: 'tool-1',
      borrowerId: 'user-2',
      ownerId: 'user-1',
      startDate: '2026-10-10',
      endDate: '2026-10-20',
      status: 'pendiente',
    })

    await repo.updateStatus(created.id, 'aceptado')

    const updated = await repo.findById(created.id)
    expect(updated!.status).toBe('aceptado')
  })

  it('returns null on update for non-existent loan', async () => {
    const result = await repo.updateStatus('non-existent', 'aceptado')
    expect(result).toBeNull()
  })

  it('hasActiveLoans returns true when tool has active loans', async () => {
    await repo.create({
      toolId: 'tool-1',
      borrowerId: 'user-2',
      ownerId: 'user-1',
      startDate: '2026-10-10',
      endDate: '2026-10-20',
      status: 'pendiente',
    })

    const hasActive = await repo.hasActiveLoans('tool-1')
    expect(hasActive).toBe(true)
  })

  it('hasActiveLoans returns false when tool has no active loans', async () => {
    const hasActive = await repo.hasActiveLoans('tool-1')
    expect(hasActive).toBe(false)
  })

  it('hasActiveLoans excludes terminated loans', async () => {
    await repo.create({
      toolId: 'tool-1',
      borrowerId: 'user-2',
      ownerId: 'user-1',
      startDate: '2026-10-10',
      endDate: '2026-10-20',
      status: 'devuelto',
    })

    const hasActive = await repo.hasActiveLoans('tool-1')
    expect(hasActive).toBe(false)
  })

  it('hasOverlappingDates returns true for overlapping dates', async () => {
    await repo.create({
      toolId: 'tool-1',
      borrowerId: 'user-2',
      ownerId: 'user-1',
      startDate: '2026-10-10',
      endDate: '2026-10-20',
      status: 'pendiente',
    })

    const hasOverlap = await repo.hasOverlappingDates(
      'tool-1',
      '2026-10-15',
      '2026-10-25',
    )
    expect(hasOverlap).toBe(true)
  })

  it('hasOverlappingDates returns false for non-overlapping dates', async () => {
    await repo.create({
      toolId: 'tool-1',
      borrowerId: 'user-2',
      ownerId: 'user-1',
      startDate: '2026-10-10',
      endDate: '2026-10-20',
      status: 'pendiente',
    })

    const hasOverlap = await repo.hasOverlappingDates(
      'tool-1',
      '2026-10-25',
      '2026-11-01',
    )
    expect(hasOverlap).toBe(false)
  })

  it('hasOverlappingDates returns false when only terminated loans exist', async () => {
    await repo.create({
      toolId: 'tool-1',
      borrowerId: 'user-2',
      ownerId: 'user-1',
      startDate: '2026-10-10',
      endDate: '2026-10-20',
      status: 'devuelto',
    })

    const hasOverlap = await repo.hasOverlappingDates(
      'tool-1',
      '2026-10-15',
      '2026-10-25',
    )
    expect(hasOverlap).toBe(false)
  })
})
