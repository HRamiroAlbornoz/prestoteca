// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// AC-10 (plan error-codes, T015), static guard of the client: outside tests, no file of client/src
// reads the server's error message or carries an English error text. Every error the person sees
// comes from messageFor(code) — the Spanish table of the spec — whatever the server wrote.
// Same structure as the server's guard (server/tests/errorGuard.test.ts).

const SRC = fileURLToPath(new URL('..', import.meta.url))
const TESTS_DIR = path.join(SRC, 'tests')

const RULES = [
  // R1: reads the message of an error, from a response or from a catch. Three shapes:
  //   data.error?.message, body.error.message, err.message, e.message
  //   error?.['message'], err['message']
  //   (err as Error).message
  // Only those names count: utils/toolForm.ts reads zod's `issues[0]?.message`, a Spanish text
  // written in this repo, and that must stay allowed.
  {
    name: 'R1',
    patterns: [
      /\b(?:error|err|e)\??\.message\b/,
      /\b(?:error|err|e)(?:\?\.)?\[\s*['"]message['"]\s*\]/,
      /\bas Error\)\??\.message\b/,
    ],
  },
  // R2: the English fallbacks the screens had before this change (any case), plus the usual
  // English phrases a new fallback would start with. Those extra phrases are matched with their
  // capital letter only: a trailing comment such as "the list could not be loaded"
  // (errors/messages.ts) is English prose for developers, not a text on screen.
  {
    name: 'R2',
    patterns: [
      /Network error|Login failed|Registration failed|Tool not found|Failed to/i,
      /Could not|Unable to|Please try again|Something went wrong/,
    ],
  },
]

// Comments are removed first, so an example in a comment never counts. Only block comments and
// whole-line `//` comments are removed: cutting at any `//` could eat real code after a `//`
// inside a string (e.g. 'a//b'). A rule broken in a trailing comment is flagged: a false alarm,
// never a miss.
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function brokenRules(source: string): string[] {
  const code = withoutComments(source)
  // A rule is broken when any of its patterns matches
  return RULES.filter(({ patterns }) => patterns.some((pattern) => pattern.test(code))).map(({ name }) => name)
}

// Every JS or TS source file under client/src, except test files and the tests/ setup folder.
// errors/ is NOT skipped: messages.ts and apiError.ts must pass the guard like any screen.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return full === TESTS_DIR ? [] : sourceFiles(full)
    if (/\.test\.[cm]?[jt]sx?$/.test(entry.name)) return []
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [full] : []
  })
}

// Path relative to client/src with forward slashes, so the failure reads the same on any OS
function relative(file: string): string {
  return path.relative(SRC, file).split(path.sep).join('/')
}

describe('the guard recognises a server message or an English error text', () => {
  // The two lines of LoginPage.tsx before this change (commit 384d065^)
  it('G1 the old login fallback breaks R1 and R2', () => {
    expect(brokenRules("setError(data.error?.message || 'Login failed')")).toEqual(['R1', 'R2'])
  })

  it('G2 the old network fallback breaks R2 only', () => {
    expect(brokenRules("setError('Network error. Please try again.')")).toEqual(['R2'])
  })

  it.each([
    ['setError(body.error.message)'],
    ['const m = error.message'],
    ['setError(err.message)'],
    ['} catch (e) { setError(e.message) }'],
    ["setError(data.error?.['message'])"],
    ['setError((err as Error).message)'],
  ])('G3 %s breaks R1', (source) => {
    expect(brokenRules(source)).toEqual(['R1'])
  })

  it.each([
    ["'Registration failed'"],
    ["'Tool not found'"],
    ["'Failed to load tools'"],
    ["'failed to load'"],
    ["'Could not load the loans'"],
    ["'Unable to save'"],
    ["'Please try again later'"],
    ["'Something went wrong'"],
  ])(
    'G4 %s breaks R2',
    (source) => {
      expect(brokenRules(source)).toEqual(['R2'])
    },
  )

  it.each([
    ["setError(handle(await readApiError(res)) ?? '')"],
    ["messageFor('NETWORK_ERROR')"],
    ['error.code'],
    ['errorMessage'],
    // zod's own validation message (utils/toolForm.ts), Spanish and written in this repo
    ['return result.success ? undefined : result.error.issues[0]?.message'],
    // English prose in a trailing comment, as in errors/messages.ts
    ["'TOOLS_LOAD_FAILED', // row 34: the tool list could not be loaded"],
  ])("G5 today's style %s breaks nothing", (source) => {
    expect(brokenRules(source)).toEqual([])
  })

  it.each([
    ['// setError(data.error?.message)'],
    ['/* setError(data.error?.message) */'],
    ["/*\n * setError('Login failed')\n */"],
  ])('G6 an example in a comment breaks nothing: %s', (source) => {
    expect(brokenRules(source)).toEqual([])
  })
})

describe('every source file of client/src (errors/ included) has no R1 or R2', () => {
  const files = sourceFiles(SRC)
  const names = files.map(relative)

  it('G7 no file reads the server message or carries an English error text', () => {
    const offenders = files
      .map((file) => ({ file: relative(file), rules: brokenRules(readFileSync(file, 'utf-8')) }))
      .filter(({ rules }) => rules.length > 0)
    expect(offenders).toEqual([])
  })

  // A walker pointed at the wrong folder would find nothing and let G7 pass with zero files
  it('G8 the walker finds the screens and the errors module, and no test file', () => {
    expect(files.length).toBeGreaterThan(10)
    expect(names).toContain('pages/LoginPage.tsx')
    expect(names).toContain('errors/messages.ts')
    expect(names.filter((name) => name.includes('.test.'))).toEqual([])
    expect(names.filter((name) => name.startsWith('tests/'))).toEqual([])
  })
})
