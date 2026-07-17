// Per-source normalizers producing the canonical job shape:
// {title, company, location, url, postedAt, description, source}
// postedAt is epoch milliseconds (or null if the source gave no usable date).

// Greenhouse (and some Lever) description fields come back as entity-encoded
// HTML, e.g. "&lt;h2&gt;Who we are&lt;/h2&gt;" rather than real "<h2>" tags.
// Decode named/numeric entities first (iterating so double-encoded input
// like "&amp;lt;" resolves too), then strip real tags, then collapse
// whitespace left behind by both steps.
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ' }
const ENTITY_RE = /&(#[xX][0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|nbsp);/g

function decodeEntitiesOnce(str) {
  return str.replace(ENTITY_RE, (match, entity) => {
    if (entity[0] === '#') {
      const isHex = entity[1] === 'x' || entity[1] === 'X'
      const codePoint = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint)
    }
    return NAMED_ENTITIES[entity]
  })
}

function decodeEntities(str) {
  let current = str
  for (let i = 0; i < 5; i++) {
    const next = decodeEntitiesOnce(current)
    if (next === current) break
    current = next
  }
  return current
}

function decodeAndStripHtml(html) {
  return decodeEntities(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
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
    description: decodeAndStripHtml(job.content),
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
    description: job.descriptionPlain
      ? decodeAndStripHtml(job.descriptionPlain)
      : decodeAndStripHtml(job.description),
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
