import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// AC-5b, static half (plan error-codes §3.2): outside src/modules/errors, no file of server/src
// writes an error body by hand. Every error answer goes through sendErrorCode / AppError, so its
// code is always one of the catalog. Throwing `new AppError('CODE', …)` or calling
// `sendErrorCode(res, 'CODE', …)` is allowed: the ServerErrorCode type already rejects a code
// outside the catalog.

const SRC = path.resolve(__dirname, '../src')
const ERRORS_DIR = path.join(SRC, 'modules', 'errors')

// What a hand-written error body looks like, even across several lines:
//   res.status(403).json({ error: { code: 'X', message: '…' } })
//   res.status(403).json({
//     error: {
//       code: 'X',
// Stricter than "inside .json(": any object key `error` holding an object counts, so a body sent
// with .send(), built in a variable first, or with another key before it is caught too.
// Keys in quotes ("error":, 'code':) count as well.
const HAND_WRITTEN = [
  { name: 'an `error: {` object key', pattern: /(?:\b|['"])error['"]?\s*:\s*\{/ },
  { name: 'a `code:` key with a literal', pattern: /(?:\b|['"])code['"]?\s*:\s*['"`]/ },
]

// Comments are removed first, so an example in a comment never counts. Only block comments and
// whole-line `//` comments are removed: cutting at any `//` could eat real code after a `//`
// inside a string (e.g. 'a//b'). An error body in a trailing comment is flagged: a false alarm,
// never a miss.
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function handWrittenErrors(source: string): string[] {
  const code = withoutComments(source)
  return HAND_WRITTEN.filter(({ pattern }) => pattern.test(code)).map(({ name }) => name)
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return full === ERRORS_DIR ? [] : sourceFiles(full)
    // Any JS or TS source, should the server ever add .mts, .js or .tsx files
    return /\.(?:m|c)?[jt]sx?$/.test(entry.name) ? [full] : []
  })
}

describe('the guard recognises a hand-written error body', () => {
  // origin.ts as it was before this change: the body spread over several lines
  const OLD_ORIGIN = `
    if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
      res.status(403).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid origin',
        },
      })
      return
    }`

  // rateLimit.ts as it was before this change
  const OLD_RATE_LIMIT = `
    if (entry.count > maxRequests) {
      res.status(429).json({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests. Please try again later.',
        },
      })
      return
    }`

  it.each([
    ['the old origin check', OLD_ORIGIN],
    ['the old rate limiter', OLD_RATE_LIMIT],
    ['a one-line body', `res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tool not found' } })`],
    ['a code key alone', `const body = { code: "TOOL_PAUSED" }`],
    ['a body sent with .send()', `res.status(400).send({ error: { message: 'Bad' } })`],
    ['a body built before .json()', `const body = { error: { message: m } }\nres.status(400).json(body)`],
    ['another key before error', `res.status(400).json({ status: 400, error: { message: m } })`],
    ['quoted keys', `res.status(400).json({ "error": { "message": m } })`],
    ['a quoted code key', `const body = { 'code': 'TOOL_PAUSED' }`],
    ['code after a // inside a string', `const p = 'a//b'; res.json({ error: { message: p } })`],
  ])('flags %s', (_case, source) => {
    expect(handWrittenErrors(source)).not.toEqual([])
  })

  it.each([
    ['sendErrorCode', `sendErrorCode(res, 'ORIGIN_NOT_ALLOWED', 'Invalid origin')`],
    ['a thrown AppError', `throw new AppError('TOOL_NOT_FOUND', 'Tool not found')`],
    ['a success body', `res.status(200).json({ id: user.id, name: user.name })`],
    ['an example in a comment', `// res.status(403).json({ error: { code: 'X' } })\nnext()`],
    ['a URL in a string', `const url = 'https://example.com/a'`],
  ])('accepts %s', (_case, source) => {
    expect(handWrittenErrors(source)).toEqual([])
  })
})

describe('server/src outside errors/ writes no error body by hand', () => {
  const files = sourceFiles(SRC)

  it('finds the source files to check', () => {
    expect(files.length).toBeGreaterThan(10)
    expect(files.some((f) => f.startsWith(ERRORS_DIR))).toBe(false)
  })

  it.each(files.map((f) => [path.relative(SRC, f), f]))('%s', (_name, file) => {
    expect(handWrittenErrors(readFileSync(file, 'utf-8'))).toEqual([])
  })
})
