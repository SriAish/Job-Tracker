export default async function handler(req, res) {
  const appId  = process.env.ADZUNA_APP_ID
  const appKey = process.env.ADZUNA_APP_KEY

  if (!appId || !appKey) {
    return res.status(500).json({ error: 'ADZUNA_APP_ID / ADZUNA_APP_KEY not configured in environment' })
  }

  const { page = '1', ...params } = req.query

  const qs = new URLSearchParams({ app_id: appId, app_key: appKey, ...params })
  const url = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${qs}`

  let upstream
  try {
    upstream = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  } catch (err) {
    return res.status(502).json({ error: `Network error reaching Adzuna: ${err.message}` })
  }

  if (upstream.status === 401 || upstream.status === 403) {
    const text = await upstream.text().catch(() => '')
    return res.status(upstream.status).json({
      error: `Adzuna auth failure (${upstream.status}) — check ADZUNA_APP_ID / ADZUNA_APP_KEY`,
      detail: text.slice(0, 200),
    })
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '')
    return res.status(upstream.status).json({
      error: `Adzuna HTTP ${upstream.status}`,
      detail: text.slice(0, 200),
    })
  }

  const data = await upstream.json()
  // 200 with 0 results is valid data, not an error
  res.status(200).json(data)
}
