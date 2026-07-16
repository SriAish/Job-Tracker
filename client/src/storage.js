const KEYS = {
  applications:    'jt_applications',
  resumes:         'jt_resumes',
}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}
function write(key, val) {
  localStorage.setItem(key, JSON.stringify(val))
}

export const storage = {
  getApplications:     () => read(KEYS.applications)   ?? [],
  saveApplications:    (v) => write(KEYS.applications, v),
  getResumes:          () => read(KEYS.resumes)         ?? [],
  saveResumes:         (v) => write(KEYS.resumes, v),
}
