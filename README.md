# Job Tracker

Personal job search and tracking app. Aggregates listings from Greenhouse, Ashby, and Lever job boards, plus Adzuna keyword discovery, and sends a daily email digest via Gmail.

## Prerequisites

- Node.js 18+
- [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`
- GitHub account (for deployment)
- Adzuna API account (free) — [developer.adzuna.com](https://developer.adzuna.com/)

## Local dev setup

```bash
# 1. Install root dependencies (Vercel CLI, nodemailer, concurrently)
npm install

# 2. Install frontend dependencies
cd client && npm install && cd ..

# 3. Create .env in the project root (see .env.example)
cp .env.example .env
# Fill in values — see Environment Variables section below

# 4. Start the dev server
npm run dev
```

`npm run dev` starts the Vite frontend (port 5173) and `vercel dev` side-by-side. The Vite dev server handles the Adzuna and Ashby proxies; `vercel dev` simulates the serverless functions.

Open [http://localhost:5173](http://localhost:5173).

## Environment variables

Create a `.env` file at the project root (never commit it — it's gitignored):

```
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
EMAIL_TO=you@gmail.com

ADZUNA_APP_ID=your_app_id
ADZUNA_APP_KEY=your_app_key
```

### Gmail App Password

Google blocks plain passwords for SMTP. Use an App Password instead:

1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Sign in, then select **Mail** + **Other (custom name)** → name it "Job Tracker"
3. Copy the 16-character password and put it in `GMAIL_APP_PASSWORD`
4. Requires 2-Step Verification to be enabled on your Google account

### Adzuna API credentials

1. Sign up at [developer.adzuna.com](https://developer.adzuna.com/)
2. Create an app — the free tier allows 250 requests/day (the cron job uses ~10/run)
3. Copy **App ID** → `ADZUNA_APP_ID` and **App Key** → `ADZUNA_APP_KEY`

## GitHub → Vercel deployment

```bash
# 1. Push to GitHub
git init          # if not already a git repo
git add .
git commit -m "initial commit"
gh repo create job-tracker --private --source=. --push
# or: git remote add origin https://github.com/YOU/job-tracker.git && git push -u origin main

# 2. Link to Vercel
vercel link       # follow prompts, creates .vercel/project.json (gitignored)

# 3. First deploy
vercel --prod
```

On subsequent pushes, connect GitHub in the Vercel dashboard for automatic deploys:  
**Vercel Dashboard → Project → Settings → Git → Connect repository**

### Environment variables in Vercel dashboard

Add these under **Project → Settings → Environment Variables** (Production + Preview):

| Variable | Value |
|---|---|
| `GMAIL_USER` | your Gmail address |
| `GMAIL_APP_PASSWORD` | 16-char App Password from Google |
| `EMAIL_TO` | address to send the digest to |
| `ADZUNA_APP_ID` | from developer.adzuna.com |
| `ADZUNA_APP_KEY` | from developer.adzuna.com |

## Daily digest cron job

The digest script runs locally via cron (it is not a Vercel cron — it needs filesystem access for dedup state).

Add to your crontab (`crontab -e`):

```
0 9 * * * cd /path/to/project && node cron/jobtrack.js >> cron/jobtrack.log 2>&1
```

- Runs at 9 AM daily
- `cron/.seen-jobs.json` tracks which jobs have already been emailed (gitignored)
- `cron/jobtrack.log` captures output (gitignored via `*.log`)
- Requires `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_TO`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` in the environment or `.env` file

To run manually:

```bash
node cron/jobtrack.js
```

## Adding job board companies

Company lists are stored in `localStorage` and managed in the **Settings** tab of the app. You can also edit the defaults in `client/src/storage.js`:

- `DEFAULT_COMPANIES` — Greenhouse slugs
- `DEFAULT_ASHBY_COMPANIES` — Ashby slugs
- `DEFAULT_LEVER_COMPANIES` — Lever slugs

### Verifying a Greenhouse slug

Visit the following URL in your browser — if it returns JSON with a `jobs` array, the slug is valid:

```
https://boards-api.greenhouse.io/v1/boards/SLUG/jobs
```

Example: `https://boards-api.greenhouse.io/v1/boards/stripe/jobs`

### Verifying an Ashby slug

Visit `https://jobs.ashbyhq.com/SLUG` — if the job board loads, the slug is valid.

### Verifying a Lever slug

Visit `https://api.lever.co/v0/postings/SLUG?mode=json` — if it returns a JSON array, the slug is valid.

## Project structure

```
.
├── api/                    # Vercel serverless functions
│   ├── adzuna.js           # Adzuna proxy (adds server-side credentials)
│   ├── ashby/[slug].js     # Ashby HTML scraper proxy
│   ├── greenhouse/[slug].js
│   ├── lever/[slug].js
│   ├── save-email-config.js
│   └── send-digest.js
├── client/                 # Vite + React frontend
│   ├── src/
│   └── vite.config.js      # Dev proxies for Adzuna + Ashby
├── cron/
│   ├── jobtrack.js         # Daily digest script
│   └── config.js           # Company lists for cron
├── .env.example
└── vercel.json
```
