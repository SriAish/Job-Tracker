const fs = require('fs')
const path = require('path')

// Writes env vars to .env in the project root.
// Works in local dev (vercel dev). In Vercel production, the filesystem
// is read-only — set env vars via the Vercel dashboard instead.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { gmailUser = '', gmailAppPassword = '', emailTo = '' } = req.body

  const lines = [
    `GMAIL_USER=${gmailUser}`,
    `GMAIL_APP_PASSWORD=${gmailAppPassword}`,
    `EMAIL_TO=${emailTo}`,
  ].join('\n') + '\n'

  try {
    const envPath = path.join(process.cwd(), '.env')
    fs.writeFileSync(envPath, lines, 'utf8')
    res.status(200).json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
