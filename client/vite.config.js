import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

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

// Local dev middleware: scrapes Ashby job board HTML server-side (avoids CORS).
// In production, api/ashby/[slug].js does the same thing as a Vercel function.
function ashbyApiPlugin() {
  return {
    name: 'ashby-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/ashby\/(.+)$/)
        if (!match) return next()
        const slug = match[1]
        try {
          const upstream = await fetch(`https://jobs.ashbyhq.com/${slug}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          })
          if (!upstream.ok) {
            res.statusCode = upstream.status
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ error: `Ashby ${upstream.status}` }))
          }
          const html = await upstream.text()
          const marker = 'window.__appData = '
          const start = html.indexOf(marker)
          if (start === -1) throw new Error('appData not found in page')
          const begin = start + marker.length
          let depth = 0, i = begin
          for (; i < html.length; i++) {
            if (html[i] === '{') depth++
            else if (html[i] === '}') { depth--; if (depth === 0) break }
          }
          const data = JSON.parse(html.slice(begin, i + 1))
          const jobs = (data.jobBoard?.jobPostings ?? []).filter(j => j.isListed)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ jobs }))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e.message }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), adzunaApiPlugin(), ashbyApiPlugin()],
  server: {
    proxy: {
      '/api/greenhouse': {
        target: 'https://boards-api.greenhouse.io',
        changeOrigin: true,
        rewrite: path => {
          const slug = path.replace('/api/greenhouse/', '')
          return `/v1/boards/${slug}/jobs?content=true`
        },
      },
      '/api/lever': {
        target: 'https://api.lever.co',
        changeOrigin: true,
        rewrite: path => {
          const slug = path.replace('/api/lever/', '')
          return `/v0/postings/${slug}?mode=json`
        },
      },
    },
  },
})
