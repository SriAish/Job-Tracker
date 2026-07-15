import { useState, useEffect } from 'react'
import { storage, DEFAULT_COMPANIES, DEFAULT_ASHBY_COMPANIES, DEFAULT_LEVER_COMPANIES } from '../storage'
import { COLORS, cardStyle, inputStyle, primaryButtonStyle, secondaryButtonStyle, sectionLabelStyle } from '../theme'

const inp = { ...inputStyle }
const label = { fontSize: 11, color: COLORS.textSecondary, display: 'block', marginBottom: 4 }

function SectionHead({ children }) {
  return (
    <div style={{ ...sectionLabelStyle, marginBottom: 12, marginTop: 28 }}>
      {children}
    </div>
  )
}

export default function Settings({ applications }) {
  const [companies, setCompanies] = useState([])
  const [newSlug, setNewSlug] = useState('')
  const [newName, setNewName] = useState('')
  const [ashbyCompanies, setAshbyCompanies] = useState([])
  const [newAshbySlug, setNewAshbySlug] = useState('')
  const [newAshbyName, setNewAshbyName] = useState('')
  const [leverCompanies, setLeverCompanies] = useState([])
  const [newLeverSlug, setNewLeverSlug] = useState('')
  const [newLeverName, setNewLeverName] = useState('')
  const [emailCfg, setEmailCfg] = useState({ gmailUser: '', gmailAppPassword: '', emailTo: '' })
  const [toast, setToast] = useState('')
  const [digestStatus, setDigestStatus] = useState('')

  useEffect(() => {
    setCompanies(storage.getCompanies())
    setAshbyCompanies(storage.getAshbyCompanies())
    setLeverCompanies(storage.getLeverCompanies())
    const cfg = storage.getEmailConfig()
    setEmailCfg({ gmailUser: cfg.gmailUser ?? '', gmailAppPassword: cfg.gmailAppPassword ?? '', emailTo: cfg.emailTo ?? '' })
  }, [])

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function addCompany() {
    if (!newSlug.trim() || !newName.trim()) return
    const updated = [...companies, { slug: newSlug.trim().toLowerCase(), name: newName.trim() }]
    setCompanies(updated)
    storage.saveCompanies(updated)
    setNewSlug('')
    setNewName('')
  }

  function removeCompany(slug) {
    const updated = companies.filter(c => c.slug !== slug)
    setCompanies(updated)
    storage.saveCompanies(updated)
  }

  function resetCompanies() {
    setCompanies(DEFAULT_COMPANIES)
    storage.saveCompanies(DEFAULT_COMPANIES)
    showToast('Reset to defaults.')
  }

  function addAshbyCompany() {
    if (!newAshbySlug.trim() || !newAshbyName.trim()) return
    const updated = [...ashbyCompanies, { slug: newAshbySlug.trim().toLowerCase(), name: newAshbyName.trim() }]
    setAshbyCompanies(updated)
    storage.saveAshbyCompanies(updated)
    setNewAshbySlug('')
    setNewAshbyName('')
  }

  function removeAshbyCompany(slug) {
    const updated = ashbyCompanies.filter(c => c.slug !== slug)
    setAshbyCompanies(updated)
    storage.saveAshbyCompanies(updated)
  }

  function resetAshbyCompanies() {
    setAshbyCompanies(DEFAULT_ASHBY_COMPANIES)
    storage.saveAshbyCompanies(DEFAULT_ASHBY_COMPANIES)
    showToast('Ashby list reset to defaults.')
  }

  function addLeverCompany() {
    if (!newLeverSlug.trim() || !newLeverName.trim()) return
    const updated = [...leverCompanies, { slug: newLeverSlug.trim().toLowerCase(), name: newLeverName.trim() }]
    setLeverCompanies(updated)
    storage.saveLeverCompanies(updated)
    setNewLeverSlug('')
    setNewLeverName('')
  }

  function removeLeverCompany(slug) {
    const updated = leverCompanies.filter(c => c.slug !== slug)
    setLeverCompanies(updated)
    storage.saveLeverCompanies(updated)
  }

  function resetLeverCompanies() {
    setLeverCompanies(DEFAULT_LEVER_COMPANIES)
    storage.saveLeverCompanies(DEFAULT_LEVER_COMPANIES)
    showToast('Lever list reset to defaults.')
  }

  async function saveEmail() {
    storage.saveEmailConfig(emailCfg)
    try {
      const res = await fetch('/api/save-email-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailCfg),
      })
      const data = await res.json()
      showToast(data.ok ? 'Email settings saved.' : `Error: ${data.error}`)
    } catch {
      showToast('Saved to browser (server write failed — ok for Vercel deployments).')
    }
  }

  async function sendTestDigest() {
    setDigestStatus('Sending…')
    const recent = [...applications].sort((a, b) => new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0)).slice(0, 5)
    try {
      const res = await fetch('/api/send-digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs: recent, config: { subject: 'Job Tracker — Test Digest' } }),
      })
      const data = await res.json()
      setDigestStatus(data.ok ? 'Sent!' : `Error: ${data.error}`)
    } catch (e) {
      setDigestStatus(`Error: ${e.message}`)
    }
    setTimeout(() => setDigestStatus(''), 4000)
  }

  return (
    <div style={{ maxWidth: 620 }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: COLORS.accent, color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 13, zIndex: 200, boxShadow: '0 4px 16px rgba(15,23,42,0.15)' }}>
          {toast}
        </div>
      )}

      {/* Companies */}
      <SectionHead>Greenhouse Companies</SectionHead>
      <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', padding: '6px 12px', borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
          <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700 }}>SLUG</span>
          <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700 }}>NAME</span>
          <span />
        </div>
        {companies.map(c => (
          <div key={c.slug} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', padding: '6px 12px', borderBottom: `1px solid ${COLORS.border}`, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: COLORS.textSecondary, fontFamily: 'monospace' }}>{c.slug}</span>
            <span style={{ fontSize: 12, color: COLORS.text }}>{c.name}</span>
            <button onClick={() => removeCompany(c.slug)} style={{ padding: '2px 8px', background: COLORS.dangerSoft, color: COLORS.danger, border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
              ×
            </button>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', padding: '8px 12px', gap: 8, alignItems: 'center' }}>
          <input style={{ ...inp, fontSize: 12 }} value={newSlug} onChange={e => setNewSlug(e.target.value)} placeholder="slug" onKeyDown={e => e.key === 'Enter' && addCompany()} />
          <input style={{ ...inp, fontSize: 12 }} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Display name" onKeyDown={e => e.key === 'Enter' && addCompany()} />
          <button onClick={addCompany} style={{ padding: '5px 12px', background: COLORS.accent, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
            Add
          </button>
        </div>
      </div>
      <button onClick={resetCompanies} style={{ fontSize: 12, color: COLORS.textMuted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
        Reset to defaults
      </button>

      {/* Ashby Companies */}
      <SectionHead>Ashby Companies</SectionHead>
      <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', padding: '6px 12px', borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
          <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700 }}>SLUG</span>
          <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700 }}>NAME</span>
          <span />
        </div>
        {ashbyCompanies.map(c => (
          <div key={c.slug} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', padding: '6px 12px', borderBottom: `1px solid ${COLORS.border}`, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: COLORS.textSecondary, fontFamily: 'monospace' }}>{c.slug}</span>
            <span style={{ fontSize: 12, color: COLORS.text }}>{c.name}</span>
            <button onClick={() => removeAshbyCompany(c.slug)} style={{ padding: '2px 8px', background: COLORS.dangerSoft, color: COLORS.danger, border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>×</button>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', padding: '8px 12px', gap: 8, alignItems: 'center' }}>
          <input style={{ ...inp, fontSize: 12 }} value={newAshbySlug} onChange={e => setNewAshbySlug(e.target.value)} placeholder="slug" onKeyDown={e => e.key === 'Enter' && addAshbyCompany()} />
          <input style={{ ...inp, fontSize: 12 }} value={newAshbyName} onChange={e => setNewAshbyName(e.target.value)} placeholder="Display name" onKeyDown={e => e.key === 'Enter' && addAshbyCompany()} />
          <button onClick={addAshbyCompany} style={{ padding: '5px 12px', background: COLORS.accent, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>Add</button>
        </div>
      </div>
      <button onClick={resetAshbyCompanies} style={{ fontSize: 12, color: COLORS.textMuted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
        Reset to defaults
      </button>

      {/* Lever Companies */}
      <SectionHead>Lever Companies</SectionHead>
      <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', padding: '6px 12px', borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg }}>
          <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700 }}>SLUG</span>
          <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 700 }}>NAME</span>
          <span />
        </div>
        {leverCompanies.map(c => (
          <div key={c.slug} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', padding: '6px 12px', borderBottom: `1px solid ${COLORS.border}`, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: COLORS.textSecondary, fontFamily: 'monospace' }}>{c.slug}</span>
            <span style={{ fontSize: 12, color: COLORS.text }}>{c.name}</span>
            <button onClick={() => removeLeverCompany(c.slug)} style={{ padding: '2px 8px', background: COLORS.dangerSoft, color: COLORS.danger, border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>×</button>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', padding: '8px 12px', gap: 8, alignItems: 'center' }}>
          <input style={{ ...inp, fontSize: 12 }} value={newLeverSlug} onChange={e => setNewLeverSlug(e.target.value)} placeholder="slug" onKeyDown={e => e.key === 'Enter' && addLeverCompany()} />
          <input style={{ ...inp, fontSize: 12 }} value={newLeverName} onChange={e => setNewLeverName(e.target.value)} placeholder="Display name" onKeyDown={e => e.key === 'Enter' && addLeverCompany()} />
          <button onClick={addLeverCompany} style={{ padding: '5px 12px', background: COLORS.accent, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>Add</button>
        </div>
      </div>
      <button onClick={resetLeverCompanies} style={{ fontSize: 12, color: COLORS.textMuted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
        Reset to defaults
      </button>

      {/* Email */}
      <SectionHead>Email / Digest Settings</SectionHead>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={label}>From (Gmail address)</label>
          <input style={{ ...inp, width: '100%' }} value={emailCfg.gmailUser} onChange={e => setEmailCfg(c => ({ ...c, gmailUser: e.target.value }))} placeholder="you@gmail.com" />
        </div>
        <div>
          <label style={label}>To (recipient address)</label>
          <input style={{ ...inp, width: '100%' }} value={emailCfg.emailTo} onChange={e => setEmailCfg(c => ({ ...c, emailTo: e.target.value }))} placeholder="you@gmail.com" />
        </div>
        <div>
          <label style={label}>Gmail App Password</label>
          <input style={{ ...inp, width: '100%' }} type="password" value={emailCfg.gmailAppPassword} onChange={e => setEmailCfg(c => ({ ...c, gmailAppPassword: e.target.value }))} placeholder="xxxx xxxx xxxx xxxx" />
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>
            Get App Password at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" style={{ color: COLORS.accent }}>myaccount.google.com/apppasswords</a>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={saveEmail} style={primaryButtonStyle}>
            Save
          </button>
          <button onClick={sendTestDigest} style={secondaryButtonStyle}>
            Send Test Digest
          </button>
          {digestStatus && <span style={{ fontSize: 12, color: digestStatus.startsWith('Error') ? COLORS.danger : '#16a34a' }}>{digestStatus}</span>}
        </div>
      </div>
    </div>
  )
}
