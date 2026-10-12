import { getPool } from './modules/db/pool.js'
import { authRoutes } from './modules/auth/authRoutes.js'
import { toolsRoutes } from './modules/tools/toolsRoutes.js'
import { loansRoutes } from './modules/loans/loansRoutes.js'
import { meRoutes } from './modules/me/meRoutes.js'
import { meAccountRoutes } from './modules/me/meAccountRoutes.js'
import { ToolRepository } from './modules/tools/toolRepo.js'
import { ToolService } from './modules/tools/toolService.js'
import { SearchService } from './modules/search/searchService.js'
import { LoanRepository } from './modules/loans/loanRepo.js'
import { LoanService } from './modules/loans/loanService.js'
import { UserRepository } from './modules/auth/userRepo.js'
import type { ExpressApplication } from './index.js'
import { loadEnv } from './modules/config/env.js'
import { authMiddleware } from './modules/middleware/auth.js'
import { originChecker } from './modules/middleware/origin.js'
import { generalRateLimiter } from './modules/middleware/rateLimit.js'

export function wireRoutes(app: ExpressApplication): void {
  const env = loadEnv()
  const pool = getPool()

  // Repositories
  const userRepo = new UserRepository(pool)
  const toolRepo = new ToolRepository(pool)
  const loanRepo = new LoanRepository(pool.query.bind(pool))

  // Services
  const toolService = new ToolService(toolRepo)
  const searchService = new SearchService(toolRepo)
  const loanService = new LoanService(loanRepo, pool.query.bind(pool))

  // Auth routes (handles its own auth)
  app.use('/api/auth', authRoutes(userRepo, env.JWT_SECRET, env.CORS_ORIGIN))

  // Tools routes — GET / is public, rest needs auth + origin check + general rate limit
  app.use('/api/tools', generalRateLimiter)
  app.use('/api/tools', originChecker)
  app.use('/api/tools', (req, res, next) => {
    if (req.method === 'GET' && req.path === '/') return next()
    return authMiddleware(req as any, res, next)
  })
  app.use('/api/tools', toolsRoutes(toolService, searchService))

  // Loans, me, me/account — all need auth + origin check + general rate limit
  app.use('/api', generalRateLimiter)
  app.use('/api', originChecker)
  app.use('/api', authMiddleware)
  app.use('/api', loansRoutes(loanService, pool.query.bind(pool)))
  app.use('/api', meRoutes(toolRepo, loanRepo))
  app.use('/api', meAccountRoutes(userRepo, toolRepo, loanRepo))
}
