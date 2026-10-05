import type { Request, Response, NextFunction } from 'express'

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory store: IP → { count, resetTime }
const store = new Map<string, RateLimitEntry>()

const WINDOW_MS = 60 * 1000 // 1 minute
const MAX_REQUESTS = 5

function getIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown'
}

function cleanup(): void {
  const now = Date.now()
  for (const [ip, entry] of store.entries()) {
    if (entry.resetTime < now) {
      store.delete(ip)
    }
  }
}

// Clean up every 30 seconds
setInterval(cleanup, 30 * 1000)

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = getIp(req)
  const now = Date.now()

  let entry = store.get(ip)

  if (!entry || now > entry.resetTime) {
    // New window
    entry = { count: 1, resetTime: now + WINDOW_MS }
    store.set(ip, entry)
    next()
    return
  }

  entry.count++

  if (entry.count > MAX_REQUESTS) {
    res.status(429).json({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests. Please try again later.',
      },
    })
    return
  }

  next()
}
