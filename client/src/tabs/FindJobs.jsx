import { useState, useCallback } from 'react'
import { storage } from '../storage'
import { ROLE_KEYWORDS, COMPANY_PORTALS, QUICK_LINKS } from '../constants'
import AddApplicationModal from '../components/AddApplicationModal'

const DEFAULT_QUERY = '"product manager" OR "strategy" OR "venture capital" OR "operations" OR "ai agent" OR "agentic" OR "generative ai" OR "LLM"'

function matchesKeywords(text) {
  const lower = text.toLowerCase()
  return ROLE_KEYWORDS.some(kw => lower.includes(kw))
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
  if (US_STATE_NAME_RE.test(location)) return true                // "San Francisco, California"
  if (US_CITY_RE.test(location)) return true
  if (/^remote(\s*[\-–(].*)?$/i.test(location.trim())) return true
  return false
}

function stripHtml(html) {
  return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function extractMaxYears(text) {
  const re = /(\d+)\s*(?:\+?\s*[-–to]+\s*(\d+))?\s*\+?\s*years?/gi
  let max = 0, found = false
  for (const m of text.matchAll(re)) {
    const a = parseInt(m[1]), b = m[2] ? parseInt(m[2]) : a
    if (a >= 1 && a <= 30) { max = Math.max(max, a, b); found = true }
  }
  return found ? max : null
}

async function fetchAshbyBatch(batch) {
  const results = await Promise.allSettled(
    batch.map(async ({ slug, name }) => {
      const res = await fetch(`/api/ashby/${slug}`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.jobs ?? [])
        .filter(j => matchesKeywords(j.title))
        .map(j => ({
          id: `ab-${j.id}`,
          title: j.title ?? '',
          company: name,
          location: j.locationName?.trim() ?? '',
          url: `https://jobs.ashbyhq.com/${slug}/${j.id}`,
          source: 'ashby',
          description: '',
          postedAt: j.updatedAt ?? j.publishedDate ?? '',
        }))
    })
  )
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
}

// ── Adzuna ────────────────────────────────────────────────────────────────────

// area = ["US", "Maryland", "Montgomery County", "Rockville"]
// Build "City, State" so isUS() state-name regex matches correctly.
function adzunaLocation(job) {
  const area = job.location?.area ?? []
  const state = area[1] ?? ''
  const city  = area[3] ?? area[2] ?? ''
  if (state) return city ? `${city}, ${state}` : state
  return job.location?.display_name ?? ''
}

function normalizeAdzuna(job) {
  return {
    id: `az-${job.id}`,
    title: job.title ?? '',
    company: job.company?.display_name ?? '',
    location: adzunaLocation(job),
    url: job.redirect_url ?? '',
    source: 'adzuna',
    precision: 'low',
    description: job.description ?? '',
    postedAt: job.created ?? '',
  }
}

const _adzunaSleep = ms => new Promise(r => setTimeout(r, ms))

// Serialize calls with 400ms gap to stay under Adzuna's ~2 req/sec rate limit.
async function callAdzuna(params) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
  )
  const res = await fetch(`/api/adzuna?${qs}`)

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Adzuna auth failure (${res.status}) — check ADZUNA_APP_ID / ADZUNA_APP_KEY`)
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(`Adzuna HTTP ${res.status}${d.error ? ': ' + d.error : ''}`)
  }

  const data = await res.json()
  return data.results ?? []   // 200 + empty array is valid data, not an error
}

// Mode 2 only in the frontend — keyword discovery via title_only calls.
// Mode 1 (company backstop) is cron-only: too many calls for a UI search.
const ADZUNA_MODE2_CALLS = [
  { title_only: 'product manager' },
  { title_only: 'ai agent' },
  { title_only: 'venture capital' },
  { title_only: 'chief of staff' },
  { title_only: 'generative ai' },
  { title_only: 'go-to-market' },
  { title_only: 'program manager' },
  { title_only: 'strategy' },
]
async function fetchAdzunaMode2(existingKeys, onProgress, maxDaysOld = 7) {
  const common = { max_days_old: maxDaysOld, results_per_page: 50 }
  const results = []
  for (let i = 0; i < ADZUNA_MODE2_CALLS.length; i++) {
    const kw = ADZUNA_MODE2_CALLS[i]
    const label = Object.values(kw)[0]
    onProgress(`Adzuna: searching "${label}"…`)
    try {
      const jobs = await callAdzuna({ ...common, ...kw })
      const normalized = jobs
        .filter(j => matchesKeywords(j.title ?? ''))
        .map(normalizeAdzuna)
        .filter(j => !existingKeys.has(`${j.title.toLowerCase()}|${j.company.toLowerCase()}`))
      results.push(...normalized)
    } catch (e) {
      console.warn(`Adzuna "${label}":`, e.message)
    }
    if (i < ADZUNA_MODE2_CALLS.length - 1) await _adzunaSleep(400)
  }
  return results
}

// ─────────────────────────────────────────────────────────────────────────────

async function fetchLeverBatch(batch) {
  const results = await Promise.allSettled(
    batch.map(async ({ slug, name }) => {
      const res = await fetch(`/api/lever/${slug}`)
      if (!res.ok) return []
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
          source: 'lever',
          description: '',
          postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : '',
        }))
    })
  )
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
}

async function fetchGreenhouseBatch(batch) {
  const results = await Promise.allSettled(
    batch.map(async ({ slug, name }) => {
      const res = await fetch(`/api/greenhouse/${slug}`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.jobs ?? [])
        .filter(j => matchesKeywords(j.title))
        .map(j => ({
          id: `gh-${j.id}`,
          title: j.title ?? '',
          company: name,
          location: j.location?.name ?? '',
          url: j.absolute_url ?? '',
          source: 'greenhouse',
          description: stripHtml(j.content ?? ''),
          postedAt: j.updated_at ?? '',
        }))
    })
  )
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
}

export default function FindJobs({ applications, resumes, onAddApplication }) {
  const [query, setQuery] = useState(DEFAULT_QUERY)
  const [usOnly, setUsOnly] = useState(true)
  const [expFilter, setExpFilter] = useState(true)
  const [maxYears, setMaxYears] = useState(8)
  const [boards, setBoards] = useState({ greenhouse: true, ashby: true, lever: true, adzuna: true })
  const [recency, setRecency] = useState('any') // 'any' | '48h' | '24h'
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [expanded, setExpanded] = useState({})
  const [addModal, setAddModal] = useState(null)

  const isTracked = useCallback((job) =>
    applications.some(
      a => a.title.toLowerCase() === job.title.toLowerCase() &&
           a.company.toLowerCase() === job.company.toLowerCase()
    ), [applications])

  async function handleSearch() {
    setLoading(true)
    setStatus('')
    setJobs([])

    const cutoffMs = recency === '24h' ? Date.now() - 24 * 60 * 60 * 1000
      : recency === '48h' ? Date.now() - 48 * 60 * 60 * 1000
      : 0
    const withinRecency = (postedAt) => {
      if (!cutoffMs || !postedAt) return true
      const ts = new Date(postedAt).getTime()
      return isNaN(ts) ? true : ts >= cutoffMs
    }
    const adzunaMaxDaysOld = recency === '24h' ? 1 : recency === '48h' ? 2 : 7

    const companies = storage.getCompanies()
    const ashbyCompanies = storage.getAshbyCompanies()
    const leverCompanies = storage.getLeverCompanies()

    // Fetch all three boards in parallel — each board already parallelises
    // its own company list internally via Promise.allSettled.
    const activeBoards = [
      boards.greenhouse && 'Greenhouse',
      boards.ashby && 'Ashby',
      boards.lever && 'Lever',
    ].filter(Boolean)
    if (activeBoards.length) setStatus(`Searching ${activeBoards.join(', ')}…`)

    const [ghJobs, abJobs, lvJobs] = await Promise.all([
      boards.greenhouse ? fetchGreenhouseBatch(companies) : Promise.resolve([]),
      boards.ashby      ? fetchAshbyBatch(ashbyCompanies) : Promise.resolve([]),
      boards.lever      ? fetchLeverBatch(leverCompanies) : Promise.resolve([]),
    ])

    // Dedup — greenhouse > ashby > lever (primary sources)
    const map = new Map()
    for (const j of ghJobs) map.set(`${j.title.toLowerCase()}|${j.company.toLowerCase()}`, j)
    for (const j of abJobs) {
      const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`
      if (!map.has(key)) map.set(key, j)
    }
    for (const j of lvJobs) {
      const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`
      if (!map.has(key)) map.set(key, j)
    }

    // Adzuna keyword discovery — serialized, runs after primary dedup
    if (boards.adzuna) {
      const azJobs = await fetchAdzunaMode2(new Set(map.keys()), setStatus, adzunaMaxDaysOld)
      for (const j of azJobs) {
        const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`
        if (!map.has(key)) map.set(key, j)
      }
    }

    const deduped = [...map.values()].filter(j => withinRecency(j.postedAt))
    let result = usOnly ? deduped.filter(j => isUS(j.location)) : deduped
    let expDropped = 0
    if (expFilter) {
      const before = result.length
      result = result.filter(j => {
        const yrs = extractMaxYears(j.description)
        return yrs === null || yrs <= maxYears
      })
      expDropped = before - result.length
    }
    const nonUS = deduped.length - (usOnly ? deduped.filter(j => isUS(j.location)).length : deduped.length)
    const parts = [`${result.length} results`]
    if (recency !== 'any') parts.push(`last ${recency}`)
    if (usOnly && nonUS) parts.push(`${nonUS} non-US hidden`)
    if (expFilter && expDropped) parts.push(`${expDropped} over ${maxYears}yr exp hidden`)
    setJobs(result)
    setStatus(parts.join(' · '))
    setLoading(false)
  }

  return (
    <div>
      {/* Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          style={{ flex: 1 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: usOnly ? '#e0f0ff' : '#456', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={usOnly}
            onChange={e => setUsOnly(e.target.checked)}
            style={{ width: 'auto', accentColor: '#4f46e5', cursor: 'pointer' }}
          />
          US only
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: expFilter ? '#e0f0ff' : '#456', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={expFilter}
            onChange={e => setExpFilter(e.target.checked)}
            style={{ width: 'auto', accentColor: '#4f46e5', cursor: 'pointer' }}
          />
          ≤
          <input
            type="number"
            min={1}
            max={30}
            value={maxYears}
            onChange={e => setMaxYears(Number(e.target.value))}
            disabled={!expFilter}
            style={{ width: 36, padding: '2px 4px', fontSize: 12, textAlign: 'center', opacity: expFilter ? 1 : 0.4 }}
          />
          yrs exp
        </label>
        <button
          onClick={handleSearch}
          disabled={loading || Object.values(boards).every(v => !v)}
          style={{ padding: '7px 18px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 5, fontWeight: 600, fontSize: 13, opacity: Object.values(boards).every(v => !v) ? 0.4 : 1 }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Board toggles + recency filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { key: 'greenhouse', label: 'Greenhouse', active: '#1a2f5e', activeText: '#7ca4c8', activeBorder: '#2a4a8e' },
          { key: 'ashby',      label: 'Ashby',      active: '#1e1a3a', activeText: '#a78bfa', activeBorder: '#4c1d95' },
          { key: 'lever',      label: 'Lever',      active: '#1a2a1a', activeText: '#86efac', activeBorder: '#166534' },
          { key: 'adzuna',     label: 'Adzuna',     active: '#2a1800', activeText: '#fb923c', activeBorder: '#7c2d12' },
        ].map(({ key, label, active, activeText, activeBorder }) => {
          const on = boards[key]
          return (
            <button
              key={key}
              onClick={() => setBoards(b => ({ ...b, [key]: !b[key] }))}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', border: `1px solid ${on ? activeBorder : '#1e2e42'}`,
                background: on ? active : 'transparent',
                color: on ? activeText : '#456',
                transition: 'all 0.1s',
              }}
            >
              {label}
            </button>
          )
        })}
        <span style={{ fontSize: 11, color: '#456', alignSelf: 'center', marginLeft: 2 }}>
          {Object.values(boards).filter(Boolean).length === 0 ? 'Select at least one board' : ''}
        </span>

        {/* Recency filter */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, border: '1px solid #1e2e42', borderRadius: 4, overflow: 'hidden' }}>
          {[{ key: 'any', label: 'Any time' }, { key: '48h', label: '48h' }, { key: '24h', label: '24h' }].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRecency(key)}
              style={{
                padding: '3px 9px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                border: 'none', borderRadius: 0,
                background: recency === key ? '#1e2e42' : 'transparent',
                color: recency === key ? '#e0f0ff' : '#456',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {status && !loading && (
        <div style={{ fontSize: 12, color: '#456', marginBottom: 12 }}>{status}</div>
      )}
      {loading && (
        <div style={{ fontSize: 12, color: '#7ca4c8', marginBottom: 12 }}>{status}</div>
      )}

      {/* Results */}
      {jobs.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          {jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              tracked={isTracked(job)}
              expanded={!!expanded[job.id]}
              onToggle={() => setExpanded(e => ({ ...e, [job.id]: !e[job.id] }))}
              onTrack={() => setAddModal(job)}
            />
          ))}
        </div>
      )}

      {/* Company Portals */}
      <Section label="Company Portals">
        {COMPANY_PORTALS.map(portal => (
          <div key={portal.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #111e2e' }}>
            <span style={{ width: 90, fontSize: 12, color: '#7ca4c8', flexShrink: 0 }}>{portal.name}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {portal.links.map(link => (
                <LinkBtn key={link.label} href={link.url}>{link.label}</LinkBtn>
              ))}
            </div>
          </div>
        ))}
      </Section>

      {/* Quick Launch */}
      <Section label="Quick Launch">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {QUICK_LINKS.map(link => (
            <LinkBtn key={link.label} href={link.url}>{link.label}</LinkBtn>
          ))}
        </div>
      </Section>

      {addModal && (
        <AddApplicationModal
          initial={{ title: addModal.title, company: addModal.company, location: addModal.location, url: addModal.url, description: addModal.description, source: addModal.source }}
          resumes={resumes}
          onSave={app => { onAddApplication(app); setAddModal(null) }}
          onClose={() => setAddModal(null)}
        />
      )}
    </div>
  )
}

