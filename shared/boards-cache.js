// Module-level warm cache for runBoards responses, shared between api/boards.js
// and the Vite dev middleware so both apply identical caching logic. Survives
// warm invocations of the same process, vanishes on cold start (Vercel) or
// dev-server restart. Key is the sorted active-sources signature.

const CACHE_TTL_MS = 30 * 60 * 1000

const cache = new Map()

function signatureFor(sources) {
  return [...(sources ?? [])].sort().join(',')
}

// Returns the cached runBoards response (with cached:true and age set) if a
// fresh entry exists for these sources, else null.
export function getCachedBoards(sources) {
  const entry = cache.get(signatureFor(sources))
  if (!entry) return null
  const age = Date.now() - entry.timestamp
  if (age > CACHE_TTL_MS) return null
  return { ...entry.response, cached: true, age }
}

// Stores the full post-truncation runBoards response for these sources.
export function setCachedBoards(sources, response) {
  cache.set(signatureFor(sources), { response, timestamp: Date.now() })
}
