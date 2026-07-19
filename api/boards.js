import { runBoards } from '../shared/boards-core.js'
import { getCachedBoards, setCachedBoards } from '../shared/boards-cache.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { sources = [], forceRefresh = false } = req.body ?? {}

  if (!forceRefresh) {
    const cached = getCachedBoards(sources)
    if (cached) return res.status(200).json(cached)
  }

  const result = await runBoards({ sources })
  setCachedBoards(sources, result)

  res.status(200).json({ ...result, cached: false })
}
