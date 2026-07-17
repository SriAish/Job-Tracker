// Adzuna transport: URL building, credentials, pacing, call counting, and
// the daily budget guard. Mode orchestration (which companies/terms to
// call, and what to do when the budget runs out) stays in cron/jobtrack.js.

import { ADZUNA_DAILY_BUDGET, ROLE_KEYWORDS } from './constants.js'
import { normalizeAdzuna } from './normalize.js'

// Adzuna rate-limits at ~2 req/sec — callers must put 400ms between calls.
const PACING_MS = 400

let callCount = 0
let lastCallAt = 0

function matchesKeywords(title) {
  const t = (title ?? '').toLowerCase()
  return ROLE_KEYWORDS.some(k => t.includes(k))
}

export function getAdzunaCallCount() {
  return callCount
}

async function pace() {
  if (lastCallAt) {
    const wait = PACING_MS - (Date.now() - lastCallAt)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
  }
  lastCallAt = Date.now()
}

// Low-level single Adzuna call: applies credentials from env, paces 400ms
// after the previous call, counts against the daily budget, and never
// throws. Returns { ok: true, data } with Adzuna's raw JSON body on
// success, or { ok: false, status, reason, detail } on failure.
export async function adzunaRequest(params, { page = 1 } = {}) {
  if (callCount >= ADZUNA_DAILY_BUDGET) {
    return { ok: false, status: null, reason: 'budget_exceeded' }
  }

  const appId = process.env.ADZUNA_APP_ID
  const appKey = process.env.ADZUNA_APP_KEY
  if (!appId || !appKey) {
    return { ok: false, status: null, reason: 'missing_credentials' }
  }

  await pace()

  const qs = new URLSearchParams({ app_id: appId, app_key: appKey, ...params })
  const url = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${qs}`
  callCount++

  let res
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
  } catch (e) {
    return { ok: false, status: null, reason: 'network_error', detail: e.message }
  }

  if (res.status === 401 || res.status === 403) {
    const text = await res.text().catch(() => '')
    return { ok: false, status: res.status, reason: 'auth_failure', detail: text.slice(0, 200) }
  }
  // 400 on company= means the company isn't indexed in Adzuna — valid empty set, not an error
  if (res.status === 400) {
    return { ok: true, data: { results: [] } }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, status: res.status, reason: 'http_error', detail: text.slice(0, 200) }
  }

  const data = await res.json()
  return { ok: true, data }
}

// Single-term search for cron Mode 1 / Mode 2 orchestration: runs the raw
// request, keyword-filters titles, and normalizes via shared/normalize.js.
// Returns { jobs, error } — error is a short reason string, never throws.
export async function searchAdzuna(params, opts) {
  const result = await adzunaRequest(params, opts)
  if (!result.ok) return { jobs: [], error: result.reason }
  const results = result.data.results ?? []
  const jobs = results.filter(j => matchesKeywords(j.title ?? '')).map(normalizeAdzuna)
  return { jobs, error: null }
}
