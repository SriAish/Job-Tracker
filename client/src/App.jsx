import { useState, useEffect } from 'react'
import { storage } from './storage'
import FindJobs from './tabs/FindJobs'
import Browse from './tabs/Browse'
import Applications from './tabs/Applications'
import Resumes from './tabs/Resumes'
import Settings from './tabs/Settings'
import { COLORS, FONTS, CSS_VARS, APP_BACKGROUND, HEADER_BACKGROUND } from './theme'

const TABS = ['Find Jobs', 'Browse', 'Applications', 'Resumes', 'Settings']

export default function App() {
  const [activeTab, setActiveTab] = useState('Find Jobs')
  const [applications, setApplications] = useState(() => storage.getApplications())
  const [resumes, setResumes] = useState(() => storage.getResumes())

  // Migration: email moved to laptop-only cron; drop the stale browser-stored config.
  // Migration: company lists moved to shared/companies.js; drop the stale per-ATS lists.
  useEffect(() => {
    localStorage.removeItem('jt_email_config')
    localStorage.removeItem('jt_companies')
    localStorage.removeItem('jt_ashby_companies')
    localStorage.removeItem('jt_lever_companies')
  }, [])

  // Migration: resumes are a metadata-only name registry; strip any stored file bytes.
  useEffect(() => {
    const stored = storage.getResumes()
    if (stored.some(r => 'data' in r)) {
      const stripped = stored.map(({ data, ...rest }) => rest)
      setResumes(stripped)
      storage.saveResumes(stripped)
    }
  }, [])

  // Retention: dismissed entries older than 90 days no longer serve their purpose; drop them.
  useEffect(() => {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000
    const current = storage.getDismissed()
    const pruned = current.filter(d => d.dismissedAt >= cutoff)
    if (pruned.length !== current.length) storage.saveDismissed(pruned)
  }, [])

  function updateApplications(apps) {
    setApplications(apps)
    storage.saveApplications(apps)
  }

  function updateResumes(res) {
    setResumes(res)
    storage.saveResumes(res)
  }

  function addApplication(form) {
    const app = { ...form, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    updateApplications([...applications, app])
  }

  return (
    <div
      className="app"
      style={{
        ...CSS_VARS,
        display: 'flex', flexDirection: 'column', minHeight: '100vh',
        background: APP_BACKGROUND,
      }}
    >
      <header
        className="drop-in"
        style={{
          background: HEADER_BACKGROUND,
          borderBottom: `1px solid ${COLORS.border}`,
          position: 'sticky', top: 0, zIndex: 10,
        }}
      >
        <div style={{
          maxWidth: 960, margin: '0 auto', padding: '0 20px',
          display: 'flex', alignItems: 'stretch', gap: 24, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 0' }}>
            <span style={{
              fontFamily: FONTS.display, fontSize: 18, fontWeight: 700,
              letterSpacing: '-0.02em', color: COLORS.text, whiteSpace: 'nowrap',
            }}>
              Job Tracker<span className="cursor-blink" style={{ color: COLORS.accent }}>_</span>
            </span>
            <span style={{
              fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textMuted,
              letterSpacing: '0.08em', whiteSpace: 'nowrap', paddingTop: 3,
            }}>
              pm · strategy · ops · applied ai
            </span>
          </div>

          <nav style={{ display: 'flex', gap: 2, marginLeft: 'auto', alignItems: 'stretch' }}>
            {TABS.map((tab, i) => {
              const active = activeTab === tab
              return (
                <button
                  key={tab}
                  className="btn"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '0 12px',
                    background: 'transparent',
                    color: active ? COLORS.accent : COLORS.textSecondary,
                    border: 'none',
                    borderBottom: active ? `2px solid ${COLORS.accent}` : '2px solid transparent',
                    cursor: 'pointer',
                    fontFamily: FONTS.mono,
                    fontSize: 11,
                    fontWeight: active ? 700 : 400,
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <span style={{
                    fontSize: 9,
                    color: active ? COLORS.accent : COLORS.textMuted,
                    fontWeight: 400,
                  }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {tab}
                </button>
              )
            })}
          </nav>
        </div>
      </header>

      <main
        className="rise"
        style={{
          flex: 1, padding: '26px 20px 48px', maxWidth: 960, width: '100%',
          margin: '0 auto', animationDelay: '140ms',
        }}
      >
        {activeTab === 'Find Jobs' && (
          <FindJobs applications={applications} resumes={resumes} onAddApplication={addApplication} />
        )}
        {activeTab === 'Browse' && <Browse />}
        {activeTab === 'Applications' && (
          <Applications applications={applications} resumes={resumes} onUpdate={updateApplications} />
        )}
        {activeTab === 'Resumes' && (
          <Resumes resumes={resumes} onUpdate={updateResumes} />
        )}
        {activeTab === 'Settings' && (
          <Settings applications={applications} />
        )}
      </main>
    </div>
  )
}
