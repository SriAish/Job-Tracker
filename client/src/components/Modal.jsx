import { COLORS, FONTS } from '../theme'

export default function Modal({ title, onClose, children, wide }) {
  return (
    <div
      className="fade"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: COLORS.overlay,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        className="pop"
        onClick={e => e.stopPropagation()}
        style={{
          background: COLORS.panelRaised,
          border: `1px solid ${COLORS.borderStrong}`,
          borderRadius: 10,
          padding: '20px 24px',
          width: '90%',
          maxWidth: wide ? 700 : 540,
          maxHeight: '88vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ color: COLORS.text, fontFamily: FONTS.display, fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>{title}</span>
          <button
            className="btn"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: COLORS.textMuted, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
