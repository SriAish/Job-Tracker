import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { runBoards } from '../shared/boards-core.js'
import { getCachedBoards, setCachedBoards } from '../shared/boards-cache.js'
import { adzunaHttpResponse } from '../shared/adzuna-response.js'

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

// Adzuna proxy: mirrors api/adzuna.js, same shared/adzuna-response.js (and
// underneath it, shared/adzuna-core.js) logic runs in dev and prod from this
// step onward. Reads .env on every request, since vite dev (unlike vercel
// dev) never loads it into process.env, so no restart is needed after adding
// credentials.
function adzunaApiPlugin() {
  return {
    name: 'adzuna-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/adzuna')) return next()

        const env = readRootEnv()
        if (!process.env.ADZUNA_APP_ID) process.env.ADZUNA_APP_ID = env.ADZUNA_APP_ID
        if (!process.env.ADZUNA_APP_KEY) process.env.ADZUNA_APP_KEY = env.ADZUNA_APP_KEY

        const reqUrl = new URL(req.url, 'http://localhost')
        const page = reqUrl.searchParams.get('page') ?? '1'
        reqUrl.searchParams.delete('page')
        const params = Object.fromEntries(reqUrl.searchParams.entries())

        const { status, body } = await adzunaHttpResponse(params, { page })
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(body))
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
        const { sources = [], forceRefresh = false } = body

        if (!forceRefresh) {
          const cached = getCachedBoards(sources)
          if (cached) {
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify(cached))
          }
        }

        const result = await runBoards({ sources })
        setCachedBoards(sources, result)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ...result, cached: false }))
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
