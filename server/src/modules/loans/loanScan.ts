import { LoanRepository } from './loanRepo.js'
import { LoanService } from './loanService.js'

type QueryFn = (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>

let scanInterval: ReturnType<typeof setInterval> | null = null

export function createLoanScan(poolQuery: QueryFn, intervalMs: number = 3600000): { stop: () => void; service: LoanService } {
  const repo = new LoanRepository(poolQuery)
  const service = new LoanService(repo, poolQuery)

  const scan = async () => {
    try {
      const count = await service.autoVencido()
      if (count > 0) {
        console.log(`[loan-scan] Marked ${count} loan(s) as vencido`)
      }
    } catch (err) {
      console.error('[loan-scan] Error during scan:', err)
    }
  }

  // Run immediately on start
  scan()

  // Then run at interval
  scanInterval = setInterval(scan, intervalMs)

  return {
    stop: () => {
      if (scanInterval) {
        clearInterval(scanInterval)
        scanInterval = null
      }
    },
    service,
  }
}

export function stopLoanScan() {
  if (scanInterval) {
    clearInterval(scanInterval)
    scanInterval = null
  }
}
