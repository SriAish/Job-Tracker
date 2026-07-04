module.exports = async function handler(req, res) {
  const { slug } = req.query

  try {
    const upstream = await fetch(
      `https://api.lever.co/v0/postings/${slug}?mode=json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (!upstream.ok) {
      throw new Error(`Lever responded with ${upstream.status}`)
    }
    const data = await upstream.json()
    res.status(200).json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
