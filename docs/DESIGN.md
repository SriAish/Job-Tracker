# Job Tracker Design Doc, v2

Status: settled design, pre-implementation. This document describes the target state after the v2 refactor. Where the current code differs, the difference is called out as (current). The build order in section 10 is the implementation sequence.

## 1. Overview

Job Tracker is a single-user, personal job-search tool. It aggregates open roles from four job sources into one place, tracks applications through a status pipeline, keeps a registry of resume names, and emails a daily digest of new postings. Solo project: no auth, no multi-tenant concerns. The web app deploys on Vercel; the digest runs on the owner's laptop.

The tool targets one persona: PM / strategy / ops / venture / applied-AI roles in the US, encoded in a fixed keyword list (ROLE_KEYWORDS).

## 2. Goals and Non-Goals

Goals:

- Pull fresh listings from Greenhouse, Ashby, Lever, and Adzuna without checking four career-site searches separately.
- Track applications (status, notes, resume used, source) without a spreadsheet.
- Run on free-tier infra. No database.
- Get emailed daily about new roles without opening the app.
- Survive a browser-data wipe via manual JSON backup.

Non-goals:

- Multi-user or multi-device sync. Data lives in localStorage, tied to one browser.
- Full-text search across listings. "Search" means which sources to query, not a query engine.
- Storing resume files. The app records resume names only; the files stay on the owner's laptop.
- Broad geographic or role coverage.

## 3. Architecture

```
+--------------------------+        +---------------------------+
| client/ (Vite + React)   |  HTTP  | api/ (Vercel functions)   |
| SPA, tab state in App.jsx| -----> | boards.js (batched)       |
| data in localStorage     |        | adzuna.js (proxy)         |
+--------------------------+        +---------------------------+
            |                                    |
            | imports via Vite alias             | imports
            v                                    v
        +--------------------------------------------+
        | shared/  (single source of truth)          |
        | normalizers, merge/dedup, filters,         |
        | constants, companies.js                    |
        +--------------------------------------------+
                             ^
                             | imports
        +--------------------------------------------+
        | cron/jobtrack.js  (runs on laptop only)    |
        | launchd LaunchAgent, daily 9:00 AM         |
        | fetch -> filter 48h -> dedup -> email      |
        +--------------------------------------------+
```

- Client: Vite + React SPA, no router library. App.jsx holds activeTab in useState and renders one of five tabs. App data lives in component state, hydrated from and written back to localStorage.
- API: exactly two Vercel serverless functions. `api/boards.js` batches Greenhouse, Ashby, and Lever in one call. `api/adzuna.js` proxies Adzuna with server-side credentials. (current: seven functions; save-email-config.js, send-digest.js, and the three per-slug endpoints get deleted.)
- Shared module: `shared/` at repo root, plain ESM, imported by the client (Vite alias `@shared`), by `api/boards.js`, and by the cron. Contains all source normalizers, the merge/dedup logic, filter predicates, keyword constants, and the company lists. (current: this logic exists in three or four independent copies that have drifted; see section 9 history.)
- Cron: `cron/jobtrack.js` runs only on the owner's laptop, scheduled by a macOS LaunchAgent. It is not a Vercel cron because it needs a writable disk for `.seen-jobs.json`. Email credentials live in the laptop's gitignored `.env`, never in the web app.
- Module format: ESM everywhere. Root package.json declares `"type": "module"`. (current: root, api/, and cron/ are CommonJS; client is ESM.)
- Deployment: vercel.json rewrites everything except `/api/*` to index.html, builds via `cd client && npm run build`.

## 4. Data Model

All user data lives in localStorage (`client/src/storage.js`):

| Key | Shape | Notes |
| --- | --- | --- |
| applications | `{id, title, company, location, url, status, resumeId, description, notes, source, appliedAt, createdAt}[]` | id via crypto.randomUUID() |
| resumes | `{id, name, fileName, uploadedAt}[]` | metadata only, no file bytes (current: has a base64 `data` field; a one-time migration strips it) |
| dismissed | `{url, dismissedAt}[]` | jobs hidden from Find Jobs results; entries older than 90 days pruned on app load |

Removed keys (current: exist, get deleted with migration): `companies`, `ashbyCompanies`, `leverCompanies` (company lists move to `shared/companies.js` in the repo), `emailConfig` (email moves entirely to the laptop).

Company lists: `shared/companies.js` is the single source of truth. Adding a company means editing the file and pushing, which redeploys. There is no in-app company editing. (current: cron/config.js and the Settings UI hold separate diverging copies; a company added in Settings never reaches the digest.)

Status taxonomy (constants.js) is fixed: Not Applied -> Applied -> Interviewing -> Offer / Rejected / Withdrawn, each with a badge color pair.

Export/import: a versioned JSON envelope backs up and restores everything.

```json
{
  "app": "job-tracker",
  "version": 1,
  "exportedAt": "<ISO timestamp>",
  "data": {
    "applications": [],
    "resumes": [],
    "dismissed": []
  }
}
```

