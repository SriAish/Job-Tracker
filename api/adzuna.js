import { adzunaRequest } from '../shared/adzuna-core.js'

// Thin proxy over shared/adzuna-core.js. Response shape is unchanged from
// before this rewrite: raw Adzuna JSON passthrough on success (the client
// normalizes it itself via shared/normalize.js), same error statuses/shapes
// on failure.
export default async function handler(req, res) {
  const { page = '1', ...params } = req.query

  const result = await adzunaRequest(params, { page })

  if (!result.ok) {
    if (result.reason === 'missing_credentials') {
      return res.status(500).json({ error: 'ADZUNA_APP_ID / ADZUNA_APP_KEY not configured in environment' })
    }
    if (result.reason === 'budget_exceeded') {
      return res.status(500).json({ error: 'Adzuna daily call budget reached' })
    }
    if (result.reason === 'network_error') {
      return res.status(502).json({ error: `Network error reaching Adzuna: ${result.detail}` })
    }
    if (result.reason === 'auth_failure') {
      return res.status(result.status).json({
        error: `Adzuna auth failure (${result.status}) — check ADZUNA_APP_ID / ADZUNA_APP_KEY`,
        detail: result.detail,
      })
    }
    // http_error
    return res.status(result.status).json({ error: `Adzuna HTTP ${result.status}`, detail: result.detail })
  }

  // 200 with 0 results is valid data, not an error
  res.status(200).json(result.data)
}
