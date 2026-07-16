import { useState, useEffect } from 'react'
import { storage } from './storage'
import FindJobs from './tabs/FindJobs'
import Browse from './tabs/Browse'
import Applications from './tabs/Applications'
import Resumes from './tabs/Resumes'
import Settings from './tabs/Settings'
import { COLORS } from './theme'

const TABS = ['Find Jobs', 'Browse', 'Applications', 'Resumes', 'Settings']

export default function App() {
  const [activeTab, setActiveTab] = useState('Find Jobs')
  const [applications, setApplications] = useState(() => storage.getApplications())
  const [resumes, setResumes] = useState(() => storage.getResumes())

  // Migration: email moved to laptop-only cron; drop the stale browser-stored config.
  useEffect(() => {
    localStorage.removeItem('jt_email_config')
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: COLORS.bg }}>
      <nav style={{
        display: 'flex', gap: 4, padding: '0 20px', background: COLORS.panel,
        borderBottom: `1px solid ${COLORS.border}`, position: 'sticky', top: 0, zIndex: 10,
      }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '14px 4px',
              margin: '0 12px',
              background: 'transparent',
              color: activeTab === tab ? COLORS.text : COLORS.textSecondary,
              border: 'none',
              borderBottom: activeTab === tab ? `2px solid ${COLORS.accent}` : '2px solid transparent',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: activeTab === tab ? 600 : 500,
            }}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main style={{ flex: 1, padding: '24px 20px', maxWidth: 960, width: '100%', margin: '0 auto' }}>
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
