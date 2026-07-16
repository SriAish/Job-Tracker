import { useState, useCallback, useEffect } from 'react'
import AddApplicationModal from '../components/AddApplicationModal'
import BoardsFailureBanner from '../components/BoardsFailureBanner'
import { COLORS, cardStyle, primaryButtonStyle } from '../theme'
import { isUS, extractMaxYears, withinHours } from '@shared/filters.js'
import { mergeJobs } from '@shared/merge.js'
import { ROLE_KEYWORDS, ADZUNA_KEYWORD_TERMS } from '@shared/constants.js'
import { normalizeAdzuna } from '@shared/normalize.js'
import { ashby as ashbyCompanies } from '@shared/companies.js'

function matchesKeywords(text) {
  const lower = text.toLowerCase()
  return ROLE_KEYWORDS.some(kw => lower.includes(kw))
}

// ── Adzuna ────────────────────────────────────────────────────────────────────
// Fetching stays client-side (own rate-limited proxy call); normalizing the
// raw Adzuna job shape is shared logic, imported above.

const _adzunaSleep = ms => new Promise(r => setTimeout(r, ms))

// Serialize calls with 400ms gap to stay under Adzuna's ~2 req/sec rate limit.
async function callAdzuna(params) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
  )
  const res = await fetch(`/api/adzuna?${qs}`)

  if (res.status === 401 || res.status === 403) {
    throw new Error(`Adzuna auth failure (${res.status}): check ADZUNA_APP_ID / ADZUNA_APP_KEY`)
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(`Adzuna HTTP ${res.status}${d.error ? ': ' + d.error : ''}`)
  }

  const data = await res.json()
  return data.results ?? []   // 200 + empty array is valid data, not an error
}

// Mode 2 only in the frontend: keyword discovery via title_only calls.
// Mode 1 (company backstop) is cron-only: too many calls for a UI search.
async function fetchAdzunaMode2(onProgress, maxDaysOld = 7) {
  const common = { max_days_old: maxDaysOld, results_per_page: 50 }
  const results = []
  for (let i = 0; i < ADZUNA_KEYWORD_TERMS.length; i++) {
    const term = ADZUNA_KEYWORD_TERMS[i]
    onProgress(`Adzuna: searching "${term}"…`)
    try {
      const jobs = await callAdzuna({ ...common, title_only: term })
      const normalized = jobs
        .filter(j => matchesKeywords(j.title ?? ''))
        .map(normalizeAdzuna)
      results.push(...normalized)
    } catch (e) {
      console.warn(`Adzuna "${term}":`, e.message)
    }
    if (i < ADZUNA_KEYWORD_TERMS.length - 1) await _adzunaSleep(400)
  }
  return results
}

// ── Greenhouse / Ashby / Lever (shared boards endpoint) ─────────────────────────

async function fetchBoards(sources) {
  const r = await fetch('/api/boards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources }),
  })
  return r.json() // {jobs, errors}
}

// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_PILLS = [
  { key: 'greenhouse', label: 'Greenhouse' },
  { key: 'adzuna',     label: 'Adzuna' },
  { key: 'ashby',      label: 'Ashby' },
  { key: 'lever',      label: 'Lever' },
]

function jobKey(job, i) {
  return job.url || `${job.source}-${job.title}-${job.company}-${i}`
}

