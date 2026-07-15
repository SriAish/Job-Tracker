import { useState, useRef } from 'react'
import { COLORS, cardStyle, inputStyle, primaryButtonStyle, sectionLabelStyle } from '../theme'

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function Resumes({ resumes, onUpdate }) {
  const [name, setName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [renamingId, setRenamingId] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const fileRef = useRef(null)

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file || !name.trim()) return
    setUploading(true)
    try {
      const data = await readAsDataURL(file)
      const resume = {
        id: crypto.randomUUID(),
        name: name.trim(),
        fileName: file.name,
        data,
        uploadedAt: new Date().toISOString(),
      }
      onUpdate([...resumes, resume])
      setName('')
      fileRef.current.value = ''
    } finally {
      setUploading(false)
    }
  }

  function download(resume) {
    const a = document.createElement('a')
    a.href = resume.data
    a.download = resume.fileName
    a.click()
  }

  function deleteResume(id) {
    onUpdate(resumes.filter(r => r.id !== id))
  }

  function startRename(r) {
    setRenamingId(r.id)
    setRenameVal(r.name)
  }

  function saveRename(id) {
    if (!renameVal.trim()) return
    onUpdate(resumes.map(r => r.id === id ? { ...r, name: renameVal.trim() } : r))
    setRenamingId(null)
  }

  return (
    <div>
      {/* Upload */}
      <div style={{ ...cardStyle, padding: 16, marginBottom: 24 }}>
        <div style={{ ...sectionLabelStyle, marginBottom: 12 }}>
          Upload Resume
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 11, color: COLORS.textSecondary, marginBottom: 4 }}>Label</div>
            <input
              style={{ ...inputStyle, width: '100%' }}
              placeholder="e.g. PM Resume v2"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 11, color: COLORS.textSecondary, marginBottom: 4 }}>File (PDF, DOC, DOCX)</div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx"
              style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
            />
          </div>
          <button
            onClick={handleUpload}
            disabled={uploading || !name.trim()}
            style={{ ...primaryButtonStyle, flexShrink: 0, opacity: name.trim() ? 1 : 0.6 }}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>

      {/* List */}
      {resumes.length === 0 && (
        <div style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No resumes uploaded yet.</div>
      )}

      {resumes.map(r => (
        <div key={r.id} style={{ ...cardStyle, padding: '10px 14px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {renamingId === r.id ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  style={{ ...inputStyle, fontSize: 13 }}
                  value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveRename(r.id); if (e.key === 'Escape') setRenamingId(null) }}
                  autoFocus
                />
                <button onClick={() => saveRename(r.id)} style={{ padding: '4px 10px', background: COLORS.accent, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12 }}>Save</button>
                <button onClick={() => setRenamingId(null)} style={{ padding: '4px 10px', background: COLORS.panel, color: COLORS.textSecondary, border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 12 }}>Cancel</button>
              </div>
            ) : (
              <>
                <span style={{ color: COLORS.text, fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                <span style={{ color: COLORS.textMuted, fontSize: 11, marginLeft: 8 }}>{r.fileName}</span>
              </>
            )}
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
              {new Date(r.uploadedAt).toLocaleDateString()}
            </div>
          </div>
          {renamingId !== r.id && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <SmBtn onClick={() => startRename(r)}>Rename</SmBtn>
              <SmBtn onClick={() => download(r)}>Download</SmBtn>
              <SmBtn danger onClick={() => deleteResume(r.id)}>Delete</SmBtn>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function SmBtn({ onClick, children, danger }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
      background: danger ? COLORS.dangerSoft : COLORS.panel,
      color: danger ? COLORS.danger : COLORS.textSecondary,
      border: danger ? 'none' : `1px solid ${COLORS.border}`,
    }}>
      {children}
    </button>
  )
}
