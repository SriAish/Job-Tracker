import { greenhouse, ashby, lever } from './companies.js'
import { ROLE_KEYWORDS } from './constants.js'
import { normalizeGreenhouse, normalizeLever, normalizeAshby, parseAshbyAppData } from './normalize.js'
import { mergeJobs } from './merge.js'

const SOURCE_COMPANIES = { greenhouse, ashby, lever }

function matchesKeywords(title) {
  const t = (title ?? '').toLowerCase()
  return ROLE_KEYWORDS.some(k => t.includes(k))
}

async function fetchGreenhouseSlug(slug, name) {
  let res
  try {
    res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`)
  } catch {
    return { jobs: [], error: { source: 'greenhouse', slug, reason: 'network_error' } }
  }
  if (!res.ok) return { jobs: [], error: { source: 'greenhouse', slug, reason: 'http_error' } }
  let data
  try { data = await res.json() } catch {
    return { jobs: [], error: { source: 'greenhouse', slug, reason: 'parse_error' } }
  }
  const jobs = (data.jobs ?? [])
    .filter(j => matchesKeywords(j.title))
    .map(j => normalizeGreenhouse(j, name))
  return { jobs, error: null }
}

async function fetchLeverSlug(slug, name) {
  let res
  try {
    res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
  } catch {
    return { jobs: [], error: { source: 'lever', slug, reason: 'network_error' } }
  }
  if (!res.ok) return { jobs: [], error: { source: 'lever', slug, reason: 'http_error' } }
  let data
  try { data = await res.json() } catch {
    return { jobs: [], error: { source: 'lever', slug, reason: 'parse_error' } }
  }
  if (!Array.isArray(data)) return { jobs: [], error: { source: 'lever', slug, reason: 'parse_error' } }
  const jobs = data
    .filter(j => matchesKeywords(j.text ?? ''))
    .map(j => normalizeLever(j, name))
  return { jobs, error: null }
}

async function fetchAshbySlug(slug, name) {
  let res
  try {
    res = await fetch(`https://jobs.ashbyhq.com/${slug}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
  } catch {
    return { jobs: [], error: { source: 'ashby', slug, reason: 'network_error' } }
  }
  if (!res.ok) return { jobs: [], error: { source: 'ashby', slug, reason: 'http_error' } }
  const html = await res.text()
  let data
  try {
    data = parseAshbyAppData(html)
  } catch (e) {
    return { jobs: [], error: { source: 'ashby', slug, reason: e.code ?? 'parse_error' } }
  }
  const jobs = (data.jobBoard?.jobPostings ?? [])
    .filter(j => j.isListed && matchesKeywords(j.title))
    .map(j => normalizeAshby(j, slug, name))
  return { jobs, error: null }
}

const FETCHERS = { greenhouse: fetchGreenhouseSlug, ashby: fetchAshbySlug, lever: fetchLeverSlug }

// Fetches all companies for the requested board sources in parallel,
// normalizes, merges, and returns {jobs, errors}. A healthy fetch
// returning zero jobs is not an error.
export async function runBoards({ sources }) {
  const active = (sources ?? []).filter(s => FETCHERS[s])

  const tasks = active.flatMap(source =>
    SOURCE_COMPANIES[source].map(({ slug, name }) => FETCHERS[source](slug, name))
  )

  const results = await Promise.all(tasks)

  const jobArrays = []
  const errors = []
  for (const { jobs, error } of results) {
    jobArrays.push(jobs)
    if (error) errors.push(error)
  }

  return { jobs: mergeJobs(jobArrays), errors }
}
