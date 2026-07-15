export const COLORS = {
  bg: '#f8f9fc',
  panel: '#ffffff',
  border: '#e2e8f0',
  text: '#0f172a',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  accent: '#4f46e5',
  accentHover: '#4338ca',
  accentSoft: '#eef2ff',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
}

export const CARD_SHADOW = '0 1px 3px rgba(0,0,0,0.06)'

export const cardStyle = {
  background: COLORS.panel,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  boxShadow: CARD_SHADOW,
}

export const inputStyle = {
  padding: '6px 10px',
  background: COLORS.panel,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  color: COLORS.text,
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
}

export const sectionLabelStyle = {
  fontSize: 10,
  color: COLORS.textMuted,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
}

export const primaryButtonStyle = {
  padding: '7px 16px',
  background: COLORS.accent,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

export const secondaryButtonStyle = {
  padding: '7px 16px',
  background: COLORS.panel,
  color: COLORS.textSecondary,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
}
