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

// Local dev middleware: mirrors api/boards.js — one POST fetches all boards server-side.
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
        const { greenhouse = [], ashby = [], lever = [], keywords = [] } = body
        const matches = t => !keywords.length || keywords.some(k => (t ?? '').toLowerCase().includes(k))
        const stripHtml = h => (h ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
        const [ghR, abR, lvR] = await Promise.allSettled([
          Promise.allSettled(greenhouse.map(async ({ slug, name }) => {
            const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`)
            if (!r.ok) return []
            const { jobs = [] } = await r.json()
            return jobs.filter(j => matches(j.title)).map(j => ({
              id: `gh-${j.id}`, title: j.title ?? '', company: name,
              location: j.location?.name ?? '', url: j.absolute_url ?? '',
              source: 'greenhouse', description: stripHtml(j.content), postedAt: j.updated_at ?? '',
            }))
          })),
          Promise.allSettled(ashby.map(async ({ slug, name }) => {
            const r = await fetch(`https://jobs.ashbyhq.com/${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
            if (!r.ok) return []
            const html = await r.text()
            const marker = 'window.__appData = '
            const start = html.indexOf(marker)
            if (start === -1) return []
            const begin = start + marker.length
            let depth = 0, i = begin
            for (; i < html.length; i++) {
              if (html[i] === '{') depth++
              else if (html[i] === '}') { depth--; if (depth === 0) break }
            }
            try {
              const data = JSON.parse(html.slice(begin, i + 1))
              return (data.jobBoard?.jobPostings ?? []).filter(j => j.isListed && matches(j.title)).map(j => ({
                id: `ab-${j.id}`, title: j.title ?? '', company: name,
                location: j.locationName?.trim() ?? '', url: `https://jobs.ashbyhq.com/${slug}/${j.id}`,
                source: 'ashby', description: '', postedAt: j.updatedAt ?? j.publishedDate ?? '',
              }))
            } catch { return [] }
          })),
          Promise.allSettled(lever.map(async ({ slug, name }) => {
            const r = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
            if (!r.ok) return []
            const data = await r.json()
            if (!Array.isArray(data)) return []
            return data.filter(j => matches(j.text ?? '')).map(j => ({
              id: `lv-${j.id}`, title: j.text ?? '', company: name,
              location: j.categories?.location ?? '', url: j.hostedUrl ?? '',
              source: 'lever', description: '', postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : '',
            }))
          })),
        ])
        const flatten = r => r.status === 'fulfilled'
          ? r.value.flatMap(x => x.status === 'fulfilled' ? x.value : []) : []
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ jobs: [...flatten(ghR), ...flatten(abR), ...flatten(lvR)] }))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), boardsApiPlugin(), adzunaApiPlugin()],
})
