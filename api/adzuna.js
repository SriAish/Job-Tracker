import { adzunaHttpResponse } from '../shared/adzuna-response.js'

// Thin proxy: request-to-core mapping (status/body per adzuna-core reason)
// lives in shared/adzuna-response.js so prod and the Vite dev middleware
// can't drift.
export default async function handler(req, res) {
  const { page = '1', ...params } = req.query

  const { status, body } = await adzunaHttpResponse(params, { page })
  res.status(status).json(body)
}
