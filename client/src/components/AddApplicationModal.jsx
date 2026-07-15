import { useState } from 'react'
import Modal from './Modal'
import { STATUSES } from '../constants'
import { COLORS, inputStyle, primaryButtonStyle, secondaryButtonStyle } from '../theme'

const EMPTY = {
  title: '', company: '', location: '', url: '',
  status: 'Not Applied', resumeId: '',
  description: '', notes: '', source: '', appliedAt: '',
}

const field = { marginBottom: 12 }
const label = { display: 'block', fontSize: 11, color: COLORS.textSecondary, marginBottom: 4 }
const input = { ...inputStyle, width: '100%' }

export default function AddApplicationModal({ initial, resumes = [], onSave, onClose, isEdit }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial })

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.company.trim()) return
    onSave(form)
  }

  return (
    <Modal title={isEdit ? 'Edit Application' : 'Add Application'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <div style={field}>
            <label style={label}>Title *</label>
            <input style={input} value={form.title} onChange={e => set('title', e.target.value)} required />
          </div>
          <div style={field}>
            <label style={label}>Company *</label>
            <input style={input} value={form.company} onChange={e => set('company', e.target.value)} required />
          </div>
          <div style={field}>
            <label style={label}>Location</label>
            <input style={input} value={form.location} onChange={e => set('location', e.target.value)} />
          </div>
          <div style={field}>
            <label style={label}>URL</label>
            <input style={input} type="url" value={form.url} onChange={e => set('url', e.target.value)} />
          </div>
          <div style={field}>
            <label style={label}>Status</label>
            <select style={input} value={form.status} onChange={e => set('status', e.target.value)}>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
            </select>
          </div>
          <div style={field}>
            <label style={label}>Date Applied</label>
            <input style={input} type="date" value={form.appliedAt} onChange={e => set('appliedAt', e.target.value)} />
          </div>
          <div style={field}>
            <label style={label}>Source</label>
            <input style={input} value={form.source} onChange={e => set('source', e.target.value)} placeholder="e.g. Greenhouse, LinkedIn" />
          </div>
          <div style={field}>
            <label style={label}>Resume</label>
            <select style={input} value={form.resumeId} onChange={e => set('resumeId', e.target.value)}>
              <option value="">— none —</option>
              {resumes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>
        <div style={field}>
          <label style={label}>Description</label>
          <textarea style={{ ...input, height: 80, resize: 'vertical' }} value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
        <div style={field}>
          <label style={label}>Notes</label>
          <textarea style={{ ...input, height: 60, resize: 'vertical' }} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onClose} style={secondaryButtonStyle}>
            Cancel
          </button>
          <button type="submit" style={primaryButtonStyle}>
            {isEdit ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
