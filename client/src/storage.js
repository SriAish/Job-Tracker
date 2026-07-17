const KEYS = {
  applications:    'jt_applications',
  resumes:         'jt_resumes',
  dismissed:       'jt_dismissed',
  lastExportedAt:  'jt_last_exported_at',
}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}
function write(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch (err) {
    console.error('Failed to write to localStorage', err)
    alert('Saving failed. Your data may not persist.')
  }
}

export const storage = {
  getApplications:     () => read(KEYS.applications)   ?? [],
  saveApplications:    (v) => write(KEYS.applications, v),
  getResumes:          () => read(KEYS.resumes)         ?? [],
  saveResumes:         (v) => write(KEYS.resumes, v),
  getDismissed:        () => read(KEYS.dismissed)       ?? [],
  saveDismissed:       (v) => write(KEYS.dismissed, v),
  getLastExportedAt:   () => read(KEYS.lastExportedAt),
  saveLastExportedAt:  (v) => write(KEYS.lastExportedAt, v),
  addDismissed(url) {
    const list = storage.getDismissed().filter(d => d.url !== url)
    list.push({ url, dismissedAt: Date.now() })
    storage.saveDismissed(list)
    return list
  },
  removeDismissed(url) {
    const list = storage.getDismissed().filter(d => d.url !== url)
    storage.saveDismissed(list)
    return list
  },
}
