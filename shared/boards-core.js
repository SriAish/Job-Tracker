import { greenhouse, ashby, lever } from './companies.js'
import { ROLE_KEYWORDS } from './constants.js'
import { normalizeGreenhouse, normalizeLever, normalizeAshby, parseAshbyAppData } from './normalize.js'
import { mergeJobs } from './merge.js'

const SOURCE_COMPANIES = { greenhouse, ashby, lever }

// A single hung per-company connection (no data, connection left open) can
// otherwise stall the whole group for minutes with no timeout in place.
const FETCH_TIMEOUT_MS = 15000

function matchesKeywords(title) {
  const t = (title ?? '').toLowerCase()
  return ROLE_KEYWORDS.some(k => t.includes(k))
}

// AbortSignal.timeout() can fire either while awaiting fetch() itself or
// later while streaming the body (res.text()); either raises a TimeoutError
// DOMException that must be distinguished from other failures at each site.
function isTimeoutError(e) {
  return e?.name === 'TimeoutError' || e?.name === 'AbortError'
}

function fetchErrorReason(e) {
  return isTimeoutError(e) ? 'timeout' : 'network_error'
}

function readErrorReason(e) {
  return isTimeoutError(e) ? 'timeout' : 'parse_error'
}

// Measures raw response bytes for timing purposes only: content-length header
// when present, else the measured length of the text actually read. Reading
// text first and JSON.parse-ing it is equivalent to res.json() for the data
// that reaches normalizers; it only exists to make the byte count available.
function responseBytes(res, text) {
  const cl = res.headers.get('content-length')
  return cl != null ? Number(cl) : text.length
}

async function fetchGreenhouseSlug(slug, name) {
  let res
  try {
    res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (e) {
    return { jobs: [], error: { source: 'greenhouse', slug, reason: fetchErrorReason(e) }, bytes: 0 }
  }
  if (!res.ok) return { jobs: [], error: { source: 'greenhouse', slug, reason: 'http_error' }, bytes: 0 }
  let text, data, bytes
  try {
    text = await res.text()
    bytes = responseBytes(res, text)
    data = JSON.parse(text)
  } catch (e) {
    return { jobs: [], error: { source: 'greenhouse', slug, reason: readErrorReason(e) }, bytes: bytes ?? 0 }
  }
  const jobs = (data.jobs ?? [])
    .filter(j => matchesKeywords(j.title))
    .map(j => normalizeGreenhouse(j, name))
  return { jobs, error: null, bytes }
}

async function fetchLeverSlug(slug, name) {
  let res
  try {
    res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (e) {
    return { jobs: [], error: { source: 'lever', slug, reason: fetchErrorReason(e) }, bytes: 0 }
  }
  if (!res.ok) return { jobs: [], error: { source: 'lever', slug, reason: 'http_error' }, bytes: 0 }
  let text, data, bytes
  try {
    text = await res.text()
    bytes = responseBytes(res, text)
    data = JSON.parse(text)
  } catch (e) {
    return { jobs: [], error: { source: 'lever', slug, reason: readErrorReason(e) }, bytes: bytes ?? 0 }
  }
  if (!Array.isArray(data)) return { jobs: [], error: { source: 'lever', slug, reason: 'parse_error' }, bytes }
  const jobs = data
    .filter(j => matchesKeywords(j.text ?? ''))
    .map(j => normalizeLever(j, name))
  return { jobs, error: null, bytes }
}

async function fetchAshbySlug(slug, name) {
  let res
  try {
    res = await fetch(`https://jobs.ashbyhq.com/${slug}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (e) {
    return { jobs: [], error: { source: 'ashby', slug, reason: fetchErrorReason(e) }, bytes: 0 }
  }
  if (!res.ok) return { jobs: [], error: { source: 'ashby', slug, reason: 'http_error' }, bytes: 0 }
  let html
  try {
    html = await res.text()
  } catch (e) {
    return { jobs: [], error: { source: 'ashby', slug, reason: readErrorReason(e) }, bytes: 0 }
  }
  const bytes = responseBytes(res, html)
  let data
  try {
    data = parseAshbyAppData(html)
  } catch (e) {
    return { jobs: [], error: { source: 'ashby', slug, reason: e.code ?? 'parse_error' }, bytes }
  }
  const jobs = (data.jobBoard?.jobPostings ?? [])
    .filter(j => j.isListed && matchesKeywords(j.title))
    .map(j => normalizeAshby(j, slug, name))
  return { jobs, error: null, bytes }
}

const FETCHERS = { greenhouse: fetchGreenhouseSlug, ashby: fetchAshbySlug, lever: fetchLeverSlug }

// Runs one source's companies in parallel, timed as a group (step 8,
// measurement only). Grouping the Promise.all by source instead of one flat
// Promise.all across all sources does not change concurrency: every source
// group is itself kicked off in parallel by runBoards below, so total
// wall-clock parallelism is unchanged from before this instrumentation.
async function runSourceGroup(source) {
  const start = performance.now()
  const results = await Promise.all(
    SOURCE_COMPANIES[source].map(({ slug, name }) => FETCHERS[source](slug, name))
  )
  const ms = Math.round(performance.now() - start)

  const jobs = []
  const errors = []
  let bytes = 0
  for (const r of results) {
    jobs.push(...r.jobs)
    if (r.error) errors.push(r.error)
    bytes += r.bytes ?? 0
  }

  return { source, jobs, errors, timing: { ms, jobCount: jobs.length, bytes } }
}

// Fetches all companies for the requested board sources in parallel,
// normalizes, merges, and returns {jobs, errors, timings}. A healthy fetch
// returning zero jobs is not an error. `timings` is additive measurement
// data (step 8) and does not change the {jobs, errors} contract.
export async function runBoards({ sources }) {
  const active = (sources ?? []).filter(s => FETCHERS[s])

  const groupResults = await Promise.all(active.map(runSourceGroup))

  const jobArrays = []
  const errors = []
  const timings = {}
  for (const g of groupResults) {
    jobArrays.push(g.jobs)
    errors.push(...g.errors)
    timings[g.source] = g.timing
  }

  return { jobs: mergeJobs(jobArrays), errors, timings }
}