Import validates the whole file before writing anything (app name, known version, expected keys, arrays with sane shapes), then replaces state wholesale after a confirm dialog. No merging. After writing, the app reloads to re-hydrate. Unknown keys in older or newer envelopes are skipped, not errors. Settings shows a `lastExportedAt` timestamp next to the export button.

Data durability: everything is still browser-local. A wipe loses anything not exported. Accepted trade for a single-user tool; the export button is the mitigation.

## 5. Core Features (by tab)

### Find Jobs

Source toggle pills (Greenhouse, Adzuna, Ashby, Lever; all on by default, at least one active), a time filter (Any / 48h / 24h), and secondary filters (US-only, max years experience). Hitting Search:

- Fires POST `/api/boards` for the active board sources and, in parallel, 8 Adzuna keyword searches through `/api/adzuna`, self-paced 400ms apart. (current: Adzuna runs serially after boards completes; the parallel change alters when calls start, not how many happen.)
- Results render incrementally: board results appear when the boards call returns, Adzuna results append when they finish.
- Merge/dedup happens once at merge time in the shared module: primary key is the posting URL; cross-source duplicates of the same posting collapse by `title__company__location` with source priority Greenhouse > Ashby > Lever > Adzuna. (current: key is `title__company`, which wrongly collapses same-title roles in different offices.)
- Time / US-only / years filters and the dismissed filter apply client-side, in-memory, on every filter change. Only Search re-hits the network.
- Each result card has a dismiss button. Dismissing hides the job (by URL) from all future results, with a brief undo affordance. A "Show hidden (n)" toggle in the filter row reveals dismissed cards with a restore button. Adding a job to Applications auto-dismisses it from results.
- If any boards failed, a non-blocking banner reports the count with the failed slugs available on expand. If every Ashby slug reports a missing `__appData` marker, the banner says the Ashby integration itself is likely broken.

Known accepted edge: a job dismissed while only Adzuna carried it will reappear if a board source later posts it under a different URL. Costs one extra click; not worth a fuzzier key.

There is no free-text search box. Searching means toggling sources.

### Browse

Static curated links: company portal search URLs and a quick-launch row. No logic.

### Applications

CRUD plus status board. Stat tiles, status filter row, inline status dropdown, edit-in-place, add/delete.

### Resumes

A name registry, not file storage. Drag-and-drop (or click to browse) captures the filename only; the file bytes are never read. Multiple files can be dropped at once. Records can be renamed and deleted. There is no download, since there is nothing stored to download. Caveat: renaming the file on disk later leaves the stored name stale; the record is a label, not a pointer.

### Settings

Export backup / restore from backup, with `lastExportedAt` shown. That is all. (current: also holds per-ATS company list management and email digest config; both sections get deleted.)

## 6. Job Source Integrations

| Source | How | Notes |
| --- | --- | --- |
| Greenhouse | `boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true` | Public API. `postedAt` maps from `updated_at`, which bumps on edits, so the time filter can occasionally resurface an edited old posting. |
| Lever | `api.lever.co/v0/postings/{slug}?mode=json` | Public API |
| Ashby | Fetch `jobs.ashbyhq.com/{slug}` HTML, brace-count parse `window.__appData` | Not an API; a scrape. Highest breakage risk. The parser lives in exactly one place: `shared/`. Parse failure is reported per slug, never swallowed. |
| Adzuna | `api.adzuna.com` search API, server-side credentials | Self-paced 400ms between calls (about 2 req/sec limit). Daily budget guard in cron: 200 calls vs Adzuna's 250. |

boards.js response contract:

```json
{ "jobs": [], "errors": [{ "source": "", "slug": "", "reason": "" }] }
```

`reason` distinguishes at minimum: HTTP failure, Ashby marker missing, parse failure. Zero matching jobs from a healthy fetch is not an error. (current: every failure path returns an empty array indistinguishable from no matches.)

boards.js keeps a module-level warm cache: key is the request signature (active sources + keywords), value is the response with a timestamp, TTL 30 minutes. Survives warm invocations, vanishes on cold start. The client can send `forceRefresh: true` to bypass.

The client no longer sends company lists in the POST body; boards.js reads `shared/companies.js` directly.

Latency: boards.js already fetches all companies fully in parallel (nested Promise.allSettled). The remaining suspected cost is payload weight from `content=true` full descriptions across roughly 100 Greenhouse boards. This is measurement-gated: instrument per-source timing server-side and fetch-vs-render timing client-side, run one search, then decide. If transfer/parse dominates, truncate descriptions server-side to about 1,500 chars (enough for the years-experience regex and a preview). Not yet decided; see build step 8.

## 7. Email Digest (laptop only)

`cron/jobtrack.js`, built on the shared module:

- Fetches all sources, filters to jobs posted within the last 48 hours, then drops anything already in `.seen-jobs.json`. The 48h window (not 24h) means one failed run costs nothing: the next run still catches yesterday's jobs and the seen file suppresses repeats.
- Digest email includes an issues section at the top when any source failed that run.
- A fatal crash sends a best-effort one-line error email before exiting non-zero. Absence of a digest therefore means "no new jobs," not "possibly broken."
- Adzuna runs both modes: Mode 1 (one search per tracked company, cron-only, too many calls for live UI) and Mode 2 (the 8 keyword searches, shared with the UI).

