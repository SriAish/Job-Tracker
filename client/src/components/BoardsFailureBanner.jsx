import { useState } from 'react'
import { COLORS, cardStyle } from '../theme'

// True only when every requested ashby slug failed with marker_missing,
// meaning the scrape itself is broken rather than any individual board
// being down. Needs the requested slug list, not just the errors array,
// since errors alone can't tell "37 succeeded, 1 failed" from "1 requested,
// 1 failed".
export function isAshbyIntegrationBroken(errors, requestedAshbySlugs) {
  if (!requestedAshbySlugs || requestedAshbySlugs.length === 0) return false
  return requestedAshbySlugs.every(slug =>
    errors.some(e => e.source === 'ashby' && e.slug === slug && e.reason === 'marker_missing')
  )
}

export default function BoardsFailureBanner({ errors, requestedAshbySlugs }) {
  const [expanded, setExpanded] = useState(false)

  if (!errors || errors.length === 0) return null

  return (
    <div style={{ ...cardStyle, padding: '10px 14px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, color: COLORS.text }}>
          {errors.length} board{errors.length > 1 ? 's' : ''} failed
        </span>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', color: COLORS.accent, fontSize: 12, cursor: 'pointer', padding: 0 }}
        >
          {expanded ? 'Hide' : 'Details'}
        </button>
      </div>
      {isAshbyIntegrationBroken(errors, requestedAshbySlugs) && (
        <div style={{ fontSize: 12, color: COLORS.danger, marginTop: 6 }}>
          Every Ashby slug is missing its data marker. The Ashby integration itself is likely broken, not the individual boards.
        </div>
      )}
      {expanded && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
          {errors.map((e, i) => (
            <div key={`${e.source}-${e.slug}-${i}`} style={{ fontSize: 11, color: COLORS.textSecondary, padding: '2px 0' }}>
              <span style={{ fontFamily: 'monospace' }}>{e.source}/{e.slug}</span>
              {': '}{e.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
