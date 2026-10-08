export interface CreateLoanInput {
  toolId: string
  borrowerId: string
  ownerId: string
  startDate: string
  endDate: string
  status: string
  note?: string | null
}

export interface Loan {
  id: string
  tool_id: string
  borrower_id: string
  owner_id: string
  start_date: string
  end_date: string
  status: string
  note: string | null
  created_at: string
  updated_at: string
}

type QueryFn = (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>

const ACTIVE_STATUSES = ['pendiente', 'aceptado', 'entregado', 'vencido']

export class LoanRepository {
  constructor(private readonly query: QueryFn) {}

  async create(input: CreateLoanInput): Promise<Loan> {
    const result = await this.query(
      `INSERT INTO loans (tool_id, borrower_id, owner_id, start_date, end_date, status, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [input.toolId, input.borrowerId, input.ownerId, input.startDate, input.endDate, input.status, input.note ?? null],
    )
    const row = (result.rows as Loan[])[0]
    if (!row) throw new Error('Failed to create loan')
    return row
  }

  async findById(id: string): Promise<Loan | null> {
    const result = await this.query(
      `SELECT * FROM loans WHERE id = $1`,
      [id],
    )
    const rows = result.rows as Loan[]
    return rows[0] ?? null
  }

  async findAllByTool(toolId: string): Promise<Loan[]> {
    const result = await this.query(
      `SELECT * FROM loans WHERE tool_id = $1`,
      [toolId],
    )
    return result.rows as Loan[]
  }

  async findAllByBorrower(borrowerId: string): Promise<Loan[]> {
    const result = await this.query(
      `SELECT * FROM loans WHERE borrower_id = $1`,
      [borrowerId],
    )
    return result.rows as Loan[]
  }

  async findAllByOwner(ownerId: string): Promise<Loan[]> {
    const result = await this.query(
      `SELECT * FROM loans WHERE owner_id = $1`,
      [ownerId],
    )
    return result.rows as Loan[]
  }

  async updateStatus(id: string, status: string): Promise<Loan | null> {
    const result = await this.query(
      `UPDATE loans SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, id],
    )
    const rows = result.rows as Loan[]
    return rows[0] ?? null
  }

  async hasActiveLoans(toolId: string): Promise<boolean> {
    const placeholders = ACTIVE_STATUSES.map((_, i) => `$${i + 2}`).join(', ')
    const result = await this.query(
      `SELECT 1 FROM loans WHERE tool_id = $1 AND status IN (${placeholders}) LIMIT 1`,
      [toolId, ...ACTIVE_STATUSES],
    )
    return (result.rowCount ?? 0) > 0
  }

  async hasOverlappingDates(
    toolId: string,
    startDate: string,
    endDate: string,
    excludeLoanId?: string,
  ): Promise<boolean> {
    // Overlap condition: start_date <= new_end_date AND end_date >= new_start_date
    let sql = `SELECT 1 FROM loans WHERE tool_id = $1 AND status IN (${ACTIVE_STATUSES.map((_, i) => `$${i + 3}`).join(', ')}) AND start_date <= $2 AND end_date >= $3`
    const values: unknown[] = [toolId, endDate, startDate, ...ACTIVE_STATUSES]

    if (excludeLoanId) {
      sql += ` AND id != $4`
      values.push(excludeLoanId)
    }

    sql += ` LIMIT 1`

    const result = await this.query(sql, values)
    return (result.rowCount ?? 0) > 0
  }

  async findTerminatedByUserId(userId: string): Promise<Loan[]> {
    const result = await this.query(
      `SELECT * FROM loans
       WHERE (borrower_id = $1 OR owner_id = $1)
         AND status IN ('devuelto', 'rechazado', 'cancelado')
       ORDER BY updated_at DESC`,
      [userId],
    )
    return result.rows as Loan[]
  }
}
