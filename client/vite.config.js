import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { runBoards } from '../shared/boards-core.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const rootEnvPath = join(__dir, '..', '.env')

function readRootEnv() {
  try {
    const env = {}
    for (const line of readFileSync(rootEnvPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
    return env
  } catch { return {} }
}

// Adzuna proxy: adds server-side credentials, never exposes them to the browser.
// Reads .env on every request so no restart is needed after adding credentials.
function adzunaApiPlugin() {
  return {
    name: 'adzuna-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/adzuna')) return next()

        const env = readRootEnv()
        const appId  = process.env.ADZUNA_APP_ID || env.ADZUNA_APP_ID
        const appKey = process.env.ADZUNA_APP_KEY || env.ADZUNA_APP_KEY
        if (!appId || !appKey) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ error: 'ADZUNA_APP_ID / ADZUNA_APP_KEY not set in .env' }))
        }

        const reqUrl = new URL(req.url, 'http://localhost')
        const page = reqUrl.searchParams.get('page') ?? '1'
        reqUrl.searchParams.delete('page')

        const qs = new URLSearchParams({ app_id: appId, app_key: appKey })
        for (const [k, v] of reqUrl.searchParams.entries()) qs.set(k, v)

        const adzunaUrl = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${qs}`

        try {
          const upstream = await fetch(adzunaUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
          const data = await upstream.json()
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        } catch (e) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: `Network error: ${e.message}` }))
        }
      })
    },
  }
}

// Local dev middleware: mirrors api/boards.js, same shared/boards-core.js
// logic runs in dev and prod from this step onward.
function boardsApiPlugin() {
  return {
    name: 'boards-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/boards' || req.method !== 'POST') return next()
        const body = await new Promise((resolve) => {
          let raw = ''
          req.on('data', c => { raw += c })
          req.on('end', () => { try { resolve(JSON.parse(raw)) } catch { resolve({}) } })
        })
        const { sources = [] } = body
        const result = await runBoards({ sources })
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), boardsApiPlugin(), adzunaApiPlugin()],
  resolve: {
    alias: {
      '@shared': join(__dir, '..', 'shared'),
    },
  },
})
