module.exports = async function handler(req, res) {
  const { slug } = req.query
  try {
    const upstream = await fetch(`https://jobs.ashbyhq.com/${slug}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Ashby returned ${upstream.status}` })
    }
    const html = await upstream.text()
    const marker = 'window.__appData = '
    const start = html.indexOf(marker)
    if (start === -1) throw new Error('appData not found in page')
    const begin = start + marker.length
    let depth = 0, i = begin
    for (; i < html.length; i++) {
      if (html[i] === '{') depth++
      else if (html[i] === '}') { depth--; if (depth === 0) break }
    }
    const data = JSON.parse(html.slice(begin, i + 1))
    const jobs = (data.jobBoard?.jobPostings ?? []).filter(j => j.isListed)
    res.status(200).json({ jobs })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
