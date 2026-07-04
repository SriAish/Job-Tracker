import { useState } from 'react'
import { storage } from './storage'
import FindJobs from './tabs/FindJobs'
import Applications from './tabs/Applications'
import Resumes from './tabs/Resumes'
import Settings from './tabs/Settings'

const TABS = ['Find Jobs', 'Applications', 'Resumes', 'Settings']

export default function App() {
  const [activeTab, setActiveTab] = useState('Find Jobs')
  const [applications, setApplications] = useState(() => storage.getApplications())
  const [resumes, setResumes] = useState(() => storage.getResumes())

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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <nav style={{ display: 'flex', gap: 4, padding: '10px 20px', borderBottom: '1px solid #1e2e42', background: '#080e1a', position: 'sticky', top: 0, zIndex: 10 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '6px 16px',
              background: activeTab === tab ? '#1a2f5e' : 'transparent',
              color: activeTab === tab ? '#e0f0ff' : '#7ca4c8',
              border: activeTab === tab ? '1px solid #2a4a8e' : '1px solid transparent',
              borderRadius: 5,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: activeTab === tab ? 600 : 400,
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
