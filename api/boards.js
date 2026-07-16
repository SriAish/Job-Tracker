import { runBoards } from '../shared/boards-core.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { sources = [] } = req.body ?? {}
  const result = await runBoards({ sources })

  res.status(200).json(result)
}
