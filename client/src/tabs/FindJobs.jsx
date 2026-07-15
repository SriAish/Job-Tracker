import { useState, useCallback, useEffect } from 'react'
import { storage } from '../storage'
import { ROLE_KEYWORDS } from '../constants'
import AddApplicationModal from '../components/AddApplicationModal'
import { COLORS, cardStyle, inputStyle, primaryButtonStyle } from '../theme'

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

async function fetchAdzunaKeyword(query, maxDaysOld = 7) {
  const jobs = await callAdzuna({ what: query, max_days_old: maxDaysOld, results_per_page: 50 })
  return jobs.map(normalizeAdzuna)
}

// ─────────────────────────────────────────────────────────────────────────────

export default function FindJobs({ applications, resumes, onAddApplication }) {
  const [subTab, setSubTab] = useState('greenhouse')
  const [addModal, setAddModal] = useState(null)

  const isTracked = useCallback((job) =>
    applications.some(
      a => a.title.toLowerCase() === job.title.toLowerCase() &&
           a.company.toLowerCase() === job.company.toLowerCase()
    ), [applications])

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${COLORS.border}` }}>
        {[{ key: 'greenhouse', label: 'Greenhouse' }, { key: 'search', label: 'Search' }].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            style={{
              padding: '9px 4px', margin: '0 12px 0 0', background: 'transparent',
              color: subTab === key ? COLORS.text : COLORS.textSecondary,
              border: 'none', borderBottom: subTab === key ? `2px solid ${COLORS.accent}` : '2px solid transparent',
              cursor: 'pointer', fontSize: 13, fontWeight: subTab === key ? 600 : 500,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'greenhouse' && (
        <GreenhouseSearch isTracked={isTracked} onTrack={setAddModal} />
      )}
      {subTab === 'search' && (
        <KeywordSearch isTracked={isTracked} onTrack={setAddModal} />
      )}

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

function GreenhouseSearch({ isTracked, onTrack }) {
  const [usOnly, setUsOnly] = useState(true)
  const [expFilter, setExpFilter] = useState(true)
  const [maxYears, setMaxYears] = useState(8)
  const [boards, setBoards] = useState({ greenhouse: true, ashby: true, lever: true, adzuna: true })
  const [recency, setRecency] = useState('any') // 'any' | '48h' | '24h'
  const [rawJobs, setRawJobs] = useState([])   // full deduped results from last fetch
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [expanded, setExpanded] = useState({})

  // Re-apply display filters instantly whenever rawJobs or any filter changes.
  // No network calls — just in-memory filtering of the last fetch.
  useEffect(() => {
    if (!rawJobs.length) return
    const cutoffMs = recency === '24h' ? Date.now() - 86400000
      : recency === '48h' ? Date.now() - 172800000 : 0
    const withinCutoff = (postedAt) => {
      if (!cutoffMs || !postedAt) return true
      const ts = new Date(postedAt).getTime()
      return isNaN(ts) ? true : ts >= cutoffMs
    }
    const dated = rawJobs.filter(j => withinCutoff(j.postedAt))
    let result = usOnly ? dated.filter(j => isUS(j.location)) : dated
    let expDropped = 0
    if (expFilter) {
      const before = result.length
      result = result.filter(j => {
        const yrs = extractMaxYears(j.description)
        return yrs === null || yrs <= maxYears
      })
      expDropped = before - result.length
    }
    const nonUS = dated.length - (usOnly ? dated.filter(j => isUS(j.location)).length : dated.length)
    const parts = [`${result.length} results`]
    if (recency !== 'any') parts.push(`last ${recency}`)
    if (usOnly && nonUS) parts.push(`${nonUS} non-US hidden`)
    if (expFilter && expDropped) parts.push(`${expDropped} over ${maxYears}yr exp hidden`)
    setJobs(result)
    setStatus(parts.join(' · '))
  }, [rawJobs, recency, usOnly, expFilter, maxYears])

  async function handleSearch() {
    setLoading(true)
    setStatus('')
    setJobs([])
    setRawJobs([])

    const adzunaMaxDaysOld = recency === '24h' ? 1 : recency === '48h' ? 2 : 7

    const companies = storage.getCompanies()
    const ashbyCompanies = storage.getAshbyCompanies()
    const leverCompanies = storage.getLeverCompanies()

    const activeBoards = [
      boards.greenhouse && 'Greenhouse',
      boards.ashby && 'Ashby',
      boards.lever && 'Lever',
    ].filter(Boolean)
    if (activeBoards.length) setStatus(`Searching ${activeBoards.join(', ')}…`)

    let boardJobs = []
    if (activeBoards.length) {
      try {
        const r = await fetch('/api/boards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            greenhouse: boards.greenhouse ? companies : [],
            ashby:      boards.ashby      ? ashbyCompanies : [],
            lever:      boards.lever      ? leverCompanies : [],
            keywords:   ROLE_KEYWORDS,
          }),
        })
        const data = await r.json()
        boardJobs = data.jobs ?? []
      } catch (e) {
        console.warn('boards fetch failed:', e.message)
      }
    }

    // Dedup — greenhouse > ashby > lever (priority order)
    const map = new Map()
    for (const src of ['greenhouse', 'ashby', 'lever']) {
      for (const j of boardJobs.filter(j => j.source === src)) {
        const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`
        if (!map.has(key)) map.set(key, j)
      }
    }

    // Adzuna keyword discovery — serialized, runs after primary dedup
    if (boards.adzuna) {
      const azJobs = await fetchAdzunaMode2(new Set(map.keys()), setStatus, adzunaMaxDaysOld)
      for (const j of azJobs) {
        const key = `${j.title.toLowerCase()}|${j.company.toLowerCase()}`
        if (!map.has(key)) map.set(key, j)
      }
    }

    // Store full deduped set — useEffect above applies date/US/exp filters reactively
    setRawJobs([...map.values()])
    setLoading(false)
  }

  return (
    <div>
      {/* Board toggles + recency filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { key: 'greenhouse', label: 'Greenhouse', active: '#eef2ff', activeText: '#4f46e5', activeBorder: '#c7d2fe' },
          { key: 'ashby',      label: 'Ashby',      active: '#f5f3ff', activeText: '#7c3aed', activeBorder: '#ddd6fe' },
          { key: 'lever',      label: 'Lever',      active: '#f0fdf4', activeText: '#16a34a', activeBorder: '#bbf7d0' },
          { key: 'adzuna',     label: 'Adzuna',     active: '#fff7ed', activeText: '#ea580c', activeBorder: '#fed7aa' },
        ].map(({ key, label, active, activeText, activeBorder }) => {
          const on = boards[key]
          return (
            <button
              key={key}
              onClick={() => setBoards(b => ({ ...b, [key]: !b[key] }))}
              style={{
                padding: '4px 11px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', border: `1px solid ${on ? activeBorder : COLORS.border}`,
                background: on ? active : COLORS.panel,
                color: on ? activeText : COLORS.textMuted,
                transition: 'all 0.1s',
              }}
            >
              {label}
            </button>
          )
        })}
        <span style={{ fontSize: 11, color: COLORS.textMuted, alignSelf: 'center', marginLeft: 2 }}>
          {Object.values(boards).filter(Boolean).length === 0 ? 'Select at least one board' : ''}
        </span>

        {/* Recency filter */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: 'hidden' }}>
          {[{ key: 'any', label: 'Any time' }, { key: '48h', label: '48h' }, { key: '24h', label: '24h' }].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRecency(key)}
              style={{
                padding: '4px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                border: 'none', borderRadius: 0,
                background: recency === key ? COLORS.accentSoft : 'transparent',
                color: recency === key ? COLORS.accent : COLORS.textMuted,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: usOnly ? COLORS.text : COLORS.textMuted, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={usOnly}
            onChange={e => setUsOnly(e.target.checked)}
            style={{ width: 'auto', accentColor: COLORS.accent, cursor: 'pointer' }}
          />
          US only
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: expFilter ? COLORS.text : COLORS.textMuted, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={expFilter}
            onChange={e => setExpFilter(e.target.checked)}
            style={{ width: 'auto', accentColor: COLORS.accent, cursor: 'pointer' }}
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
          style={{ ...primaryButtonStyle, padding: '7px 18px', marginLeft: 'auto', opacity: Object.values(boards).every(v => !v) ? 0.4 : 1 }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {status && !loading && (
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>{status}</div>
      )}
      {loading && (
        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 }}>{status}</div>
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
              onTrack={() => onTrack(job)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function KeywordSearch({ isTracked, onTrack }) {
  const [query, setQuery] = useState('"product manager" OR "strategy" OR "venture capital" OR "operations" OR "ai agent" OR "agentic" OR "generative ai" OR "LLM"')
  const [usOnly, setUsOnly] = useState(true)
  const [expFilter, setExpFilter] = useState(true)
  const [maxYears, setMaxYears] = useState(8)
  const [recency, setRecency] = useState('any')
  const [rawJobs, setRawJobs] = useState([])
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    if (!rawJobs.length) return
    const cutoffMs = recency === '24h' ? Date.now() - 86400000
      : recency === '48h' ? Date.now() - 172800000 : 0
    const withinCutoff = (postedAt) => {
      if (!cutoffMs || !postedAt) return true
      const ts = new Date(postedAt).getTime()
      return isNaN(ts) ? true : ts >= cutoffMs
    }
    const dated = rawJobs.filter(j => withinCutoff(j.postedAt))
    let result = usOnly ? dated.filter(j => isUS(j.location)) : dated
    let expDropped = 0
    if (expFilter) {
      const before = result.length
      result = result.filter(j => {
        const yrs = extractMaxYears(j.description)
        return yrs === null || yrs <= maxYears
      })
      expDropped = before - result.length
    }
    const nonUS = dated.length - (usOnly ? dated.filter(j => isUS(j.location)).length : dated.length)
    const parts = [`${result.length} results`]
    if (recency !== 'any') parts.push(`last ${recency}`)
    if (usOnly && nonUS) parts.push(`${nonUS} non-US hidden`)
    if (expFilter && expDropped) parts.push(`${expDropped} over ${maxYears}yr exp hidden`)
    setJobs(result)
    setStatus(parts.join(' · '))
  }, [rawJobs, recency, usOnly, expFilter, maxYears])

  async function handleSearch() {
    if (!query.trim()) return
    setLoading(true)
    setStatus('Searching…')
    setJobs([])
    setRawJobs([])
    const maxDaysOld = recency === '24h' ? 1 : recency === '48h' ? 2 : 7
    try {
      const results = await fetchAdzunaKeyword(query.trim(), maxDaysOld)
      setRawJobs(results)
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Keywords, e.g. product manager"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          style={{ ...primaryButtonStyle, opacity: query.trim() ? 1 : 0.4 }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: usOnly ? COLORS.text : COLORS.textMuted, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={usOnly}
            onChange={e => setUsOnly(e.target.checked)}
            style={{ width: 'auto', accentColor: COLORS.accent, cursor: 'pointer' }}
          />
          US only
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: expFilter ? COLORS.text : COLORS.textMuted, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={expFilter}
            onChange={e => setExpFilter(e.target.checked)}
            style={{ width: 'auto', accentColor: COLORS.accent, cursor: 'pointer' }}
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

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: 'hidden' }}>
          {[{ key: 'any', label: 'Any time' }, { key: '48h', label: '48h' }, { key: '24h', label: '24h' }].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRecency(key)}
              style={{
                padding: '4px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                border: 'none', borderRadius: 0,
                background: recency === key ? COLORS.accentSoft : 'transparent',
                color: recency === key ? COLORS.accent : COLORS.textMuted,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {status && (
        <div style={{ fontSize: 12, color: loading ? COLORS.textSecondary : COLORS.textMuted, marginBottom: 12 }}>{status}</div>
      )}

      {jobs.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          {jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              tracked={isTracked(job)}
              expanded={!!expanded[job.id]}
              onToggle={() => setExpanded(e => ({ ...e, [job.id]: !e[job.id] }))}
              onTrack={() => onTrack(job)}
            />
          ))}
        </div>
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
    <div style={{ ...cardStyle, marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
        <button onClick={onToggle} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 9, padding: 0, flexShrink: 0, width: 12 }}>
          {expanded ? '▼' : '▶'}
        </button>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <a href={job.url || '#'} target="_blank" rel="noopener noreferrer"
              style={{ color: COLORS.text, fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
              {job.title}
            </a>
            <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>{job.company}</span>
            {job.location && <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{job.location}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {date && <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{date}</span>}
          <span style={{
            padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: isGH ? '#eef2ff' : isLV ? '#f0fdf4' : isAZ ? '#fff7ed' : '#f5f3ff',
            color: isGH ? '#4f46e5' : isLV ? '#16a34a' : isAZ ? '#ea580c' : '#7c3aed',
          }}>
            {isGH ? 'GH' : isLV ? 'Lever' : isAZ ? 'AZ' : 'Ashby'}
          </span>
          {tracked ? (
            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: '#dcfce7', color: '#16a34a' }}>
              Tracked
            </span>
          ) : (
            <button onClick={onTrack} style={{
              padding: '2px 8px', background: COLORS.accentSoft, color: COLORS.accent,
              border: 'none', borderRadius: 4, fontSize: 11,
            }}>
              + Track
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '8px 12px 10px 32px', color: COLORS.textSecondary, fontSize: 12, lineHeight: 1.65, borderTop: `1px solid ${COLORS.border}` }}>
          {isAZ && (
            <div style={{ fontSize: 11, color: '#ea580c', marginBottom: 6, fontStyle: 'italic' }}>
              via Adzuna aggregator — verify on company site before applying
            </div>
          )}
          {job.description
            ? job.description.slice(0, 600) + (job.description.length > 600 ? '…' : '')
            : <em style={{ color: COLORS.textMuted }}>No description</em>
          }
        </div>
      )}
    </div>
  )
}