export default function FindJobs({ applications, resumes, onAddApplication }) {
  const [sources, setSources] = useState({ greenhouse: true, adzuna: true, ashby: true, lever: true })
  const [recency, setRecency] = useState('any') // 'any' | '48h' | '24h'
  const [usOnly, setUsOnly] = useState(true)
  const [expFilter, setExpFilter] = useState(true)
  const [maxYears, setMaxYears] = useState(8)
  const [rawJobs, setRawJobs] = useState([])   // full deduped results from last fetch
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [expanded, setExpanded] = useState({})
  const [addModal, setAddModal] = useState(null)
  const [boardErrors, setBoardErrors] = useState([])
  const [requestedAshbySlugs, setRequestedAshbySlugs] = useState([])

  const noSourceActive = !sources.greenhouse && !sources.adzuna && !sources.ashby && !sources.lever

  const isTracked = useCallback((job) =>
    applications.some(
      a => a.title.toLowerCase() === job.title.toLowerCase() &&
           a.company.toLowerCase() === job.company.toLowerCase()
    ), [applications])

  function toggleSource(key) {
    setSources(s => {
      const next = { ...s, [key]: !s[key] }
      if (!Object.values(next).some(Boolean)) return s // at least one must stay active
      return next
    })
  }

  // Re-apply display filters instantly whenever rawJobs or any filter changes.
  // No network calls; just in-memory filtering of the last fetch.
  useEffect(() => {
    if (!rawJobs.length) return
    const hours = recency === '24h' ? 24 : recency === '48h' ? 48 : 0
    const dated = rawJobs.filter(j => withinHours(j, hours))
    let result = usOnly ? dated.filter(j => isUS(j)) : dated
    let expDropped = 0
    if (expFilter) {
      const before = result.length
      result = result.filter(j => {
        const yrs = extractMaxYears(j)
        return yrs === null || yrs <= maxYears
      })
      expDropped = before - result.length
    }
    const nonUS = dated.length - (usOnly ? dated.filter(j => isUS(j)).length : dated.length)
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
    setBoardErrors([])
    setRequestedAshbySlugs([])

    const adzunaMaxDaysOld = recency === '24h' ? 1 : recency === '48h' ? 2 : 7

    const activeBoardSources = [
      sources.greenhouse && 'greenhouse',
      sources.ashby && 'ashby',
      sources.lever && 'lever',
    ].filter(Boolean)
    if (activeBoardSources.length) setStatus(`Searching ${activeBoardSources.join(', ')}…`)

    const ashbySlugs = sources.ashby ? ashbyCompanies.map(c => c.slug) : []
    setRequestedAshbySlugs(ashbySlugs)

    let boardJobs = []
    if (activeBoardSources.length) {
      const result = await fetchBoards(activeBoardSources)
        .catch(e => { console.warn('boards fetch failed:', e.message); return { jobs: [], errors: [] } })
      boardJobs = result.jobs ?? []
      setBoardErrors(result.errors ?? [])
    }

    // Adzuna keyword discovery: serialized, runs after boards (unchanged sequencing)
    let azJobs = []
    if (sources.adzuna) {
      azJobs = await fetchAdzunaMode2(setStatus, adzunaMaxDaysOld)
    }

    // Store full merged set; useEffect above applies date/US/exp filters reactively
    setRawJobs(mergeJobs([boardJobs, azJobs]))
    setLoading(false)
  }

  return (
    <div>
      {/* Row 1: source pills + time filter + search */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {SOURCE_PILLS.map(({ key, label }) => {
          const on = sources[key]
          return (
            <button
              key={key}
              onClick={() => toggleSource(key)}
              style={{
                padding: '4px 11px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', border: `1px solid ${on ? COLORS.accent : COLORS.border}`,
                background: on ? COLORS.accent : COLORS.panel,
                color: on ? '#fff' : COLORS.textMuted,
                transition: 'all 0.1s',
              }}
            >
              {label}
            </button>
          )
        })}

        {/* Time filter */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 2, border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: 'hidden' }}>
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
          <button
            onClick={handleSearch}
            disabled={loading || noSourceActive}
            style={{ ...primaryButtonStyle, opacity: noSourceActive ? 0.4 : 1 }}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {/* Row 3: secondary filters */}
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
      </div>

      {status && !loading && (
        <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 12 }}>{status}</div>
      )}
      {loading && (
        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 }}>{status}</div>
      )}

      <BoardsFailureBanner errors={boardErrors} requestedAshbySlugs={requestedAshbySlugs} />

      {/* Results */}
      {jobs.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          {jobs.map((job, i) => (
            <JobCard
              key={jobKey(job, i)}
              job={job}
              tracked={isTracked(job)}
              expanded={!!expanded[jobKey(job, i)]}
              onToggle={() => setExpanded(e => ({ ...e, [jobKey(job, i)]: !e[jobKey(job, i)] }))}
              onTrack={() => setAddModal(job)}
            />
          ))}
        </div>
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
              via Adzuna aggregator, verify on company site before applying
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
