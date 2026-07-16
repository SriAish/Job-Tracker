// Dedup by URL first, then collapse cross-source duplicates of the same
// posting by title__company__location, keeping the higher-priority source.
// (current/fixed: the pre-v2 key was title__company only, which wrongly
// collapsed same-title roles in different offices; see DESIGN.md section 9.)

const SOURCE_PRIORITY = { greenhouse: 0, ashby: 1, lever: 2, adzuna: 3 }

function crossSourceKey(job) {
  const loc = (job.location ?? '').toLowerCase().trim()
  return `${job.title.toLowerCase().trim()}__${job.company.toLowerCase().trim()}__${loc}`
}

export function mergeJobs(arrays) {
  const flat = arrays.flat()

  const byUrl = new Map()
  const noUrl = []
  for (const job of flat) {
    if (!job.url) { noUrl.push(job); continue }
    if (!byUrl.has(job.url)) byUrl.set(job.url, job)
  }

  const byKey = new Map()
  for (const job of [...byUrl.values(), ...noUrl]) {
    const key = crossSourceKey(job)
    const existing = byKey.get(key)
    if (!existing || SOURCE_PRIORITY[job.source] < SOURCE_PRIORITY[existing.source]) {
      byKey.set(key, job)
    }
  }

  return [...byKey.values()]
}
