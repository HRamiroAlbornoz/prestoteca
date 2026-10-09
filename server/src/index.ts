import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import { loadEnv } from './modules/config/env.js'
import { checkDbConnection } from './modules/db/pool.js'
import { rateLimiter } from './modules/middleware/rateLimit.js'
import { wireRoutes } from './routes.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export type ExpressApplication = ReturnType<typeof express>

export async function createApp(): Promise<ExpressApplication> {
  const env = loadEnv()

  const app = express()

  // Security headers
  app.disable('x-powered-by')
  app.use(helmet())

  // Trust proxy (for Railway, etc.)
  app.set('trust proxy', env.TRUST_PROXY ? 1 : false)

  // Body parsing with size limit (10kb per constitution)
  app.use(express.json({ limit: '10kb' }))
  app.use(express.urlencoded({ extended: true, limit: '10kb' }))

  // Cookie parsing (for JWT token in cookies)
  app.use(cookieParser())

  // Rate limiting (5 requests per minute per IP)
  app.use(rateLimiter)

  // Health endpoint (no auth required)
  app.get('/api/health', async (_req: express.Request, res: express.Response) => {
    const db = await checkDbConnection()
    res.json({ status: 'ok', db })
  })

  // Wire all API routes
  wireRoutes(app)

  // Serve frontend static files (built by Vite)
  const clientDist = join(__dirname, '..', 'client-dist')
  app.use(express.static(clientDist))

  // SPA fallback: serve index.html for non-API routes
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.path.startsWith('/api')) {
      return res.sendFile(join(clientDist, 'index.html'))
    }
    next()
  })

  return app
}

// Start server when run directly
if (process.argv[1]?.includes('index.ts') || process.argv[1]?.includes('index.js')) {
  ;(async () => {
    const env = loadEnv()
    const app = await createApp()
    app.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT} (${env.NODE_ENV})`)
    })
  })()
}
