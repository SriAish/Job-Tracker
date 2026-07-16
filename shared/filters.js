// Filter predicates over the canonical job shape from normalize.js.
// isUS and extractMaxYears are regex heuristics over free text and will
// misclassify some listings (accepted limitation, see docs/DESIGN.md section 9).

const STATE_RE = /[,\s](al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)(\s*[,;]|\s*$)/i
const US_STATE_NAME_RE = /,\s*(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)(\s*,|\s*$)/i
const US_CITY_RE = /\b(san francisco|new york|chicago|seattle|boston|austin|denver|atlanta|miami|portland|dallas|houston|phoenix|san jose|san diego|washington|philadelphia|minneapolis|detroit|nashville|charlotte|las vegas|pittsburgh|raleigh|los angeles|brooklyn|silicon valley|bay area|sfo|nyc)\b/i

export function isUS(job) {
  const location = job.location
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

// cron/jobtrack.js never implemented a years-experience filter; this is the
// client's FindJobs.jsx implementation (the only existing copy), taken as
// canonical and adapted to operate on job.description.
export function extractMaxYears(job) {
  const text = job.description ?? ''
  const re = /(\d+)\s*(?:\+?\s*[-–to]+\s*(\d+))?\s*\+?\s*years?/gi
  let max = 0
  let found = false
  for (const m of text.matchAll(re)) {
    const a = parseInt(m[1]), b = m[2] ? parseInt(m[2]) : a
    if (a >= 1 && a <= 30) { max = Math.max(max, a, b); found = true }
  }
  return found ? max : null
}

// New in v2: parameterized time window over postedAt (epoch ms). Jobs with
// no usable postedAt are kept rather than dropped, matching the client's
// prior inline cutoff logic (missing/invalid dates never hid a result).
export function withinHours(job, hours) {
  if (!hours) return true
  if (job.postedAt == null) return true
  return job.postedAt >= Date.now() - hours * 3600000
}
