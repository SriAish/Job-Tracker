import { useState, useRef } from 'react'

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

  const inp = { padding: '6px 10px', background: '#060d16', border: '1px solid #1e2e42', borderRadius: 5, color: '#e0f0ff', fontSize: 13, fontFamily: 'inherit', outline: 'none' }

  return (
    <div>
      {/* Upload */}
      <div style={{ background: '#0d1520', border: '1px solid #1e2e42', borderRadius: 6, padding: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: '#456', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>
          Upload Resume
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 11, color: '#7ca4c8', marginBottom: 4 }}>Label</div>
            <input
              style={{ ...inp, width: '100%' }}
              placeholder="e.g. PM Resume v2"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontSize: 11, color: '#7ca4c8', marginBottom: 4 }}>File (PDF, DOC, DOCX)</div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx"
              style={{ ...inp, width: '100%', cursor: 'pointer' }}
            />
          </div>
          <button
            onClick={handleUpload}
            disabled={uploading || !name.trim()}
            style={{ padding: '6px 18px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 5, fontSize: 13, fontWeight: 600, flexShrink: 0 }}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>

      {/* List */}
      {resumes.length === 0 && (
        <div style={{ color: '#456', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No resumes uploaded yet.</div>
      )}

      {resumes.map(r => (
        <div key={r.id} style={{ background: '#0d1520', border: '1px solid #1e2e42', borderRadius: 6, padding: '10px 14px', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {renamingId === r.id ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  style={{ ...inp, fontSize: 13 }}
                  value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveRename(r.id); if (e.key === 'Escape') setRenamingId(null) }}
                  autoFocus
                />
                <button onClick={() => saveRename(r.id)} style={{ padding: '4px 10px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12 }}>Save</button>
                <button onClick={() => setRenamingId(null)} style={{ padding: '4px 10px', background: 'transparent', color: '#7ca4c8', border: '1px solid #1e2e42', borderRadius: 4, fontSize: 12 }}>Cancel</button>
              </div>
            ) : (
              <>
                <span style={{ color: '#e0f0ff', fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                <span style={{ color: '#456', fontSize: 11, marginLeft: 8 }}>{r.fileName}</span>
              </>
            )}
            <div style={{ fontSize: 11, color: '#456', marginTop: 2 }}>
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
      padding: '3px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
      background: danger ? '#dc262618' : 'transparent',
      color: danger ? '#dc2626' : '#7ca4c8',
      border: danger ? '1px solid #dc262640' : '1px solid #1e2e42',
    }}>
      {children}
    </button>
  )
}
