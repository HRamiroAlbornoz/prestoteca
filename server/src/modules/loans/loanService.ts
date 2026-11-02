import type { LoanRepository } from './loanRepo.js'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors/AppError.js'
import { todayInAppTimeZone } from './appDate.js'

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

type Role = 'owner' | 'borrower'

// Every status change a person can make, and who may make it (MVP spec lines 64-66, 81, 137-142).
// A change missing from this table is invalid for everyone. 'vencido' is set by the system only.
const TRANSITIONS: Record<string, Record<string, Role[]>> = {
  pendiente: { aceptado: ['owner'], rechazado: ['owner'], cancelado: ['owner', 'borrower'] },
  aceptado: { entregado: ['owner'], cancelado: ['owner', 'borrower'] },
  entregado: { devuelto: ['owner'] },
}

export class LoanService {
  constructor(
    private readonly repo: LoanRepository,
    private readonly query: QueryFn,
    // Tests pass a fixed "today"; the app uses the real date in the app time zone
    private readonly getToday: () => string = todayInAppTimeZone,
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

    // Validate transition: first whether the change exists at all, then whether this person may make it
    const allowedRoles = TRANSITIONS[loan.status]?.[newStatus]
    if (!allowedRoles) {
      throw new ConflictError(
        `Transición inválida: de "${loan.status}" a "${newStatus}"`,
      )
    }

    // A participant already knows the loan exists, so a 403 reveals nothing new (unlike a stranger, who gets 404)
    const role: Role = loan.owner_id === userId ? 'owner' : 'borrower'
    if (!allowedRoles.includes(role)) {
      throw new ForbiddenError(
        `Solo ${allowedRoles.includes('owner') ? 'el dueño' : 'quien pidió'} puede pasar el préstamo a "${newStatus}"`,
      )
    }

    const updated = await this.repo.updateStatus(loanId, newStatus)
    if (!updated) throw new NotFoundError(LOAN_NOT_FOUND)
    return updated
  }

  async autoVencido(): Promise<number> {
    // "Today" in America/Argentina/Tucuman, not the server's UTC date
    const todayStr = this.getToday()

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
    // We use a direct query since the repo doesn't have findAllByStatus.
    // to_char: node-postgres would turn a raw DATE into a JS Date, and comparing a Date with the
    // 'YYYY-MM-DD' text of "today" is always false. As text, both sides compare day by day.
    const result = await this.query(
      `SELECT id, to_char(end_date, 'YYYY-MM-DD') AS end_date FROM loans WHERE status = $1`,
      ['entregado'],
    )
    return result.rows as Array<{ id: string; end_date: string }>
  }
}
