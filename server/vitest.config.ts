import { defineConfig } from 'vitest/config'
import path from 'path'

// Guard: refuse to run tests if DATABASE_URL does not contain "test"
const dbUrl = process.env.DATABASE_URL || ''
if (dbUrl && !dbUrl.includes('test') && process.env.NODE_ENV !== 'production') {
  console.error(
    '\x1b[31m%s\x1b[0m',
    'ERROR: DATABASE_URL does not contain "test". Refusing to run tests against a non-test database.',
  )
  console.error('Set TEST_DATABASE_URL or ensure DATABASE_URL includes "test" in the database name.')
  console.error('Example: postgresql://user:pass@host:5432/prestoteca_test')
  process.exit(1)
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
