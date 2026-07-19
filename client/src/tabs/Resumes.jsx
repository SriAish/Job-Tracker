import { useState, useRef } from 'react'
import { COLORS, FONTS, cardStyle, inputStyle, pageTitleStyle, monoMetaStyle } from '../theme'

function baseName(fileName) {
  const idx = fileName.lastIndexOf('.')
  return idx > 0 ? fileName.slice(0, idx) : fileName
}

function registerFiles(files, existingResumes) {
  const existingNames = new Set(existingResumes.map(r => r.fileName))
  const added = []
  let skippedCount = 0
  for (const file of files) {
    const fileName = file.name || 'Untitled resume'
    if (existingNames.has(fileName)) {
      skippedCount += 1
      continue
    }
    existingNames.add(fileName)
    added.push({
      id: crypto.randomUUID(),
      name: file.name ? baseName(file.name) : 'Untitled resume',
      fileName,
      uploadedAt: new Date().toISOString(),
    })
  }
  return { added, skippedCount }
}

function summarize(addedCount, skippedCount) {
  const parts = [`${addedCount} added`]
  if (skippedCount > 0) parts.push(`${skippedCount} already registered`)
  return parts.join(', ')
}

export default function Resumes({ resumes, onUpdate }) {
  const [isDragging, setIsDragging] = useState(false)
  const [message, setMessage] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const fileInputRef = useRef(null)

  function handleFiles(fileList) {
    const files = Array.from(fileList)
    if (files.length === 0) return
    const { added, skippedCount } = registerFiles(files, resumes)
    if (added.length > 0) onUpdate([...resumes, ...added])
    setMessage(summarize(added.length, skippedCount))
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  function handleInputChange(e) {
    handleFiles(e.target.files)
    e.target.value = ''
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
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={pageTitleStyle}>Resumes</h1>
        <span style={{ ...monoMetaStyle, fontSize: 10, letterSpacing: '0.08em' }}>
          name registry · files stay on your laptop
        </span>
      </div>

      {/* Registration */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          ...cardStyle,
          padding: '30px 24px',
          marginBottom: message ? 8 : 24,
          textAlign: 'center',
          cursor: 'pointer',
          borderStyle: 'dashed',
          borderWidth: 1.5,
          borderColor: isDragging ? COLORS.accent : COLORS.borderStrong,
          background: isDragging ? COLORS.accentSoft : 'transparent',
        }}
      >
        <div aria-hidden="true" style={{ fontFamily: FONTS.mono, fontSize: 15, color: isDragging ? COLORS.accent : COLORS.textMuted, letterSpacing: '0.2em', marginBottom: 10 }}>
          [+]
        </div>
        <div style={{ fontFamily: FONTS.display, fontSize: 16, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>
          Register a resume
        </div>
        <div style={{ color: COLORS.textSecondary, fontSize: 13 }}>
          Drag and drop files here, or click to browse
        </div>
        <div style={{ ...monoMetaStyle, fontSize: 10, marginTop: 8, letterSpacing: '0.05em' }}>
          names only · file bytes are never read
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          multiple
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />
      </div>

      {message && (
        <div className="fade" style={{ ...monoMetaStyle, marginBottom: 24, textAlign: 'center' }}>
          {message}
        </div>
      )}

      {/* List */}
      {resumes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div aria-hidden="true" style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.textMuted, letterSpacing: '0.3em', marginBottom: 12 }}>
            [ · · · ]
          </div>
          <div style={{ color: COLORS.textSecondary, fontSize: 13 }}>No resumes registered yet.</div>
        </div>
      )}

      {resumes.map((r, i) => (
        <div key={r.id} className={i < 15 ? 'rise' : undefined} style={{ ...cardStyle, padding: '10px 14px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10, animationDelay: `${i * 40}ms` }}>
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
                <button className="btn" onClick={() => saveRename(r.id)} style={{ padding: '4px 10px', background: COLORS.accent, color: COLORS.accentInk, border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>Save</button>
                <button className="btn" onClick={() => setRenamingId(null)} style={{ padding: '4px 10px', background: 'transparent', color: COLORS.textSecondary, border: `1px solid ${COLORS.borderStrong}`, borderRadius: 6, fontSize: 12 }}>Cancel</button>
              </div>
            ) : (
              <>
                <span style={{ color: COLORS.text, fontSize: 13, fontWeight: 600 }}>{r.name}</span>
                <span style={{ ...monoMetaStyle, fontSize: 10, marginLeft: 8 }}>{r.fileName}</span>
              </>
            )}
            <div style={{ ...monoMetaStyle, fontSize: 10, marginTop: 3 }}>
              registered {new Date(r.uploadedAt).toLocaleDateString()}
            </div>
          </div>
          {renamingId !== r.id && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <SmBtn onClick={() => startRename(r)}>Rename</SmBtn>
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
    <button className="btn" onClick={onClick} style={{
      padding: '3px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
      background: danger ? COLORS.dangerSoft : 'transparent',
      color: danger ? COLORS.danger : COLORS.textSecondary,
      border: danger ? 'none' : `1px solid ${COLORS.border}`,
    }}>
      {children}
    </button>
  )
}
