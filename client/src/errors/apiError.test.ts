import { fetchFailureCode, readApiError } from './apiError'

// A response built by hand, like the ones fetch returns
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('readApiError', () => {
  it('returns the code of a catalog error body', async () => {
    const res = jsonResponse(409, { error: { code: 'TOOL_PAUSED', message: 'La herramienta está pausada' } })

    expect(await readApiError(res)).toBe('TOOL_PAUSED')
  })

  it('returns the code whatever the status (the code decides, never the status)', async () => {
    const res = jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } })

    expect(await readApiError(res)).toBe('INVALID_CREDENTIALS')
  })

  // AC-2: a code the client does not know
  it('returns UNKNOWN_ERROR for a code outside the catalog', async () => {
    const res = jsonResponse(400, { error: { code: 'SOMETHING_NEW', message: 'whatever' } })

    expect(await readApiError(res)).toBe('UNKNOWN_ERROR')
  })

  it('returns UNKNOWN_ERROR when the server sends a client-only code', async () => {
    const res = jsonResponse(500, { error: { code: 'NETWORK_ERROR', message: 'not a server code' } })

    expect(await readApiError(res)).toBe('UNKNOWN_ERROR')
  })

  // AC-3: a body without the expected shape
  it.each([
    ['an HTML page', new Response('<html><body>Bad Gateway</body></html>', { status: 502, headers: { 'Content-Type': 'text/html' } })],
    ['an empty body', new Response(null, { status: 500 })],
    ['JSON without error', jsonResponse(500, { message: 'oops' })],
    ['an error without code', jsonResponse(500, { error: { message: 'oops' } })],
    ['a code that is not a string', jsonResponse(500, { error: { code: 42 } })],
    ['JSON null', jsonResponse(500, null)],
    ['a code inherited from Object', jsonResponse(500, { error: { code: 'toString' } })],
  ])('returns UNKNOWN_ERROR for %s', async (_case, res) => {
    expect(await readApiError(res)).toBe('UNKNOWN_ERROR')
  })

  it('never returns the server message', async () => {
    const res = jsonResponse(400, { error: { code: 'TOOL_NAME_LENGTH', message: 'The tool name must be between 3 and 60 characters' } })

    const code = await readApiError(res)

    expect(code).toBe('TOOL_NAME_LENGTH')
    expect(code).not.toContain('characters')
  })
})

describe('fetchFailureCode', () => {
  // AC-4: fetch rejects with a TypeError when there is no connection
  it('returns NETWORK_ERROR when fetch fails', () => {
    expect(fetchFailureCode(new TypeError('Failed to fetch'))).toBe('NETWORK_ERROR')
  })

  it('returns NETWORK_ERROR for anything else that is not an abort', () => {
    expect(fetchFailureCode('weird')).toBe('NETWORK_ERROR')
  })

  // The screen went away and cancelled its request: nothing to show
  it('returns null for an aborted request', () => {
    expect(fetchFailureCode(new DOMException('The operation was aborted.', 'AbortError'))).toBeNull()
  })
})
