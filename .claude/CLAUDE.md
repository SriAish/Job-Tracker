# Job Tracker

Single-user personal job-search tool. Vite + React SPA (`client/`), two Vercel serverless functions (`api/`), a laptop-only digest script (`cron/`), and a shared logic module (`shared/`). No auth, no database; user data lives in localStorage.

## Required reading, in order

1. `docs/DESIGN.md` (this is the spec; the section relevant to your step is named in the prompt)
2. The build prompt you were given. Do not build ahead of it.

The design doc is settled. Do not redesign, add features, swap libraries, or "improve" beyond the prompt's scope. If the doc and the code disagree in a way the prompt does not cover, stop and ask.

## Standing rules (apply to every step)

- ESM only. No `require`, no `module.exports` anywhere once step 2 is done.
- `shared/` is the single source of truth for source normalizers, merge/dedup, filter predicates, keyword constants, and company lists. Never reimplement or copy its logic into `client/`, `api/`, or `cron/`.
- Company lists live in `shared/companies.js` only. Never reintroduce localStorage company lists or in-app company editing.
- Errors are surfaced, not swallowed. No failure path may return an empty result indistinguishable from "no matches." Follow the `{jobs, errors}` contract in DESIGN.md section 6.
- Styling comes from `client/src/theme.js` tokens and the patterns in DESIGN.md section 8. No new colors, fonts, or CSS frameworks.
- No new dependencies without stopping to ask.
- Never fabricate values. If a constant, credential name, or data shape is not in the docs or the code, stop and ask rather than inventing one.
- Never touch `.env`, `.seen-jobs.json`, or anything gitignored. Gmail credentials must never appear in `client/` or `api/`.
- No em dashes and no double hyphens in any user-facing copy, comments, or docs you write.
- Respect the diff scope listed in the prompt. New discoveries become a report back, not extra changes.

## Verification

- Playwright is available. UI acceptance criteria must be verified in a real browser against `npm run dev`, not by typecheck or inspection alone.
- API changes: verify with real requests against the dev server.
- Cron changes: run `node cron/jobtrack.js` end to end (it is safe locally; it reads `.env` and writes `.seen-jobs.json`).
- Clean up all test data, scratch scripts, temporary routes, and background servers before reporting done. State in your summary what was verified live versus only typechecked.

## Commands

- `npm install` at root, then `cd client && npm install`
- `npm run dev` starts Vite (port 5173) alongside `vercel dev` for the API
- `node cron/jobtrack.js` runs the digest once, manually