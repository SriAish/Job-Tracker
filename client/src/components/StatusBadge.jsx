import { useState, useRef, useEffect } from 'react'
import { STATUSES, STATUS_MAP, STATUS_BG_MAP } from '../constants'
import { COLORS } from '../theme'

export default function StatusBadge({ status, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const color = STATUS_MAP[status] ?? COLORS.textSecondary
  const bg = STATUS_BG_MAP[status] ?? COLORS.border

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <span
        onClick={() => onChange && setOpen(o => !o)}
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 9999,
          fontSize: 11,
          fontWeight: 600,
          background: bg,
          color,
          cursor: onChange ? 'pointer' : 'default',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {status}
      </span>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          background: COLORS.panel,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          zIndex: 50,
          minWidth: 130,
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(15,23,42,0.12)',
        }}>
          {STATUSES.map(s => (
            <div
              key={s.value}
              onClick={() => { onChange(s.value); setOpen(false) }}
              style={{
                padding: '7px 12px',
                fontSize: 12,
                color: s.color,
                cursor: 'pointer',
                background: status === s.value ? s.bg : 'transparent',
              }}
              onMouseEnter={e => e.currentTarget.style.background = s.bg}
              onMouseLeave={e => e.currentTarget.style.background = status === s.value ? s.bg : 'transparent'}
            >
              {s.value}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
