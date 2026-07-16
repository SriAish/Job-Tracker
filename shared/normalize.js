// Per-source normalizers producing the canonical job shape:
// {title, company, location, url, postedAt, description, source}
// postedAt is epoch milliseconds (or null if the source gave no usable date).

function stripHtml(html) {
  return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function toEpochMs(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return value
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

export function normalizeGreenhouse(job, companyName) {
  return {
    title: job.title ?? '',
    company: companyName,
    location: job.location?.name ?? '',
    url: job.absolute_url ?? '',
    postedAt: toEpochMs(job.updated_at),
    description: stripHtml(job.content),
    source: 'greenhouse',
  }
}

export function normalizeLever(job, companyName) {
  return {
    title: job.text ?? '',
    company: companyName,
    location: job.categories?.location ?? '',
    url: job.hostedUrl ?? '',
    postedAt: toEpochMs(job.createdAt),
    description: '',
    source: 'lever',
  }
}

export function normalizeAshby(job, slug, companyName) {
  return {
    title: job.title ?? '',
    company: companyName,
    location: job.locationName?.trim() ?? '',
    url: `https://jobs.ashbyhq.com/${slug}/${job.id}`,
    postedAt: toEpochMs(job.updatedAt ?? job.publishedDate),
    description: '',
    source: 'ashby',
  }
}

export function normalizeAdzuna(job) {
  return {
    title: job.title ?? '',
    company: job.company?.display_name ?? '',
    location: adzunaLocation(job),
    url: job.redirect_url ?? '',
    postedAt: toEpochMs(job.created),
    description: job.description ?? '',
    source: 'adzuna',
  }
}

// area = ["US", "Maryland", "Montgomery County", "Rockville"]
// Build "City, State" so isUS() state-name regex matches correctly.
function adzunaLocation(job) {
  const area = job.location?.area ?? []
  const state = area[1] ?? ''
  const city = area[3] ?? area[2] ?? ''
  if (state) return city ? `${city}, ${state}` : state
  return job.location?.display_name ?? ''
}

// Ashby is a scrape, not an API: the job list is buried in a
// `window.__appData = {...}` script tag. Brace-count instead of regex
// because the JSON blob itself contains `}` inside string values.
// Exported separately so it can be unit tested against raw HTML strings.
export function parseAshbyAppData(html) {
  const marker = 'window.__appData = '
  const start = html.indexOf(marker)
  if (start === -1) {
    const err = new Error('Ashby __appData marker not found')
    err.code = 'marker_missing'
    throw err
  }
  const begin = start + marker.length
  let depth = 0
  let i = begin
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++
    else if (html[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  try {
    return JSON.parse(html.slice(begin, i + 1))
  } catch (e) {
    const err = new Error(`Ashby __appData parse failed: ${e.message}`)
    err.code = 'parse_error'
    throw err
  }
}
