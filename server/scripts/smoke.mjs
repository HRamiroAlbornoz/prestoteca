#!/usr/bin/env node
// Smoke test of a deployed Prestoteca: walks the main flows end to end over HTTP.
//
//   node server/scripts/smoke.mjs https://prestoteca-staging.up.railway.app
//
// It creates its own test users (smoke-*@example.com), a tool and a loan, and deletes
// every account it created at the end, so it leaves no test users behind.
// No dependencies: it only uses fetch (Node 20+). Exit code 0 = every check passed.

const BASE = process.argv[2]?.replace(/\/$/, '')
if (!BASE) {
  console.error('Usage: node server/scripts/smoke.mjs <base-url>')
  process.exit(2)
}

const RUN_ID = Date.now().toString(36)
const PASSWORD = 'smoke-test-1234'
let failures = 0

function check(label, actual, expected, extra = '') {
  const ok = actual === expected
  if (!ok) failures++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} → ${actual} (expected ${expected}) ${extra}`)
}

// ---------------------------------------------------------------------------
// The auth routes allow 5 requests per minute per IP. Instead of failing with a 429,
// wait until the oldest request of the last minute is more than 60 s old.
// ---------------------------------------------------------------------------
const AUTH_LIMIT = 5
const AUTH_WINDOW_MS = 61_000
const authCallTimes = []

async function waitForAuthSlot() {
  const now = Date.now()
  while (authCallTimes.length > 0 && now - authCallTimes[0] > AUTH_WINDOW_MS) authCallTimes.shift()
  if (authCallTimes.length >= AUTH_LIMIT) {
    const waitMs = AUTH_WINDOW_MS - (now - authCallTimes[0])
    console.log(`     … waiting ${Math.ceil(waitMs / 1000)} s for the login rate limit`)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    authCallTimes.shift()
  }
  authCallTimes.push(Date.now())
}

// ---------------------------------------------------------------------------
// One client per test user. It keeps that user's session cookie, like a browser.
// `withOrigin: false` sends a request without the Origin header (what another site's
// form or a script would do), to test the CSRF check.
// ---------------------------------------------------------------------------
function makeClient() {
  let cookie = ''

  return async function call(method, path, body, { withOrigin = true } = {}) {
    if (path.startsWith('/api/auth/')) await waitForAuthSlot()

    const headers = {}
    if (withOrigin) headers.Origin = BASE
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (cookie) headers.Cookie = cookie

    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    const setCookies = res.headers.getSetCookie()
    const tokenCookie = setCookies.find((c) => c.startsWith('token='))
    if (tokenCookie) {
      const value = tokenCookie.split(';')[0]
      // An empty token means the server cleared the session
      cookie = value === 'token=' ? '' : value
    }

    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = text
    }
    return { status: res.status, json, tokenCookie }
  }
}

// "Today" in the neighborhood's time zone, as the brief requires
function dayInTucuman(offsetDays) {
  const date = new Date(Date.now() + offsetDays * 86_400_000)
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Tucuman' })
}

const emailOf = (role) => `smoke-${role}-${RUN_ID}@example.com`
const isHttps = BASE.startsWith('https://')

const owner = makeClient()
const borrower = makeClient()
const stranger = makeClient()
const anonymous = makeClient()
// Accounts this run created and still has to delete, so they never stay in the database
const pendingCleanup = new Map()

async function register(client, role, neighborhood) {
  const r = await client('POST', '/api/auth/register', { name: `Smoke ${role}`, email: emailOf(role), password: PASSWORD, neighborhood })
  if (r.status === 201) pendingCleanup.set(role, client)
  return r
}

async function deleteAccount(client, role) {
  const r = await client('DELETE', '/api/me/account')
  if (r.status === 204) pendingCleanup.delete(role)
  return r
}

async function main() {
  console.log(`Smoke test against ${BASE} (run ${RUN_ID})\n`)

  // --- Health ----------------------------------------------------------------
  let r = await anonymous('GET', '/api/health')
  check('health', r.status, 200, JSON.stringify(r.json))

  // --- Accounts ----------------------------------------------------------------
  r = await register(owner, 'owner', 'Centro')
  check('register owner', r.status, 201)
  if (isHttps) {
    check('session cookie is Secure', /;\s*secure/i.test(r.tokenCookie ?? ''), true)
    check('session cookie is HttpOnly', /;\s*httponly/i.test(r.tokenCookie ?? ''), true)
  }

  r = await register(borrower, 'borrower', 'Barrio Norte')
  check('register borrower', r.status, 201)

  r = await anonymous('POST', '/api/auth/register', { name: 'Smoke dup', email: emailOf('owner'), password: PASSWORD, neighborhood: 'Centro' })
  check('register with a repeated email → 409', r.status, 409)

  r = await anonymous('POST', '/api/auth/login', { email: emailOf('owner'), password: PASSWORD }, { withOrigin: false })
  check('login without Origin → 403 (CSRF check)', r.status, 403)

  const wrongPassword = await anonymous('POST', '/api/auth/login', { email: emailOf('owner'), password: 'wrong-password' })
  const unknownEmail = await anonymous('POST', '/api/auth/login', { email: emailOf('nobody'), password: PASSWORD })
  check('login with a wrong password → 401', wrongPassword.status, 401)
  check('unknown email gets the same answer as a wrong password', JSON.stringify(unknownEmail.json), JSON.stringify(wrongPassword.json))

  r = await owner('POST', '/api/auth/logout')
  check('logout', r.status, 204)
  r = await owner('POST', '/api/auth/login', { email: emailOf('owner'), password: PASSWORD })
  check('login', r.status, 200)

  // --- Tools -------------------------------------------------------------------
  r = await owner('POST', '/api/tools', { name: 'Taladro de prueba', description: 'Smoke test', category: 'Herramientas eléctricas', condition: 'bueno' })
  check('publish a tool', r.status, 201)
  const toolId = r.json?.id

  r = await anonymous('GET', `/api/tools/${toolId}`)
  check('tool detail is public', r.status, 200)

  r = await anonymous('GET', '/api/tools?page=1')
  check('tool list', r.status, 200)

  // --- Loans -------------------------------------------------------------------
  const dates = { startDate: dayInTucuman(1), endDate: dayInTucuman(3) }

  r = await owner('POST', `/api/tools/${toolId}/loans`, dates)
  check('owner cannot request their own tool', r.status, 400, r.json?.error?.message)

  r = await borrower('POST', `/api/tools/${toolId}/loans`, { ...dates, note: 'La paso a buscar' })
  check('request a loan', r.status, 201)
  check('new loan is pendiente', r.json?.status, 'pendiente')
  const loanId = r.json?.id

  r = await owner('PATCH', `/api/loans/${loanId}/status`, { status: 'aceptado' })
  check('accept the loan', r.status, 200)

  // Someone who is not part of the loan must get exactly what a missing loan gets
  r = await register(stranger, 'stranger', 'Yerba Buena')
  check('register a third user', r.status, 201)
  const foreignLoan = await stranger('GET', `/api/loans/${loanId}`)
  const missingLoan = await stranger('GET', '/api/loans/00000000-0000-0000-0000-000000000000')
  check('foreign loan → 404', foreignLoan.status, 404)
  check('missing loan → 404', missingLoan.status, 404)
  // Only meaningful when both are real 404s: two identical 401s (no session) would also "match"
  check(
    'foreign loan looks exactly like a missing one',
    foreignLoan.status === 404 && JSON.stringify(foreignLoan.json) === JSON.stringify(missingLoan.json),
    true,
  )

  // --- Account deletion is blocked while a loan is active ------------------------
  r = await owner('DELETE', '/api/me/account')
  check('owner with an active loan cannot delete the account → 409', r.status, 409, r.json?.error?.message)
  r = await borrower('DELETE', '/api/me/account')
  check('borrower with an active loan cannot delete the account → 409', r.status, 409)

  for (const status of ['entregado', 'devuelto']) {
    r = await owner('PATCH', `/api/loans/${loanId}/status`, { status })
    check(`move the loan to ${status}`, r.status, 200)
  }

  r = await owner('PATCH', `/api/loans/${loanId}/status`, { status: 'entregado' })
  check('invalid transition devuelto → entregado → 409', r.status, 409)

  r = await borrower('GET', `/api/loans/${loanId}`)
  check('borrower sees the loan detail', r.status, 200, `→ ${r.json?.status}`)

  // --- Account deletion once every loan has ended --------------------------------
  r = await deleteAccount(owner, 'owner')
  check('delete the owner account → 204', r.status, 204)
  check('the session cookie is cleared', /^token=;/.test(r.tokenCookie ?? ''), true)

  // The client dropped the cleared cookie, as a browser would. This proves the browser
  // loses the session; a stolen copy of the token would still work until it expires (D-d).
  r = await owner('GET', '/api/me/tools')
  check('after deletion the browser has no session left', r.status, 401)

  r = await anonymous('GET', `/api/tools/${toolId}`)
  check("the deleted owner's tool is gone", r.status, 404)

  r = await borrower('GET', `/api/loans/${loanId}`)
  check('the loan stays in the borrower history', r.status, 200)

  r = await anonymous('POST', '/api/auth/login', { email: emailOf('owner'), password: PASSWORD })
  check('the deleted account cannot log in', r.status, 401)

  // The original email is free again: register it and delete that account too
  const reborn = makeClient()
  r = await register(reborn, 'owner', 'Centro')
  check('the email of a deleted account can be registered again', r.status, 201)
  r = await deleteAccount(reborn, 'owner')
  check('delete the re-registered account', r.status, 204)
}

// Deletes whatever accounts are still pending, even after a failed check or a crash
async function cleanUp() {
  for (const [role, client] of pendingCleanup) {
    const r = await client('DELETE', '/api/me/account')
    check(`clean up the ${role} account`, r.status, 204)
  }
}

try {
  await main()
} catch (err) {
  failures++
  console.error('FAIL unexpected error:', err)
} finally {
  await cleanUp()
}

console.log(failures === 0 ? '\nSMOKE OK' : `\nSMOKE FAILED: ${failures} check(s)`)
process.exit(failures === 0 ? 0 : 1)
