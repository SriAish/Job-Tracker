// Single source of truth for turning an adzuna-core result into an HTTP
// status + JSON body, so api/adzuna.js (prod) and the Vite dev middleware
// can't drift on error handling.

import { adzunaRequest } from './adzuna-core.js'

export async function adzunaHttpResponse(params, opts) {
  const result = await adzunaRequest(params, opts)

  if (!result.ok) {
    switch (result.reason) {
      case 'missing_credentials':
        return { status: 500, body: { error: 'ADZUNA_APP_ID / ADZUNA_APP_KEY not configured in environment', reason: result.reason } }
      case 'budget_exceeded':
        return { status: 500, body: { error: 'Adzuna daily call budget reached', reason: result.reason } }
      case 'timeout':
        return { status: 502, body: { error: `Adzuna request timed out: ${result.detail}`, reason: result.reason } }
      case 'network_error':
        return { status: 502, body: { error: `Network error reaching Adzuna: ${result.detail}`, reason: result.reason } }
      case 'parse_error':
        // result.status is Adzuna's real 2xx status here; the body just
        // wasn't valid JSON, so passing that status through would look
        // like success to the client.
        return { status: 502, body: { error: `Malformed response from Adzuna: ${result.detail}`, reason: result.reason } }
      case 'auth_failure':
        return {
          status: result.status,
          body: {
            error: `Adzuna auth failure (${result.status}), check ADZUNA_APP_ID / ADZUNA_APP_KEY`,
            reason: result.reason,
            detail: result.detail,
          },
        }
      case 'http_error':
        return { status: result.status, body: { error: `Adzuna HTTP ${result.status}`, reason: result.reason, detail: result.detail } }
      default:
        return { status: 502, body: { error: `Adzuna request failed: ${result.reason ?? 'unknown'}`, reason: result.reason ?? 'unknown' } }
    }
  }

  // 200 with 0 results is valid data, not an error
  return { status: 200, body: result.data }
}
