import { useState } from 'react'
import { STATUSES } from '../constants'
import StatusBadge from '../components/StatusBadge'
import AddApplicationModal from '../components/AddApplicationModal'

const FILTERS = ['All', 'Not Applied', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Withdrawn']

function fmt(dateStr) {
  if (!dateStr) return ''
  try { return new Date(dateStr).toLocaleDateString() } catch { return dateStr }
}

export default function Applications({ applications, resumes, onUpdate }) {
  const [filter, setFilter] = useState('All')
  const [expanded, setExpanded] = useState({})
  const [editing, setEditing] = useState(null)
  const [addOpen, setAddOpen] = useState(false)

  const filtered = filter === 'All' ? applications : applications.filter(a => a.status === filter)

  const counts = {
    Total: applications.length,
    Applied: applications.filter(a => a.status === 'Applied').length,
    Interviewing: applications.filter(a => a.status === 'Interviewing').length,
    Offer: applications.filter(a => a.status === 'Offer').length,
    Rejected: applications.filter(a => a.status === 'Rejected').length,
  }

  function changeStatus(id, status) {
    onUpdate(applications.map(a => a.id === id ? { ...a, status } : a))
  }

  function deleteApp(id) {
    onUpdate(applications.filter(a => a.id !== id))
  }

  function saveEdit(updated) {
    onUpdate(applications.map(a => a.id === updated.id ? updated : a))
    setEditing(null)
  }

  function handleAdd(form) {
    const app = {
      ...form,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    onUpdate([...applications, app])
    setAddOpen(false)
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20 }}>
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} style={{
            padding: '8px 14px', background: '#0d1520', border: '1px solid #1e2e42',
            borderRadius: 5, flex: 1, textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#e0f0ff' }}>{v}</div>
            <div style={{ fontSize: 10, color: '#456', marginTop: 1 }}>{k}</div>
          </div>
        ))}
      </div>

      {/* Filter + Add */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '4px 10px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
              background: filter === f ? '#4f46e5' : 'transparent',
              color: filter === f ? '#fff' : '#7ca4c8',
              border: filter === f ? '1px solid #4f46e5' : '1px solid #1e2e42',
            }}>
              {f}
            </button>
          ))}
        </div>
        <button onClick={() => setAddOpen(true)} style={{
          padding: '5px 14px', background: '#4f46e5', color: '#fff',
          border: 'none', borderRadius: 5, fontSize: 13, fontWeight: 600,
        }}>
          + Add
        </button>
      </div>

      {filtered.length === 0 && (
        <div style={{ color: '#456', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
          No applications{filter !== 'All' ? ` with status "${filter}"` : ''}.
        </div>
      )}

      {filtered.map(app => (
        editing?.id === app.id ? (
          <EditCard
            key={app.id}
            app={editing}
            resumes={resumes}
            onSave={saveEdit}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <AppCard
            key={app.id}
            app={app}
            resumes={resumes}
            expanded={!!expanded[app.id]}
            onToggle={() => setExpanded(e => ({ ...e, [app.id]: !e[app.id] }))}
            onStatusChange={s => changeStatus(app.id, s)}
            onEdit={() => setEditing({ ...app })}
            onDelete={() => deleteApp(app.id)}
          />
        )
      ))}

      {addOpen && (
        <AddApplicationModal
          resumes={resumes}
          onSave={handleAdd}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  )
}

function AppCard({ app, resumes, expanded, onToggle, onStatusChange, onEdit, onDelete }) {
  const resume = resumes.find(r => r.id === app.resumeId)
  const date = fmt(app.appliedAt || app.createdAt)

  return (
    <div style={{ background: '#0d1520', border: '1px solid #1e2e42', borderRadius: 6, marginBottom: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
        <button onClick={onToggle} style={{ background: 'none', border: 'none', color: '#456', cursor: 'pointer', fontSize: 9, padding: 0, flexShrink: 0, width: 12 }}>
          {expanded ? '▼' : '▶'}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            {app.url
              ? <a href={app.url} target="_blank" rel="noopener noreferrer" style={{ color: '#e0f0ff', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>{app.title}</a>
              : <span style={{ color: '#e0f0ff', fontSize: 13, fontWeight: 500 }}>{app.title}</span>
            }
            <span style={{ color: '#7ca4c8', fontSize: 12 }}>{app.company}</span>
            {app.location && <span style={{ color: '#456', fontSize: 11 }}>{app.location}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <StatusBadge status={app.status} onChange={onStatusChange} />
            {resume && <span style={{ fontSize: 11, color: '#456' }}>📄 {resume.name}</span>}
            {app.source && <span style={{ fontSize: 11, color: '#456' }}>{app.source}</span>}
            {date && <span style={{ fontSize: 11, color: '#456' }}>{date}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <Btn onClick={onEdit}>Edit</Btn>
          <Btn onClick={onDelete} danger>Del</Btn>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '8px 12px 10px 32px', borderTop: '1px solid #111e2e' }}>
          {app.description && (
            <div style={{ fontSize: 12, color: '#7ca4c8', lineHeight: 1.6, marginBottom: app.notes ? 8 : 0 }}>
              {app.description}
            </div>
          )}
          {app.notes && (
            <div style={{ fontSize: 12, color: '#7ca4c8', lineHeight: 1.6 }}>
              <span style={{ color: '#456', fontWeight: 600 }}>Notes: </span>{app.notes}
            </div>
          )}
          {!app.description && !app.notes && (
            <span style={{ fontSize: 12, color: '#456' }}>No description or notes.</span>
          )}
        </div>
      )}
    </div>
  )
}

function EditCard({ app, resumes, onSave, onCancel }) {
  const [form, setForm] = useState({ ...app })
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  const inp = { padding: '5px 8px', background: '#060d16', border: '1px solid #1e2e42', borderRadius: 4, color: '#e0f0ff', fontSize: 12, fontFamily: 'inherit', outline: 'none' }

  return (
    <div style={{ background: '#0a1628', border: '1px solid #2a4a8e', borderRadius: 6, marginBottom: 5, padding: '12px 14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input style={inp} value={form.title} onChange={e => set('title', e.target.value)} placeholder="Title" />
        <input style={inp} value={form.company} onChange={e => set('company', e.target.value)} placeholder="Company" />
        <input style={inp} value={form.location} onChange={e => set('location', e.target.value)} placeholder="Location" />
        <input style={inp} value={form.url} onChange={e => set('url', e.target.value)} placeholder="URL" />
        <select style={inp} value={form.status} onChange={e => set('status', e.target.value)}>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
        </select>
        <input style={inp} type="date" value={form.appliedAt} onChange={e => set('appliedAt', e.target.value)} />
        <input style={inp} value={form.source} onChange={e => set('source', e.target.value)} placeholder="Source" />
        <select style={inp} value={form.resumeId} onChange={e => set('resumeId', e.target.value)}>
          <option value="">— no resume —</option>
          {resumes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <textarea style={{ ...inp, width: '100%', height: 60, resize: 'vertical', marginBottom: 6 }} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Description" />
      <textarea style={{ ...inp, width: '100%', height: 50, resize: 'vertical', marginBottom: 10 }} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Notes" />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn onClick={() => onSave(form)} primary>Save</Btn>
      </div>
    </div>
  )
}

function Btn({ onClick, children, danger, primary }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
      background: primary ? '#4f46e5' : danger ? '#dc262618' : 'transparent',
      color: primary ? '#fff' : danger ? '#dc2626' : '#7ca4c8',
      border: primary ? 'none' : danger ? '1px solid #dc262640' : '1px solid #1e2e42',
    }}>
      {children}
    </button>
  )
}
