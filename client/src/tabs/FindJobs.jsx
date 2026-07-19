import { useState, useCallback, useEffect, useRef } from 'react'
import AddApplicationModal from '../components/AddApplicationModal'
import BoardsFailureBanner from '../components/BoardsFailureBanner'
import { storage } from '../storage'
import { COLORS, FONTS, SOURCE_COLORS, cardStyle, primaryButtonStyle, pageTitleStyle, monoMetaStyle } from '../theme'
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

// Step 8 (measurement only): returns fetch timing and payload size alongside
// the parsed body. Reading text first and JSON.parse-ing it does not change
// the data the caller gets; it only makes the payload byte count available.
async function fetchBoards(sources, forceRefresh = false) {
  const start = performance.now()
  const r = await fetch('/api/boards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sources, forceRefresh }),
  })
  const text = await r.text()
  const fetchMs = Math.round(performance.now() - start)
  const payloadBytes = text.length
  const data = JSON.parse(text) // {jobs, errors, timings, cached, age}
  return { data, fetchMs, payloadBytes }
}

function formatCacheAge(ms) {
  const mins = Math.round(ms / 60000)
  return mins < 1 ? 'under a min ago' : `${mins} min ago`
}

// Step 8 (measurement only): logs one structured timing line per search,
// once the reactive filter effect has produced its result and the browser
// is about to paint it (rAF approximates "first render").
function logSearchTimingIfPending(searchTimingRef, pendingSearchTimingRef, filterMs, resultCount) {
  if (!pendingSearchTimingRef.current) return
  const t = searchTimingRef.current
  pendingSearchTimingRef.current = false
  requestAnimationFrame(() => {
    console.log('[search-timing]', {
      boardSourceTimings: t.sourceTimings,
      boardsFetchMs: t.fetchMs,
      boardsPayloadBytes: t.payloadBytes,
      adzunaMs: t.adzunaMs,
      mergeFilterFirstRenderMs: Math.round(performance.now() - t.dataReadyAt),
      filterMs,
      resultCount,
      wallClockMs: Math.round(performance.now() - t.searchStart),
    })
  })
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
  const [boardsCacheInfo, setBoardsCacheInfo] = useState(null) // {age} when the last boards response was cached
  const [requestedAshbySlugs, setRequestedAshbySlugs] = useState([])
  const [dismissed, setDismissed] = useState(() => storage.getDismissed())
  const [dismissedCount, setDismissedCount] = useState(0)
  const [justDismissed, setJustDismissed] = useState({}) // url -> true, transient undo-row markers
  const [showHidden, setShowHidden] = useState(false)

  // Step 8 (measurement only): carries per-search timing across the async
  // fetch phase and into the reactive filter effect so one structured line
  // can be logged per search, not per filter toggle.
  const searchTimingRef = useRef(null)
  const pendingSearchTimingRef = useRef(false)

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

  function dismissJob(url) {
    setDismissed(storage.addDismissed(url))
    setJustDismissed(u => ({ ...u, [url]: true }))
  }

  function undoDismiss(url) {
    setDismissed(storage.removeDismissed(url))
    setJustDismissed(u => {
      const next = { ...u }
      delete next[url]
      return next
    })
  }

  function restoreJob(url) {
    setDismissed(storage.removeDismissed(url))
  }

  // Re-apply display filters instantly whenever rawJobs or any filter changes.
  // No network calls; just in-memory filtering of the last fetch.
  // `jobs` keeps dismissed entries in place (ordered) so undo-row / show-hidden
  // rendering can still find them; dismissedCount drives the summary line and toggle.
  useEffect(() => {
    if (!rawJobs.length) {
      logSearchTimingIfPending(searchTimingRef, pendingSearchTimingRef, 0, 0)
      return
    }
    const filterStart = performance.now()
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
    const dismissedUrls = new Set(dismissed.map(d => d.url))
    const dCount = result.filter(j => j.url && dismissedUrls.has(j.url)).length
    const parts = [`${result.length - dCount} results`]
    if (recency !== 'any') parts.push(`last ${recency}`)
    if (usOnly && nonUS) parts.push(`${nonUS} non-US hidden`)
    if (expFilter && expDropped) parts.push(`${expDropped} over ${maxYears}yr exp hidden`)
    if (dCount) parts.push(`${dCount} dismissed hidden`)
    const filterMs = Math.round(performance.now() - filterStart)
    setJobs(result)
    setDismissedCount(dCount)
    setStatus(parts.join(' · '))
    logSearchTimingIfPending(searchTimingRef, pendingSearchTimingRef, filterMs, result.length)
  }, [rawJobs, recency, usOnly, expFilter, maxYears, dismissed])

  // The undo row is only good "until the next search or filter change" -- clear it
  // whenever the result set or any filter changes, but not when dismissed itself changes.
  useEffect(() => {
    setJustDismissed({})
  }, [rawJobs, recency, usOnly, expFilter, maxYears])

  async function handleSearch({ forceRefresh = false } = {}) {
    const searchStart = performance.now() // step 8: wall-clock start (Search click)

    setLoading(true)
    setStatus('')
    setJobs([])
    setRawJobs([])
    setBoardErrors([])
    setBoardsCacheInfo(null)
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

    let boardJobs = [], fetchMs = null, payloadBytes = null, sourceTimings = null
    let azJobs = [], adzunaMs = null

    // Boards and Adzuna fire together; Adzuna keeps its own 400ms internal pacing.
    // Board sources win dedup priority (shared/merge.js), so rendering Adzuna
    // before boards would cause visible card swaps once boards lands. Boards
    // renders the moment it settles if Adzuna is still running; whichever phase
    // settles second performs the one merged render.
    let boardsSettled = !activeBoardSources.length
    let adzunaSettled = !sources.adzuna
    let finished = false

    function finishIfBothSettled() {
      if (finished || !boardsSettled || !adzunaSettled) return
      finished = true
      const dataReadyAt = performance.now() // step 8: all responses in hand, about to merge
      searchTimingRef.current = { searchStart, dataReadyAt, fetchMs, payloadBytes, sourceTimings, adzunaMs }
      pendingSearchTimingRef.current = true
      // Store full merged set; useEffect above applies date/US/exp filters reactively
      setRawJobs(mergeJobs([boardJobs, azJobs]))
      setLoading(false)
    }

    const boardsPromise = (activeBoardSources.length
      ? fetchBoards(activeBoardSources, forceRefresh).catch(e => {
          console.warn('boards fetch failed:', e.message)
          return { data: { jobs: [], errors: [] }, fetchMs: null, payloadBytes: null }
        })
      : Promise.resolve({ data: { jobs: [], errors: [] }, fetchMs: null, payloadBytes: null })
    ).then(({ data, fetchMs: fMs, payloadBytes: pBytes }) => {
      boardJobs = data.jobs ?? []
      sourceTimings = data.timings ?? null
      fetchMs = fMs
      payloadBytes = pBytes
      setBoardErrors(data.errors ?? [])
      setBoardsCacheInfo(data.cached ? { age: data.age } : null)
      boardsSettled = true
      if (!adzunaSettled) setRawJobs(boardJobs) // render boards now, Adzuna merges in later
      finishIfBothSettled()
    })

    const adzunaStart = performance.now()
    const adzunaPromise = (sources.adzuna
      ? fetchAdzunaMode2(setStatus, adzunaMaxDaysOld)
      : Promise.resolve([])
    ).then(jobsFound => {
      azJobs = jobsFound
      adzunaMs = sources.adzuna ? Math.round(performance.now() - adzunaStart) : null
      adzunaSettled = true
      finishIfBothSettled() // no-op if boards hasn't landed yet -- holds so Adzuna never renders first
    })

    await Promise.all([boardsPromise, adzunaPromise])
  }

  const cacheBadge = boardsCacheInfo && (
    <>
      {' · results from '}{formatCacheAge(boardsCacheInfo.age)}{' '}
      <button
        className="btn"
        onClick={() => handleSearch({ forceRefresh: true })}
        style={{ background: 'none', border: 'none', color: COLORS.accent, fontFamily: FONTS.mono, fontSize: 11, cursor: 'pointer', padding: 0 }}
      >
        Refresh
      </button>
    </>
  )

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={pageTitleStyle}>Find Jobs</h1>
        <span style={{ ...monoMetaStyle, fontSize: 10, letterSpacing: '0.08em' }}>
          one sweep · four sources · dedup at merge
        </span>
      </div>

      {/* Control deck */}
      <div style={{ ...cardStyle, padding: '12px 14px', marginBottom: 18 }}>
        {/* Row 1: source pills + time filter + search */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {SOURCE_PILLS.map(({ key, label }) => {
            const on = sources[key]
            return (
              <button
                key={key}
                className="btn"
                onClick={() => toggleSource(key)}
                style={{
                  padding: '4px 11px', borderRadius: 999, fontSize: 10, fontWeight: on ? 700 : 400,
                  fontFamily: FONTS.mono, letterSpacing: '0.07em', textTransform: 'uppercase',
                  cursor: 'pointer', border: `1px solid ${on ? COLORS.accent : COLORS.borderStrong}`,
                  background: on ? COLORS.accentSoft : 'transparent',
                  color: on ? COLORS.accent : COLORS.textMuted,
                }}
              >
                {label}
              </button>
            )
          })}

          {/* Time filter */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 2, border: `1px solid ${COLORS.border}`, borderRadius: 6, overflow: 'hidden', background: COLORS.inset }}>
              {[{ key: 'any', label: 'Any time' }, { key: '48h', label: '48h' }, { key: '24h', label: '24h' }].map(({ key, label }) => (
                <button
                  key={key}
                  className="btn"
                  onClick={() => setRecency(key)}
                  style={{
                    padding: '4px 10px', fontSize: 10, fontWeight: recency === key ? 700 : 400,
                    fontFamily: FONTS.mono, letterSpacing: '0.05em', cursor: 'pointer',
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
              className="btn"
              onClick={handleSearch}
              disabled={loading || noSourceActive}
              style={{ ...primaryButtonStyle, opacity: noSourceActive ? 0.4 : 1 }}
            >
              {loading ? 'Searching…' : 'Search'}
            </button>
          </div>
        </div>

        {/* Row 2: secondary filters */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: usOnly ? COLORS.text : COLORS.textMuted, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={usOnly}
              onChange={e => setUsOnly(e.target.checked)}
              style={{ width: 'auto', accentColor: COLORS.accent, cursor: 'pointer' }}
            />
            US only
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: expFilter ? COLORS.text : COLORS.textMuted, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
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
              style={{ width: 40, padding: '2px 4px', fontSize: 12, fontFamily: FONTS.mono, textAlign: 'center', opacity: expFilter ? 1 : 0.4 }}
            />
            yrs exp
          </label>
          {dismissedCount > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: showHidden ? COLORS.text : COLORS.textMuted, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={showHidden}
                onChange={e => setShowHidden(e.target.checked)}
                style={{ width: 'auto', accentColor: COLORS.accent, cursor: 'pointer' }}
              />
              Show hidden ({dismissedCount})
            </label>
          )}
        </div>
      </div>

      {status && !loading && (
        <div style={{ ...monoMetaStyle, marginBottom: 12 }}>
          {status}
          {cacheBadge}
        </div>
      )}
      {loading && (
        <div className="fade" style={{ marginBottom: 14 }}>
          <div style={{ ...monoMetaStyle, color: COLORS.textSecondary, marginBottom: 8 }}>
            {status}
            {cacheBadge}
          </div>
          <div className="scan-track" style={{ maxWidth: 320 }}>
            <div className="scan-thumb" />
          </div>
        </div>
      )}

      <BoardsFailureBanner errors={boardErrors} requestedAshbySlugs={requestedAshbySlugs} />

      {/* Idle state: no sweep run yet */}
      {!loading && rawJobs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 0 48px' }}>
          <div aria-hidden="true" style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.textMuted, letterSpacing: '0.3em', marginBottom: 14 }}>
            [ · · · ]
          </div>
          <div style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 600, color: COLORS.text, marginBottom: 6 }}>
            Ready to sweep
          </div>
          <div style={{ ...monoMetaStyle, letterSpacing: '0.05em' }}>
            pick sources · hit Search · fresh roles land here
          </div>
        </div>
      )}

      {/* Results */}
      {jobs.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          {jobs.map((job, i) => {
            const key = jobKey(job, i)
            const isDismissed = !!job.url && dismissed.some(d => d.url === job.url)
            if (isDismissed && justDismissed[job.url]) {
              return <DismissedRow key={key} job={job} onUndo={() => undoDismiss(job.url)} />
            }
            if (isDismissed && !showHidden) return null
            return (
              <JobCard
                key={key}
                job={job}
                index={i}
                tracked={isTracked(job)}
                expanded={!!expanded[key]}
                onToggle={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}
                onTrack={() => setAddModal(job)}
                dismissed={isDismissed}
                onDismiss={() => dismissJob(job.url)}
                onRestore={() => restoreJob(job.url)}
              />
            )
          })}
        </div>
      )}

      {addModal && (
        <AddApplicationModal
          initial={{ title: addModal.title, company: addModal.company, location: addModal.location, url: addModal.url, description: addModal.description, source: addModal.source }}
          resumes={resumes}
          onSave={app => {
            onAddApplication(app)
            // AddApplicationModal already wrote the auto-dismiss entry; resync so the
            // card leaves the results with no undo row (justDismissed stays untouched).
            setDismissed(storage.getDismissed())
            setAddModal(null)
          }}
          onClose={() => setAddModal(null)}
        />
      )}
    </div>
  )
}

