// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ERROR_CODES } from '../../../server/src/modules/errors/errorCodes'
import { CLIENT_ONLY_CODES, MESSAGES, messageFor, type ClientErrorCode } from './messages'

const CLIENT_ONLY: readonly ClientErrorCode[] = CLIENT_ONLY_CODES

// AC-5: every code the server can send has a message. The type already forces it at build
// time; this checks it at run time, against the real catalog (imported by value only here).
describe('AC-5: the message map covers the whole catalog', () => {
  it.each(Object.keys(ERROR_CODES))('has a message for %s', (code) => {
    const text = MESSAGES[code as ClientErrorCode]

    expect(typeof text).toBe('string')
    expect(text.trim()).not.toBe('')
  })

  it.each(CLIENT_ONLY)('has a message for the client-only code %s', (code) => {
    expect(MESSAGES[code].trim()).not.toBe('')
  })

  it('has no message for a code the server no longer sends', () => {
    const known = new Set([...Object.keys(ERROR_CODES), ...CLIENT_ONLY])
    const stale = Object.keys(MESSAGES).filter((code) => !known.has(code))

    expect(stale).toEqual([])
  })
})

// AC-14: the texts are exactly the ones in the spec's message table ("What result they get").
// The spec is the oracle: this test reads the real file, so editing the table without the map
// (or the map without the table) fails here and says which row differs.
const ROW_TO_CODE: Record<number, ClientErrorCode> = {
  1: 'REGISTER_MISSING_FIELDS',
  2: 'REGISTER_NAME_LENGTH',
  3: 'REGISTER_PASSWORD_LENGTH',
  4: 'REGISTER_EMAIL_TOO_LONG',
  5: 'EMAIL_TAKEN',
  6: 'LOGIN_MISSING_FIELDS',
  7: 'INVALID_CREDENTIALS',
  8: 'SESSION_REQUIRED',
  // row 9 was merged into row 8 (spec Revisions, 2026-11-03)
  10: 'LOGOUT_FAILED',
  11: 'PASSWORD_CHANGE_MISSING_FIELDS',
  12: 'CURRENT_PASSWORD_INCORRECT',
  13: 'NEW_PASSWORD_LENGTH',
  14: 'NEW_PASSWORD_BLANK',
  15: 'ACCOUNT_NOT_FOUND',
  16: 'ACCOUNT_HAS_ACTIVE_LOANS',
  17: 'TOOL_MISSING_FIELDS',
  18: 'TOOL_NAME_LENGTH',
  19: 'TOOL_DESCRIPTION_TOO_LONG',
  20: 'TOOL_NOT_FOUND',
  21: 'TOOL_NOT_OWNER',
  22: 'TOOL_HAS_ACTIVE_LOANS',
  23: 'TOOL_PAUSED',
  24: 'LOAN_DATES_MISSING',
  25: 'LOAN_START_IN_PAST',
  26: 'LOAN_END_BEFORE_START',
  27: 'LOAN_NOTE_TOO_LONG',
  28: 'LOAN_OWN_TOOL',
  29: 'LOAN_DATES_OVERLAP',
  30: 'LOAN_TRANSITION_INVALID',
  31: 'LOAN_TRANSITION_WRONG_ROLE',
  32: 'LOAN_NOT_FOUND',
  33: 'SEARCH_QUERY_TOO_LONG',
  34: 'TOOLS_LOAD_FAILED',
  35: 'RATE_LIMITED',
  36: 'NETWORK_ERROR',
  37: 'UNKNOWN_ERROR',
}

// Codes that show the generic row 37: only a bug or a broken client produces them
const ROW_37_CODES: ClientErrorCode[] = [
  'BAD_REQUEST',
  'PAYLOAD_TOO_LARGE',
  'ORIGIN_NOT_ALLOWED',
  'TOOL_EDIT_EMPTY',
  'API_ROUTE_NOT_FOUND',
  'INTERNAL_ERROR',
]

// Rows of the table look like "| 12 | Situación | Mensaje |". Section rows ("| **Registro** |||")
// have no number and are skipped. CRLF-safe: the file may have Windows line endings.
function specRows(): Map<number, string> {
  const specPath = fileURLToPath(new URL('../../../02-DOCS/wiki/sdd/specs/error-codes.md', import.meta.url))
  const rows = new Map<number, string>()
  for (const line of readFileSync(specPath, 'utf-8').split(/\r?\n/)) {
    const match = /^\|\s*(\d+)\s*\|[^|]*\|\s*(.+?)\s*\|\s*$/.exec(line)
    if (!match) continue
    // Row 8 carries a note in italics for the reader, "*(y la app lleva al login)*", which is not part of the text
    const text = match[2].replace(/\s*\*\([^)]*\)\*\s*$/, '').trim()
    rows.set(Number(match[1]), text)
  }
  return rows
}

describe('AC-14: every message is the text of its row in the spec', () => {
  const rows = specRows()

  it('finds the 37 rows of the table', () => {
    expect([...rows.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i + 1))
  })

  // The row and the code go into the compared object, so a failure says which row differs
  it.each(Object.entries(ROW_TO_CODE))('row %s → %s', (row, code) => {
    expect({ row, code, text: MESSAGES[code] }).toEqual({ row, code, text: rows.get(Number(row)) })
  })

  it.each(ROW_37_CODES)('%s shows the generic text of row 37', (code) => {
    expect(MESSAGES[code]).toBe(rows.get(37))
  })

  it('maps every catalog code either to its own row or to row 37', () => {
    const mapped = new Set<string>([...Object.values(ROW_TO_CODE), ...ROW_37_CODES])
    // The generic codes still in the catalog until task T009 removes them also show row 37
    const pending = Object.keys(ERROR_CODES).filter((code) => !mapped.has(code))

    for (const code of pending) {
      expect({ code, text: MESSAGES[code as ClientErrorCode] }).toEqual({ code, text: rows.get(37) })
    }
  })
})

describe('messageFor', () => {
  it('returns the text of the code', () => {
    expect(messageFor('TOOL_PAUSED')).toBe(MESSAGES.TOOL_PAUSED)
  })

  // AC-9c: the rate-limit message tells the person to wait a minute
  it('tells the person to wait a minute when there were too many requests', () => {
    expect(messageFor('RATE_LIMITED')).toMatch(/Esperá un minuto/)
  })
})