Scheduling: a LaunchAgent plist in `~/Library/LaunchAgents` (a reference copy lives in the repo), with:

- `StartCalendarInterval` at 9:00 AM daily. A run missed during sleep fires once on wake, coalesced. A run missed while powered off is skipped, which the 48h window absorbs.
- `ProgramArguments` uses the absolute node path (launchd has no shell PATH, no nvm).
- `WorkingDirectory` set to the repo so `.env` and `.seen-jobs.json` resolve.
- `StandardOutPath` / `StandardErrorPath` to a gitignored log file in `cron/`.
- The script sleeps 30 seconds at start so a wake-triggered run does not race Wi-Fi reconnection.

Credentials (`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_TO`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`) live in the repo root `.env`, gitignored. Adzuna keys also exist as Vercel env vars for the deployed `api/adzuna.js`. Gmail credentials exist nowhere except the laptop.

## 8. Design System

Unchanged from v1. Light SaaS aesthetic defined in `client/src/theme.js`:

- Background `#f8f9fc`, white cards with 1px `#e2e8f0` border and `0 1px 3px rgba(0,0,0,0.06)` shadow
- Text: primary `#0f172a`, secondary `#64748b`, muted `#94a3b8`
- Accent indigo `#4f46e5` for active tab underline, primary buttons, active pills
- Status badges: pastel background + saturated text pairs defined per status in constants.js
- Font: Inter via Google Fonts, falling back to system-ui
- Flat top tab bar (Find Jobs | Browse | Applications | Resumes | Settings), no sidebar

All new UI (dismiss buttons, banners, export controls, drop zone) styles from theme.js tokens. No new colors or fonts.

## 9. Known Limitations and History

Remaining, accepted:

- Browser-local data. Export is the only backup. No sync.
- Ashby is a scrape. Now centralized and loudly failing, but still a scrape.
- `isUS()` and `extractMaxYears()` are regex heuristics over free text and will misclassify some listings.
- Greenhouse `updated_at` is modification time, not posting time.
- First search of a session still costs whatever the slowest source takes; the cache only makes repeat searches fast.

Fixed in v2 (recorded because the failure modes shaped the design):

- The fetch/filter/dedup logic existed in three independent copies (client, api/boards.js, cron) plus a fourth copy of the Ashby parser and separate company lists in cron/config.js. Drift caused at least one silent regression (keyword discovery dropped from the live UI while surviving in cron). The shared module is the fix; nothing outside `shared/` may reimplement its logic.
- Resume files were stored as base64 data URLs in localStorage, on a collision course with the 5MB quota. Resumes are now metadata only.
- Saving email settings in production appeared to succeed but silently no-oped (Vercel's filesystem is read-only). The entire code path is deleted; email is laptop-only.
- Every boards failure path returned an empty array. Failures are now first-class in the response contract.

## 10. Build Order

Each step is one Claude Code session with its own prompt, diff scope, and acceptance criteria. Sequence is dependency-driven.

1. Deletions. Remove api/save-email-config.js, api/send-digest.js, the Settings email section, and the emailConfig key. Gate: verify client/vite.config.js does not route dev traffic through the per-slug endpoints, then delete api/greenhouse/[slug].js, api/lever/[slug].js, api/ashby/[slug].js.
2. ESM conversion. `"type": "module"` at root; rewrite remaining api/ and cron/ files to import/export; replace `__dirname` in the cron.
3. Shared module + boards rewrite. Create shared/ (normalizers including the Ashby parser, merge/dedup with the new keys, filter predicates with parameterized time window, ROLE_KEYWORDS, Adzuna terms, companies.js). Rewrite boards.js on it with the {jobs, errors} contract. Client consumes via Vite alias, stops POSTing company lists, drops the Settings company UI and its three localStorage keys, renders the failure banner with the Ashby canary.
4. Cron rewrite. jobtrack.js on the shared module; delete cron/config.js; 48h window + seen-file pass; digest issues section; fatal-crash error email.
5. Resumes to metadata-only. Drag-drop and browse capture filename only; multi-file drop; migration strips the data field; download feature deleted.
6. Dismissed jobs. dismissed key, filter alongside the others, dismiss with undo, show-hidden toggle with restore, 90-day prune, auto-dismiss on add-to-Applications.
7. Export/import. Envelope as specified in section 4; validate-all-before-write; replace-not-merge with confirm; reload on import; lastExportedAt in Settings. Rider: try/catch on the storage.js write path with a visible alert on failure.
8. Latency measurement. Hard stop step: add per-source timing server-side and fetch-vs-render timing client-side, run one real search, report numbers, wait for a decision on description truncation.
9. Latency fixes. Parallel Adzuna at Search click with merge-time dedup; incremental render; 30-minute warm cache with forceRefresh; truncation if step 8 says so.
10. launchd setup. Plist per section 7; reference copy in the repo; load and verify on the laptop. Runbook step more than a code step.

Baked-in defaults, veto before running the relevant step: digest at 9:00 AM (matches the current crontab line); cache TTL 30 minutes.