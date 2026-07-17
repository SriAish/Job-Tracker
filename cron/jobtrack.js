import 'dotenv/config'

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import nodemailer from 'nodemailer'

import { runBoards } from '../shared/boards-core.js'
import { mergeJobs } from '../shared/merge.js'
import { isUS, withinHours } from '../shared/filters.js'
import { ADZUNA_KEYWORD_TERMS, ADZUNA_DAILY_BUDGET } from '../shared/constants.js'
import { greenhouse, ashby, lever } from '../shared/companies.js'
import { searchAdzuna, getAdzunaCallCount } from '../shared/adzuna-core.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEEN_FILE = path.join(__dirname, '.seen-jobs.json')
const DRY_RUN = process.argv.includes('--dry-run')
const DIGEST_WINDOW_HOURS = 48

// Tolerant load: entries are keyed by job URL. An old-format file (array of
// source ids) simply won't match any current URL, which is fine — it just
// means everything looks "new" once after the format changes.
function loadSeen() {
  let raw
  try { raw = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')) }
  catch { return new Set() }
  if (Array.isArray(raw)) return new Set(raw)
  if (raw && typeof raw === 'object') return new Set(Object.keys(raw))
  return new Set()
}

function saveSeen(seenUrls) {
  const now = new Date().toISOString()
  const obj = {}
  for (const url of seenUrls) obj[url] = now
  fs.writeFileSync(SEEN_FILE, JSON.stringify(obj, null, 2), 'utf8')
}

function dedupeCaseInsensitive(names) {
  const seen = new Set()
  const out = []
  for (const name of names) {
    const key = name.toLowerCase()
    if (!seen.has(key)) { seen.add(key); out.push(name) }
  }
  return out
}

// Mode 1 (one search per tracked company) + Mode 2 (the 8 keyword terms).
// Orchestration — which calls to make, and what to do when the budget runs
// out — lives here; shared/adzuna-core.js only does transport.
async function runAdzuna(issues) {
  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) {
    console.log('Adzuna skipped (ADZUNA_APP_ID / ADZUNA_APP_KEY not set)')
    issues.push({ source: 'adzuna', slug: null, reason: 'missing_credentials' })
    return []
  }

  const companyNames = dedupeCaseInsensitive(
    [...greenhouse, ...ashby, ...lever].map(c => c.name)
  )
  console.log(`Adzuna Mode 1: ${companyNames.length} tracked companies`)

  const projected = companyNames.length + ADZUNA_KEYWORD_TERMS.length
  const remaining = ADZUNA_DAILY_BUDGET - getAdzunaCallCount()
  if (projected > remaining) {
    console.warn(`[ALERT] Adzuna projected ${projected} calls exceeds remaining budget ${remaining}`)
    issues.push({
      source: 'adzuna',
      slug: null,
      reason: `budget_skip: projected ${projected} calls, only ${remaining} remaining`,
    })
  }

  const jobs = []

  for (const name of companyNames) {
    const { jobs: found, error } = await searchAdzuna({ company: name, max_days_old: 7, results_per_page: 50 })
    if (error) {
      if (error !== 'budget_exceeded') issues.push({ source: 'adzuna', slug: name, reason: error })
    } else {
      jobs.push(...found)
    }
  }

  console.log(`Adzuna Mode 2: ${ADZUNA_KEYWORD_TERMS.length} keyword terms`)
  for (const term of ADZUNA_KEYWORD_TERMS) {
    const { jobs: found, error } = await searchAdzuna({ title_only: term, max_days_old: 7, results_per_page: 50 })
    if (error) {
      if (error !== 'budget_exceeded') issues.push({ source: 'adzuna', slug: term, reason: error })
    } else {
      jobs.push(...found)
    }
  }

  return jobs
}

function countBySource(jobs) {
  const counts = { greenhouse: 0, ashby: 0, lever: 0, adzuna: 0 }
  for (const j of jobs) if (counts[j.source] != null) counts[j.source]++
  return counts
}

