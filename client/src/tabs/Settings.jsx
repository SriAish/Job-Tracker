import { useState, useRef } from 'react'
import { storage } from '../storage'
import { buildBackupEnvelope, validateBackupEnvelope } from '../backup'
import { COLORS, cardStyle, sectionLabelStyle, primaryButtonStyle, secondaryButtonStyle } from '../theme'

function formatExportedAt(iso) {
  if (!iso) return 'never'
  try { return new Date(iso).toLocaleString() } catch { return 'never' }
}

function backupFilename() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `jobtracker-backup-${yyyy}-${mm}-${dd}.json`
}

export default function Settings() {
  const [lastExportedAt, setLastExportedAt] = useState(() => storage.getLastExportedAt())
  const [importError, setImportError] = useState('')
  const fileInputRef = useRef(null)

  function handleExport() {
    const envelope = buildBackupEnvelope()
    const json = JSON.stringify(envelope, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = backupFilename()
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    const now = new Date().toISOString()
    storage.saveLastExportedAt(now)
    setLastExportedAt(now)
  }

  async function handleImportChange(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setImportError('')

    let text
    try {
      text = await file.text()
    } catch {
      setImportError('Could not read that file.')
      return
    }

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      setImportError('That file is not valid JSON.')
      return
    }

    const result = validateBackupEnvelope(parsed)
    if (!result.ok) {
      setImportError(result.reason)
      return
    }

    const proceed = window.confirm('This replaces all current applications, resumes, and dismissed jobs. Continue?')
    if (!proceed) return

    storage.saveApplications(result.data.applications)
    storage.saveResumes(result.data.resumes)
    storage.saveDismissed(result.data.dismissed)
    window.location.reload()
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ ...cardStyle, padding: 20 }}>
        <div style={{ ...sectionLabelStyle, marginBottom: 12 }}>Backup</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button onClick={handleExport} style={primaryButtonStyle}>Export backup</button>
          <span style={{ color: COLORS.textMuted, fontSize: 12 }}>
            Last exported: {formatExportedAt(lastExportedAt)}
          </span>
        </div>

        <div>
          <button onClick={() => fileInputRef.current?.click()} style={secondaryButtonStyle}>
            Restore from backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportChange}
          />
        </div>

        {importError && (
          <div style={{ color: COLORS.danger, fontSize: 12, marginTop: 12 }}>
            {importError}
          </div>
        )}
      </div>
    </div>
  )
}
