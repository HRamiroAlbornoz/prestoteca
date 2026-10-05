import express from 'express'
import helmet from 'helmet'
import { loadEnv } from './modules/config/env.js'

export type ExpressApplication = ReturnType<typeof express>

export function createApp(): ExpressApplication {
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

  // Health endpoint (no auth required)
  app.get('/api/health', (_req: express.Request, res: express.Response) => {
    res.json({ status: 'ok', env: env.NODE_ENV })
  })

  return app
}

// Start server when run directly
if (process.argv[1]?.includes('index.ts') || process.argv[1]?.includes('index.js')) {
  const env = loadEnv()
  const app = createApp()
  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT} (${env.NODE_ENV})`)
  })
}