function buildIssuesHtml(issues) {
  if (!issues.length) return ''
  const rows = issues
    .map(i => `<li>[${i.source}]${i.slug ? ` ${i.slug}:` : ''} ${i.reason}</li>`)
    .join('')
  return `
    <div style="font-family:sans-serif;background:#fff5f5;border:1px solid #f5c2c2;border-radius:4px;padding:10px 14px;margin-bottom:16px">
      <strong>Issues (${issues.length})</strong>
      <ul style="margin:6px 0 0;padding-left:20px">${rows}</ul>
    </div>`
}

function buildHtml(jobs, issues) {
  const rows = jobs.map(j => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee"><a href="${j.url}">${j.title}</a></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${j.company}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${j.location}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee">${j.source}</td>
    </tr>`).join('')
  return `
    ${buildIssuesHtml(issues)}
    <h2 style="font-family:sans-serif">${jobs.length} New Jobs</h2>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:13px;width:100%">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="text-align:left;padding:6px 10px">Title</th>
          <th style="text-align:left;padding:6px 10px">Company</th>
          <th style="text-align:left;padding:6px 10px">Location</th>
          <th style="text-align:left;padding:6px 10px">Source</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

async function sendFailureEmail(err) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    })
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.EMAIL_TO,
      subject: `Job digest FAILED: ${err.message}`,
      text: err.stack ?? String(err),
    })
    console.error('Failure email sent.')
  } catch (emailErr) {
    console.error('Failed to send failure email:', emailErr.message)
  }
}

async function main() {
  console.log(`Job Tracker cron starting…${DRY_RUN ? ' (dry run)' : ''}`)

  const seen = loadSeen()
  const issues = []

  console.log('Fetching boards (greenhouse, ashby, lever)…')
  const { jobs: boardJobs, errors: boardErrors } = await runBoards({ sources: ['greenhouse', 'ashby', 'lever'] })
  issues.push(...boardErrors)

  const adzunaJobs = await runAdzuna(issues)
  console.log(`Adzuna: ${adzunaJobs.length} jobs (${getAdzunaCallCount()} calls consumed)`)

  const merged = mergeJobs([boardJobs, adzunaJobs])
  const filtered = merged.filter(j => withinHours(j, DIGEST_WINDOW_HOURS) && isUS(j))
  const newJobs = filtered.filter(j => !seen.has(j.url))

  const counts = countBySource(filtered)
  console.log(`Per-source (${DIGEST_WINDOW_HOURS}h+US): greenhouse=${counts.greenhouse} ashby=${counts.ashby} lever=${counts.lever} adzuna=${counts.adzuna}`)
  console.log(`Merged: ${merged.length} | ${DIGEST_WINDOW_HOURS}h+US: ${filtered.length} | New (unseen): ${newJobs.length} | Issues: ${issues.length}`)

  if (DRY_RUN) {
    console.log('\n--- DRY RUN: would-be digest ---')
    if (issues.length) {
      console.log('\nIssues:')
      for (const i of issues) console.log(`  [${i.source}]${i.slug ? ` ${i.slug}:` : ''} ${i.reason}`)
    }
    console.log(`\nPer-source counts: greenhouse=${counts.greenhouse} ashby=${counts.ashby} lever=${counts.lever} adzuna=${counts.adzuna}`)
    console.log(`\n${newJobs.length} new job(s):`)
    for (const j of newJobs) console.log(`  [${j.source}] ${j.title} — ${j.company} — ${j.location} — ${j.url}`)
    console.log('\nDry run complete. No email sent, no files written.')
    return
  }

  if (newJobs.length === 0) {
    console.log('No new jobs. Done.')
    return
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  })

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.EMAIL_TO,
    subject: `Job Tracker: ${newJobs.length} new job${newJobs.length > 1 ? 's' : ''}`,
    html: buildHtml(newJobs, issues),
  })
  console.log('Digest sent.')

  for (const j of newJobs) seen.add(j.url)
  saveSeen(seen)
  console.log('Done.')
}

main().catch(async err => {
  console.error(err)
  await sendFailureEmail(err)
  process.exit(1)
})
