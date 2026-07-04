module.exports = async function handler(req, res) {
  const { slug } = req.query

  try {
    const upstream = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`
    )
    if (!upstream.ok) {
      throw new Error(`Greenhouse responded with ${upstream.status}`)
    }
    const data = await upstream.json()
    res.status(200).json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
