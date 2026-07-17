import { storage } from './storage'

export const APP_NAME = 'job-tracker'
export const VERSION = 1

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const FIELD_CHECKS = {
  applications: (first) => (
    isPlainObject(first) && 'id' in first && 'title' in first
      ? null
      : 'The first application entry is missing an id or title.'
  ),
  resumes: (first) => (
    isPlainObject(first) && 'id' in first && 'fileName' in first
      ? null
      : 'The first resume entry is missing an id or fileName.'
  ),
  dismissed: (first) => (
    isPlainObject(first) && 'url' in first
      ? null
      : 'The first dismissed entry is missing a url.'
  ),
}

export function buildBackupEnvelope() {
  return {
    app: APP_NAME,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      applications: storage.getApplications(),
      resumes: storage.getResumes(),
      dismissed: storage.getDismissed(),
    },
  }
}

export function validateBackupEnvelope(parsed) {
  if (!isPlainObject(parsed)) {
    return { ok: false, reason: 'That file is not a job-tracker backup.' }
  }
  if (parsed.app !== APP_NAME) {
    return { ok: false, reason: 'That file is not a job-tracker backup.' }
  }
  if (parsed.version !== VERSION) {
    return { ok: false, reason: 'This backup is from a different app version.' }
  }
  if (!isPlainObject(parsed.data)) {
    return { ok: false, reason: 'Backup is missing its data section.' }
  }

  const data = parsed.data
  const result = {}
  for (const [key, checkFirst] of Object.entries(FIELD_CHECKS)) {
    if (!(key in data)) {
      result[key] = []
      continue
    }
    const value = data[key]
    if (!Array.isArray(value)) {
      return { ok: false, reason: `"${key}" in the backup is not an array.` }
    }
    if (value.length > 0) {
      const reason = checkFirst(value[0])
      if (reason) return { ok: false, reason }
    }
    result[key] = value
  }

  return { ok: true, data: result }
}
