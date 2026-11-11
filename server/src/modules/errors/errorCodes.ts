// The error catalog: every code the API can answer with, and the one HTTP status of each.
//
// Rules (plan error-codes §3.1, decision D7):
// - One code, one status. Code that answers an error never passes the status by hand:
//   `AppError` and `sendErrorCode` read it from here.
// - This file imports nothing. The client reads its types (`import type`) to make sure
//   every code has a message in Spanish, so it must not pull in any server code.
// - The comment on each code says when it is sent ("row N" = row of the message table in
//   the spec, `02-DOCS/wiki/sdd/specs/error-codes.md`).
export const ERROR_CODES = {
  // --- Register ---
  REGISTER_MISSING_FIELDS: { status: 400 }, // row 1: name, email or password missing
  REGISTER_NAME_LENGTH: { status: 400 }, // row 2: name not between 2 and 50 characters
  REGISTER_PASSWORD_LENGTH: { status: 400 }, // row 3: password not between 8 and 72 characters
  REGISTER_EMAIL_TOO_LONG: { status: 400 }, // row 4: email longer than 254 characters
  EMAIL_TAKEN: { status: 409 }, // row 5: an account with that email already exists

  // --- Login and session ---
  LOGIN_MISSING_FIELDS: { status: 400 }, // row 6: email or password missing
  INVALID_CREDENTIALS: { status: 401 }, // row 7: wrong email or password
  SESSION_REQUIRED: { status: 401 }, // row 8: no session, expired or invalid token

  // --- Account: change password, delete account ---
  PASSWORD_CHANGE_MISSING_FIELDS: { status: 400 }, // row 11: current or new password missing
  CURRENT_PASSWORD_INCORRECT: { status: 401 }, // row 12: current password does not match
  NEW_PASSWORD_LENGTH: { status: 400 }, // row 13: new password not between 8 and 72 characters
  NEW_PASSWORD_BLANK: { status: 400 }, // row 14: new password is only spaces
  ACCOUNT_NOT_FOUND: { status: 404 }, // row 15: the account was deleted while its session was open
  ACCOUNT_HAS_ACTIVE_LOANS: { status: 409 }, // row 16: cannot delete an account with loans in progress

  // --- Tools ---
  TOOL_MISSING_FIELDS: { status: 400 }, // row 17: a required field is missing when publishing
  TOOL_NAME_LENGTH: { status: 400 }, // row 18: name not between 3 and 60 characters
  TOOL_DESCRIPTION_TOO_LONG: { status: 400 }, // row 19: description longer than 500 characters
  TOOL_NOT_FOUND: { status: 404 }, // row 20: the tool does not exist (or was deleted)
  TOOL_NOT_OWNER: { status: 403 }, // row 21: editing, pausing or deleting someone else's tool
  TOOL_HAS_ACTIVE_LOANS: { status: 409 }, // row 22: cannot delete a tool with loans in progress
  TOOL_PAUSED: { status: 409 }, // row 23: the tool is paused and takes no requests

  // --- Loans ---
  LOAN_DATES_MISSING: { status: 400 }, // row 24: start or end date missing
  LOAN_START_IN_PAST: { status: 400 }, // row 25: start date is before today
  LOAN_END_BEFORE_START: { status: 400 }, // row 26: end date is before the start date
  LOAN_NOTE_TOO_LONG: { status: 400 }, // row 27: note longer than 300 characters
  LOAN_OWN_TOOL: { status: 400 }, // row 28: asking to borrow your own tool
  LOAN_DATES_OVERLAP: { status: 409 }, // row 29: the dates overlap another loan of the tool
  LOAN_TRANSITION_INVALID: { status: 409 }, // row 30: that status change does not exist from the current status
  LOAN_TRANSITION_WRONG_ROLE: { status: 403 }, // row 31: the change belongs to the other person of the loan
  LOAN_NOT_FOUND: { status: 404 }, // row 32: the loan does not exist (or is not yours: same answer)

  // --- Search and limits ---
  SEARCH_QUERY_TOO_LONG: { status: 400 }, // row 33: search text longer than 60 characters
  RATE_LIMITED: { status: 429 }, // row 35: too many requests (5/min on /api/auth, 30/min elsewhere)

  // --- Only a bug or a broken client gets these (the client shows the generic row 37) ---
  BAD_REQUEST: { status: 400 }, // malformed body, invalid page, unknown category or status, bad type filter
  PAYLOAD_TOO_LARGE: { status: 413 }, // request body over 10 kb
  ORIGIN_NOT_ALLOWED: { status: 403 }, // request from an origin the API does not accept
  TOOL_EDIT_EMPTY: { status: 404 }, // editing your own tool without sending any field
  API_ROUTE_NOT_FOUND: { status: 404 }, // an /api/... route that does not exist
  INTERNAL_ERROR: { status: 500 }, // anything unexpected: the detail goes to the server log only

  // --- Generic codes still sent while the routes move to the specific ones ---
  // Used by the old subclasses in AppError.ts. Removed in task T009, when nothing sends them.
  UNAUTHORIZED: { status: 401 },
  FORBIDDEN: { status: 403 },
  NOT_FOUND: { status: 404 },
  CONFLICT: { status: 409 },
} as const satisfies Record<string, { status: number }>

export type ServerErrorCode = keyof typeof ERROR_CODES
