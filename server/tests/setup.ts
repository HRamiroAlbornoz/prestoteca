import { beforeEach, vi } from 'vitest'
import { resetRateLimiter } from '../src/modules/middleware/rateLimit.js'

// Reset rate limiter between tests to avoid cross-test pollution
beforeEach(() => {
  resetRateLimiter()
})
