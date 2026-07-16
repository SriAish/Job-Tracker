import 'dotenv/config'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import nodemailer from 'nodemailer'
import config from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEEN_FILE = path.join(__dirname, '.seen-jobs.json')

function loadSeen() {
  try { return new Set(JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'))) }
  catch { return new Set() }
}

function saveSeen(seen) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...seen]), 'utf8')
}

function matchesKeywords(text) {
  const lower = text.toLowerCase()
  return config.keywords.some(kw => lower.includes(kw))
}

const STATE_RE = /[,\s](al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)(\s*[,;]|\s*$)/i
const US_STATE_NAME_RE = /,\s*(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)(\s*,|\s*$)/i
const US_CITY_RE = /\b(san francisco|new york|chicago|seattle|boston|austin|denver|atlanta|miami|portland|dallas|houston|phoenix|san jose|san diego|washington|philadelphia|minneapolis|detroit|nashville|charlotte|las vegas|pittsburgh|raleigh|los angeles|brooklyn|silicon valley|bay area|sfo|nyc)\b/i

function isUS(location) {
  if (!location || location.trim() === '') return true
  const loc = location.toLowerCase()
  if (loc.includes('united states') || /\busa\b/.test(loc)) return true
  if (/\bus\b/.test(loc)) return true
  if (loc.startsWith('us-') || /[,;\s]us-/.test(loc)) return true
  if (STATE_RE.test(location)) return true
  if (US_STATE_NAME_RE.test(location)) return true
  if (US_CITY_RE.test(location)) return true
  if (/^remote(\s*[\-–(].*)?$/i.test(location.trim())) return true
  return false
}

function stripHtml(html) {
  return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

async function fetchGreenhouse(slug, name) {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`)
    if (!res.ok) { console.warn(`  ${name}: HTTP ${res.status}`); return [] }
    const data = await res.json()
    return (data.jobs ?? [])
      .filter(j => matchesKeywords(j.title))
      .map(j => ({
        id: `gh-${j.id}`,
        title: j.title ?? '',
        company: name,
        location: j.location?.name ?? '',
        url: j.absolute_url ?? '',
        source: 'Greenhouse',
      }))
  } catch (e) {
    console.warn(`  ${name}: ${e.message}`)
    return []
  }
}

async function fetchLever(slug, name) {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) { console.warn(`  ${name}: Lever HTTP ${res.status}`); return [] }
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data
      .filter(j => matchesKeywords(j.text ?? ''))
      .map(j => ({
        id: `lv-${j.id}`,
        title: j.text ?? '',
        company: name,
        location: j.categories?.location ?? '',
        url: j.hostedUrl ?? '',
        source: 'Lever',
      }))
  } catch (e) {
    console.warn(`  ${name}: ${e.message}`)
    return []
  }
}

async function fetchAshby(slug, name) {
  try {
    const res = await fetch(`https://jobs.ashbyhq.com/${slug}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) { console.warn(`  ${name}: Ashby HTTP ${res.status}`); return [] }
    const html = await res.text()
    const marker = 'window.__appData = '
    const start = html.indexOf(marker)
    if (start === -1) return []
    const begin = start + marker.length
    let depth = 0, i = begin
    for (; i < html.length; i++) {
      if (html[i] === '{') depth++
      else if (html[i] === '}') { depth--; if (depth === 0) break }
    }
    const data = JSON.parse(html.slice(begin, i + 1))
    return (data.jobBoard?.jobPostings ?? [])
      .filter(j => j.isListed && matchesKeywords(j.title))
      .map(j => ({
        id: `ab-${j.id}`,
        title: j.title ?? '',
        company: name,
        location: j.locationName?.trim() ?? '',
        url: `https://jobs.ashbyhq.com/${slug}/${j.id}`,
        source: 'Ashby',
      }))
  } catch (e) {
    console.warn(`  ${name}: ${e.message}`)
    return []
  }
}

// ── Adzuna ────────────────────────────────────────────────────────────────────

const ADZUNA_DAILY_BUDGET = 200  // hard cap; Adzuna limit is 250
let adzunaCalls = 0
const adzunaSleep = ms => new Promise(r => setTimeout(r, ms))

// Build "City, State" from location.area so isUS() state-name regex matches.
// area = ["US", "Maryland", "Montgomery County", "Rockville"]
function adzunaLocation(job) {
  const area = job.location?.area ?? []
  const state = area[1] ?? ''
  const city  = area[3] ?? area[2] ?? ''
  if (state) return city ? `${city}, ${state}` : state
  return job.location?.display_name ?? ''
}

function normalizeAdzunaJob(job) {
  return {
    id: `az-${job.id}`,
    title: job.title ?? '',
    company: job.company?.display_name ?? '',
    location: adzunaLocation(job),
    url: job.redirect_url ?? '',
    source: 'Adzuna',
    precision: 'low',
  }
}

// Serialized single Adzuna call with rate-budget check.
// Adzuna rate-limits at ~2 req/sec — callers must put 400ms between calls.
async function adzunaGet(params) {
  if (adzunaCalls >= ADZUNA_DAILY_BUDGET) {
    console.error(`[ALERT] Adzuna daily call budget (${ADZUNA_DAILY_BUDGET}) reached — skipping`)
    return null
  }

  const appId  = process.env.ADZUNA_APP_ID
  const appKey = process.env.ADZUNA_APP_KEY
  if (!appId || !appKey) {
    console.error('[ALERT] Adzuna: ADZUNA_APP_ID / ADZUNA_APP_KEY not set')
    return null
  }

  const qs = new URLSearchParams({ app_id: appId, app_key: appKey, ...params })
  const url = `https://api.adzuna.com/v1/api/jobs/us/search/1?${qs}`
  adzunaCalls++

  let res
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
  } catch (e) {
    console.error(`[ALERT] Adzuna network error: ${e.message}`)
    return null
  }

  if (res.status === 401 || res.status === 403) {
    const text = await res.text().catch(() => '')
    console.error(`[ALERT] Adzuna auth failure (${res.status}) — check credentials. Detail: ${text.slice(0, 200)}`)
    return null
  }
  // 400 on company= means the company isn't indexed in Adzuna — not an error worth alerting
  if (res.status === 400) {
    return []
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[ALERT] Adzuna HTTP ${res.status}. Detail: ${text.slice(0, 200)}`)
    return null
  }

  const data = await res.json()
  const results = data.results ?? []
  if (results.length === 0) {
    console.log(`  Adzuna: 0 results for ${JSON.stringify(params).slice(0, 80)} (valid empty set)`)
  }
  return results
}

// Mode 1: one sequential call per tracked company, keyword-filter titles client-side.
// Catches companies on Workday/other ATSs that Adzuna indexes but we don't scrape.
// 400 = company not in Adzuna's index → silently skip (already handled in adzunaGet).
async function fetchAdzunaCompanyMode(companyNames, existingKeys) {
  const results = []
  // If list > 180 companies, alternate even/odd by day to stay within 200-call budget.
  const dayIndex = Math.floor(Date.now() / 86400000)
  const subset = companyNames.length > 180
    ? companyNames.filter((_, i) => i % 2 === dayIndex % 2)
    : companyNames

  console.log(`Adzuna Mode 1: ${subset.length} companies`)

  for (let i = 0; i < subset.length; i++) {
    const jobs = await adzunaGet({ company: subset[i], max_days_old: 7, results_per_page: 50 })
    if (jobs?.length) {
      const filtered = jobs
        .filter(j => matchesKeywords(j.title ?? ''))
        .map(normalizeAdzunaJob)
        .filter(j => !existingKeys.has(`${j.title.toLowerCase()}|${j.company.toLowerCase()}`))
      results.push(...filtered)
    }
    if (i < subset.length - 1) await adzunaSleep(400)
  }
  return results
}

// Mode 2: keyword discovery via title_only calls, serialized with 400ms gaps.
// what_or is dropped — "operations"/"strategy" alone return millions of irrelevant results.
const MODE2_CALLS = [
  { title_only: 'product manager' },
  { title_only: 'ai agent' },
  { title_only: 'venture capital' },
  { title_only: 'chief of staff' },
  { title_only: 'generative ai' },
  { title_only: 'go-to-market' },
  { title_only: 'program manager' },
  { title_only: 'strategy' },
]
const MODE2_COMMON = { max_days_old: 7, results_per_page: 50 }

async function fetchAdzunaKeywordMode(existingKeys) {
  const results = []
  console.log(`Adzuna Mode 2: ${MODE2_CALLS.length} keyword calls`)
  for (let i = 0; i < MODE2_CALLS.length; i++) {
    const params = { ...MODE2_COMMON, ...MODE2_CALLS[i] }
    const jobs = await adzunaGet(params)
    if (jobs?.length) {
      const filtered = jobs
        .filter(j => matchesKeywords(j.title ?? ''))
        .map(normalizeAdzunaJob)
        .filter(j => !existingKeys.has(`${j.title.toLowerCase()}|${j.company.toLowerCase()}`))
      results.push(...filtered)
    }
    if (i < MODE2_CALLS.length - 1) await adzunaSleep(400)
  }
  return results
}

// ─────────────────────────────────────────────────────────────────────────────

function buildHtml(jobs) {
  const rows = jobs.map(j => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee"><a href="${j.url}">${j.title}</a></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${j.company}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${j.location}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${j.source}</td>
    </tr>`).join('')
  return `
    <h2 style="font-family:sans-serif">${jobs.length} New Jobs</h2>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:13px;width:100%">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="text-align:left;padding:6px 10px">Title</th>
          <th style="text-align:left;padding:6px 10px">Company</th>
          <th style="text-align:left;padding:6px 10px">Location</th>
          <th style="text-align:left;padding:6px 10px">Source</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

async function main() {
  console.log('Job Tracker cron starting…')
  const seen = loadSeen()
  const allJobs = []

  for (let i = 0; i < config.companies.length; i += config.batchSize) {
    const batch = config.companies.slice(i, i + config.batchSize)
    console.log(`Fetching GH: ${batch.map(c => c.name).join(', ')}`)
    const results = await Promise.allSettled(batch.map(c => fetchGreenhouse(c.slug, c.name)))
    results.forEach(r => r.status === 'fulfilled' && allJobs.push(...r.value))
  }

  const ashbyJobs = []
  for (let i = 0; i < config.ashbyCompanies.length; i += config.batchSize) {
    const batch = config.ashbyCompanies.slice(i, i + config.batchSize)
    console.log(`Fetching Ashby: ${batch.map(c => c.name).join(', ')}`)
    const results = await Promise.allSettled(batch.map(c => fetchAshby(c.slug, c.name)))
    results.forEach(r => r.status === 'fulfilled' && ashbyJobs.push(...r.value))
  }

  const leverJobs = []
  for (let i = 0; i < config.leverCompanies.length; i += config.batchSize) {
    const batch = config.leverCompanies.slice(i, i + config.batchSize)
    console.log(`Fetching Lever: ${batch.map(c => c.name).join(', ')}`)
    const results = await Promise.allSettled(batch.map(c => fetchLever(c.slug, c.name)))
    results.forEach(r => r.status === 'fulfilled' && leverJobs.push(...r.value))
  }

  // Dedup — Greenhouse > Ashby > Lever (primary sources)
  const map = new Map()
  for (const j of allJobs) map.set(`${j.title.toLowerCase()}|${j.company.toLowerCase()}`, j)
  for (const j of ashbyJobs) {
    const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`
    if (!map.has(key)) map.set(key, j)
  }
  for (const j of leverJobs) {
    const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`
    if (!map.has(key)) map.set(key, j)
  }

  // Adzuna: run after primary dedup so existingKeys reflects direct-ATS results
  if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    const allTrackedNames = [
      ...new Set([
        ...config.companies.map(c => c.name),
        ...config.ashbyCompanies.map(c => c.name),
        ...config.leverCompanies.map(c => c.name),
      ])
    ]
    const primaryKeys = new Set(map.keys())
    const azMode1 = await fetchAdzunaCompanyMode(allTrackedNames, primaryKeys)
    for (const j of azMode1) {
      const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`
      if (!map.has(key)) map.set(key, j)
    }
    const azMode2 = await fetchAdzunaKeywordMode(new Set(map.keys()))
    for (const j of azMode2) {
      const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`
      if (!map.has(key)) map.set(key, j)
    }
    console.log(`Adzuna total API calls this run: ${adzunaCalls}`)
  } else {
    console.log('Adzuna skipped (ADZUNA_APP_ID / ADZUNA_APP_KEY not set)')
  }

  const deduped = [...map.values()].filter(j => isUS(j.location))

  const newJobs = deduped.filter(j => !seen.has(j.id))
  console.log(`Total (US): ${deduped.length} | New: ${newJobs.length}`)

  if (newJobs.length === 0) {
    console.log('No new jobs. Done.')
    return
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  })

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.EMAIL_TO,
    subject: `Job Tracker: ${newJobs.length} new job${newJobs.length > 1 ? 's' : ''}`,
    html: buildHtml(newJobs),
  })
  console.log('Digest sent.')

  for (const j of newJobs) seen.add(j.id)
  saveSeen(seen)
  console.log('Done.')
}

main().catch(err => { console.error(err); process.exit(1) })