function DismissedRow({ job, onUndo }) {
  return (
    <div style={{ ...cardStyle, marginBottom: 6, padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ ...monoMetaStyle, letterSpacing: '0.05em' }}>dismissed</span>
      <span style={monoMetaStyle}>·</span>
      <button className="btn" onClick={onUndo} style={{ background: 'none', border: 'none', color: COLORS.accent, fontFamily: FONTS.mono, fontSize: 11, cursor: 'pointer', padding: 0 }}>
        Undo
      </button>
    </div>
  )
}

const SOURCE_TAGS = {
  greenhouse: 'GH',
  lever: 'LVR',
  adzuna: 'ADZ',
  ashby: 'ASH',
}

function JobCard({ job, index, tracked, expanded, onToggle, onTrack, dismissed, onDismiss, onRestore }) {
  const date = job.postedAt ? new Date(job.postedAt).toLocaleDateString() : ''
  const isGH = job.source === 'greenhouse'
  const isLV = job.source === 'lever'
  const isAZ = job.source === 'adzuna'
  const srcColors = SOURCE_COLORS[job.source] ?? SOURCE_COLORS.ashby

  return (
    <div
      className={index < 15 ? 'rise' : undefined}
      style={{
        ...cardStyle, marginBottom: 6, opacity: dismissed ? 0.55 : 1,
        animationDelay: index < 15 ? `${index * 30}ms` : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
        <button className="btn" onClick={onToggle} style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 9, padding: 0, flexShrink: 0, width: 12 }}>
          {expanded ? '▼' : '▶'}
        </button>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <a href={job.url || '#'} target="_blank" rel="noopener noreferrer"
              style={{ color: COLORS.text, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              {job.title}
            </a>
            <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>{job.company}</span>
            {job.location && <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{job.location}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {date && <span style={{ ...monoMetaStyle, fontSize: 10 }}>{date}</span>}
          <span style={{
            padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
            fontFamily: FONTS.mono, letterSpacing: '0.08em',
            background: srcColors.bg, color: srcColors.color,
          }}>
            {SOURCE_TAGS[job.source] ?? 'ASH'}
          </span>
          {tracked ? (
            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: COLORS.greenSoft, color: COLORS.green }}>
              Tracked
            </span>
          ) : (
            <button className="btn" onClick={onTrack} style={{
              padding: '2px 8px', background: COLORS.accentSoft, color: COLORS.accent,
              border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 600,
            }}>
              + Track
            </button>
          )}
          {job.url && (
            dismissed ? (
              <button className="btn" onClick={onRestore} style={{
                padding: '2px 8px', background: 'transparent', color: COLORS.textSecondary,
                border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 11, cursor: 'pointer',
              }}>
                Restore
              </button>
            ) : (
              <button className="btn" onClick={onDismiss} style={{
                padding: '2px 8px', background: 'transparent', color: COLORS.textMuted,
                border: `1px solid ${COLORS.border}`, borderRadius: 4, fontSize: 11, cursor: 'pointer',
              }}>
                Dismiss
              </button>
            )
          )}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '8px 12px 10px 32px', color: COLORS.textSecondary, fontSize: 12, lineHeight: 1.65, borderTop: `1px solid ${COLORS.border}`, background: COLORS.inset, borderRadius: '0 0 8px 8px' }}>
          {isAZ && (
            <div style={{ fontSize: 11, color: SOURCE_COLORS.adzuna.color, marginBottom: 6, fontStyle: 'italic' }}>
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