function JobCard({ job, tracked, expanded, onToggle, onTrack }) {
  const date = job.postedAt ? new Date(job.postedAt).toLocaleDateString() : ''
  const isGH = job.source === 'greenhouse'
  const isLV = job.source === 'lever'
  const isAZ = job.source === 'adzuna'

  return (
    <div style={{ background: '#0d1520', border: '1px solid #1e2e42', borderRadius: 6, marginBottom: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
        <button onClick={onToggle} style={{ background: 'none', border: 'none', color: '#456', cursor: 'pointer', fontSize: 9, padding: 0, flexShrink: 0, width: 12 }}>
          {expanded ? '▼' : '▶'}
        </button>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <a href={job.url || '#'} target="_blank" rel="noopener noreferrer"
              style={{ color: '#e0f0ff', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
              {job.title}
            </a>
            <span style={{ color: '#7ca4c8', fontSize: 12 }}>{job.company}</span>
            {job.location && <span style={{ color: '#456', fontSize: 11 }}>{job.location}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {date && <span style={{ color: '#456', fontSize: 11 }}>{date}</span>}
          <span style={{
            padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700,
            background: isGH ? '#1a2f5e' : isLV ? '#1a2a1a' : isAZ ? '#2a1800' : '#1e1a3a',
            color: isGH ? '#7ca4c8' : isLV ? '#86efac' : isAZ ? '#fb923c' : '#a78bfa',
            border: `1px solid ${isGH ? '#2a4a8e' : isLV ? '#166534' : isAZ ? '#7c2d12' : '#4c1d95'}`,
            borderStyle: isAZ ? 'dashed' : 'solid',
          }}>
            {isGH ? 'GH' : isLV ? 'Lever' : isAZ ? 'AZ' : 'Ashby'}
          </span>
          {tracked ? (
            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#14532d28', color: '#4ade80', border: '1px solid #166534' }}>
              Tracked
            </span>
          ) : (
            <button onClick={onTrack} style={{
              padding: '2px 8px', background: '#4f46e518', color: '#818cf8',
              border: '1px solid #4f46e540', borderRadius: 4, fontSize: 11,
            }}>
              + Track
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '8px 12px 10px 32px', color: '#7ca4c8', fontSize: 12, lineHeight: 1.65, borderTop: '1px solid #111e2e' }}>
          {isAZ && (
            <div style={{ fontSize: 11, color: '#7c2d12', marginBottom: 6, fontStyle: 'italic' }}>
              via Adzuna aggregator — verify on company site before applying
            </div>
          )}
          {job.description
            ? job.description.slice(0, 600) + (job.description.length > 600 ? '…' : '')
            : <em style={{ color: '#456' }}>No description</em>
          }
        </div>
      )}
    </div>
  )
}

function Section({ label, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 10, color: '#456', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </section>
  )
}

function LinkBtn({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{
      padding: '4px 11px', background: '#0d1520', border: '1px solid #1e2e42',
      borderRadius: 4, color: '#7ca4c8', fontSize: 12, textDecoration: 'none',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </a>
  )
}
