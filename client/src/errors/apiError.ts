import { CLIENT_ONLY_CODES, MESSAGES, type ClientErrorCode } from './messages'

// The codes the server can send, known at run time from the keys of the message map
// (the client never imports server values, decision D7). A client-only code coming from the
// server is treated as unknown.
const SERVER_CODES: ReadonlySet<string> = new Set(
  Object.keys(MESSAGES).filter((code) => !(CLIENT_ONLY_CODES as readonly string[]).includes(code)),
)

// Turns a failed response into a code. Reads only `error.code`: the server's `message` is for
// developers and never reaches the screen. Never throws: anything unexpected is UNKNOWN_ERROR.
export async function readApiError(res: Response): Promise<ClientErrorCode> {
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return 'UNKNOWN_ERROR' // empty body, HTML page, or anything that is not JSON
  }

  const code = (body as { error?: { code?: unknown } } | null)?.error?.code
  if (typeof code === 'string' && SERVER_CODES.has(code)) {
    return code as ClientErrorCode
  }
  return 'UNKNOWN_ERROR'
}

// Turns an exception thrown by fetch into a code. An aborted request means the screen went
// away (or replaced it with a newer one): there is nothing to show, so it gives null.
// An abort arrives as a DOMException, which is not always an `Error` (it depends on the runtime),
// so it is recognised by its name.
export function fetchFailureCode(err: unknown): ClientErrorCode | null {
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : undefined
  if (name === 'AbortError') {
    return null
  }
  return 'NETWORK_ERROR'
}
