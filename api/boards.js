module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { greenhouse = [], ashby = [], lever = [], keywords = [] } = req.body ?? {}

  const matches = title => {
    const t = (title ?? '').toLowerCase()
    return !keywords.length || keywords.some(k => t.includes(k))
  }

  const stripHtml = html =>
    (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  const [ghR, abR, lvR] = await Promise.allSettled([
    Promise.allSettled(greenhouse.map(async ({ slug, name }) => {
      const r = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
      )
      if (!r.ok) return []
      const { jobs = [] } = await r.json()
      return jobs.filter(j => matches(j.title)).map(j => ({
        id: `gh-${j.id}`, title: j.title ?? '', company: name,
        location: j.location?.name ?? '', url: j.absolute_url ?? '',
        source: 'greenhouse', description: stripHtml(j.content),
        postedAt: j.updated_at ?? '',
      }))
    })),

    Promise.allSettled(ashby.map(async ({ slug, name }) => {
      const r = await fetch(`https://jobs.ashbyhq.com/${slug}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      if (!r.ok) return []
      const html = await r.text()
      const marker = 'window.__appData = '
      const start = html.indexOf(marker)
      if (start === -1) return []
      const begin = start + marker.length
      let depth = 0, i = begin
      for (; i < html.length; i++) {
        if (html[i] === '{') depth++
        else if (html[i] === '}') { depth--; if (depth === 0) break }
      }
      try {
        const data = JSON.parse(html.slice(begin, i + 1))
        return (data.jobBoard?.jobPostings ?? [])
          .filter(j => j.isListed && matches(j.title))
          .map(j => ({
            id: `ab-${j.id}`, title: j.title ?? '', company: name,
            location: j.locationName?.trim() ?? '',
            url: `https://jobs.ashbyhq.com/${slug}/${j.id}`,
            source: 'ashby', description: '',
            postedAt: j.updatedAt ?? j.publishedDate ?? '',
          }))
      } catch { return [] }
    })),

    Promise.allSettled(lever.map(async ({ slug, name }) => {
      const r = await fetch(
        `https://api.lever.co/v0/postings/${slug}?mode=json`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      if (!r.ok) return []
      const data = await r.json()
      if (!Array.isArray(data)) return []
      return data.filter(j => matches(j.text ?? '')).map(j => ({
        id: `lv-${j.id}`, title: j.text ?? '', company: name,
        location: j.categories?.location ?? '', url: j.hostedUrl ?? '',
        source: 'lever', description: '',
        postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : '',
      }))
    })),
  ])

  const flatten = r =>
    r.status === 'fulfilled'
      ? r.value.flatMap(x => x.status === 'fulfilled' ? x.value : [])
      : []

  res.status(200).json({ jobs: [...flatten(ghR), ...flatten(abR), ...flatten(lvR)] })
}
