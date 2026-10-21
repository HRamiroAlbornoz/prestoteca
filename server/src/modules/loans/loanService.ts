import type { LoanRepository } from './loanRepo.js'
import { ConflictError, NotFoundError, ValidationError } from '../errors/AppError.js'

// Same answer for "does not exist" and "exists but you are not part of it":
// a 404 that differs by message would still reveal that the loan exists.
const LOAN_NOT_FOUND = 'Préstamo no encontrado'

type QueryFn = (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>

export interface CreateLoanInput {
  toolId: string
  userId: string
  ownerId: string
  startDate: string
  endDate: string
  note?: string | null
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  pendiente: ['aceptado', 'rechazado', 'cancelado'],
  aceptado: ['entregado', 'cancelado'],
  entregado: ['devuelto'],
}

export class LoanService {
  constructor(
    private readonly repo: LoanRepository,
    private readonly query: QueryFn,
  ) {}

  async create(input: CreateLoanInput): Promise<import('./loanRepo.js').Loan> {
    // Cannot borrow own tool
    if (input.userId === input.ownerId) {
      throw new ValidationError('No puedes pedir tu propia herramienta')
    }

    // Check for overlapping dates
    const hasOverlap = await this.repo.hasOverlappingDates(
      input.toolId,
      input.startDate,
      input.endDate,
    )
    if (hasOverlap) {
      throw new ConflictError(
        'La herramienta tiene un préstamo activo con fechas solapadas',
      )
    }

    return this.repo.create({
      toolId: input.toolId,
      borrowerId: input.userId,
      ownerId: input.ownerId,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'pendiente',
      note: input.note,
    })
  }

  async getDetail(loanId: string, userId: string): Promise<import('./loanRepo.js').Loan> {
    const loan = await this.repo.findById(loanId)
    if (!loan) {
      throw new NotFoundError(LOAN_NOT_FOUND)
    }

    // User must be participant (owner or borrower)
    if (loan.owner_id !== userId && loan.borrower_id !== userId) {
      throw new NotFoundError(LOAN_NOT_FOUND)
    }

    return loan
  }

  async transition(
    loanId: string,
    newStatus: string,
    userId: string,
  ): Promise<import('./loanRepo.js').Loan> {
    const loan = await this.repo.findById(loanId)
    if (!loan) {
      throw new NotFoundError(LOAN_NOT_FOUND)
    }

    // User must be participant (owner or borrower)
    if (loan.owner_id !== userId && loan.borrower_id !== userId) {
      throw new NotFoundError(LOAN_NOT_FOUND)
    }

    // Validate transition
    const allowed = VALID_TRANSITIONS[loan.status]
    if (!allowed || !allowed.includes(newStatus)) {
      throw new ConflictError(
        `Transición inválida: de "${loan.status}" a "${newStatus}"`,
      )
    }

    const updated = await this.repo.updateStatus(loanId, newStatus)
    if (!updated) throw new NotFoundError(LOAN_NOT_FOUND)
    return updated
  }

  async autoVencido(): Promise<number> {
    // Use local date in America/Argentina/Tucuman timezone
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const todayStr = `${year}-${month}-${day}`

    // Get all delivered loans
    const deliveredLoans = await this.findAllDeliveredLoans()

    let count = 0
    for (const loan of deliveredLoans) {
      if (loan.end_date < todayStr) {
        await this.repo.updateStatus(loan.id, 'vencido')
        count++
      }
    }

    return count
  }

  async findLoansByBorrower(borrowerId: string): Promise<import('./loanRepo.js').Loan[]> {
    return this.repo.findAllByBorrower(borrowerId)
  }

  async findLoansByOwner(ownerId: string): Promise<import('./loanRepo.js').Loan[]> {
    return this.repo.findAllByOwner(ownerId)
  }

  private async findAllDeliveredLoans(): Promise<Array<{ id: string; end_date: string }>> {
    // Query all loans with status 'entregado'
    // We use a direct query since the repo doesn't have findAllByStatus
    const result = await this.query(
      `SELECT id, end_date FROM loans WHERE status = $1`,
      ['entregado'],
    )
    return result.rows as Array<{ id: string; end_date: string }>
  }
}
