// Instrument-panel theme: warm dark cockpit drawn from Gruvbox-family IDE
// palettes. One amber signal accent, mono glyphs for data, ivory text on
// layered charcoal. Every color, font, spacing, and motion value in the
// client lives here; components must not carry raw values of their own.

export const FONTS = {
  display: "'Bricolage Grotesque', 'Avenir Next', 'Trebuchet MS', sans-serif",
  body: "'Archivo', 'Helvetica Neue', Arial, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
}

export const COLORS = {
  bg: '#141210',
  panel: '#1e1b18',
  panelRaised: '#272320',
  inset: '#171512',
  border: '#37312a',
  borderStrong: '#4f4638',
  text: '#efe6d5',
  textSecondary: '#b5a88f',
  textMuted: '#968b78',
  accent: '#fabd2f',
  accentHover: '#ffd24d',
  accentInk: '#241b06',
  accentSoft: 'rgba(250, 189, 47, 0.13)',
  danger: '#f2594b',
  dangerSoft: 'rgba(242, 89, 75, 0.14)',
  green: '#a9b665',
  greenSoft: 'rgba(169, 182, 101, 0.15)',
  overlay: 'rgba(12, 10, 8, 0.66)',
}

// Six statuses, six clearly separated hues: steel, olive, amber, rose,
// signal red, taupe. Text sits on a low-alpha tint of its own hue.
export const STATUS_COLORS = {
  'Not Applied': { color: '#9db2c8', bg: 'rgba(157, 178, 200, 0.14)' },
  Applied: { color: '#a9b665', bg: 'rgba(169, 182, 101, 0.15)' },
  Interviewing: { color: '#fabd2f', bg: 'rgba(250, 189, 47, 0.14)' },
  Offer: { color: '#d3869b', bg: 'rgba(211, 134, 155, 0.15)' },
  Rejected: { color: '#f2594b', bg: 'rgba(242, 89, 75, 0.14)' },
  Withdrawn: { color: '#9c8e77', bg: 'rgba(156, 142, 119, 0.14)' },
}

export const SOURCE_COLORS = {
  greenhouse: { color: '#a9b665', bg: 'rgba(169, 182, 101, 0.14)' },
  lever: { color: '#7daea3', bg: 'rgba(125, 174, 163, 0.14)' },
  adzuna: { color: '#e78a4e', bg: 'rgba(231, 138, 78, 0.14)' },
  ashby: { color: '#d3869b', bg: 'rgba(211, 134, 155, 0.14)' },
}

export const MOTION = {
  fast: '120ms',
  base: '200ms',
  slow: '450ms',
  ease: 'cubic-bezier(0.23, 1, 0.32, 1)',
}

// Atmosphere for the app frame only: two faint radial washes over deep
// charcoal. Cards and lists sit on opaque panels above it.
export const APP_BACKGROUND = [
  'radial-gradient(1100px 520px at 85% -10%, rgba(250, 189, 47, 0.06), transparent 60%)',
  'radial-gradient(900px 600px at -10% 110%, rgba(125, 174, 163, 0.05), transparent 55%)',
  `linear-gradient(${COLORS.bg}, ${COLORS.bg})`,
].join(', ')

// Faint ruled columns behind the header, like an instrument bezel.
export const HEADER_BACKGROUND = [
  'repeating-linear-gradient(90deg, rgba(239, 230, 213, 0.025) 0 1px, transparent 1px 56px)',
  `linear-gradient(${COLORS.panel}, ${COLORS.panel})`,
].join(', ')

export const CARD_SHADOW = 'none'

export const cardStyle = {
  background: COLORS.panel,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
}

export const inputStyle = {
  padding: '6px 10px',
  background: COLORS.inset,
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
  fontWeight: 500,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  fontFamily: FONTS.mono,
}

export const monoMetaStyle = {
  fontFamily: FONTS.mono,
  fontSize: 11,
  color: COLORS.textMuted,
}

export const pageTitleStyle = {
  fontFamily: FONTS.display,
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: '-0.01em',
  color: COLORS.text,
  lineHeight: 1.15,
}

export const primaryButtonStyle = {
  padding: '7px 16px',
  background: COLORS.accent,
  color: COLORS.accentInk,
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
}

export const secondaryButtonStyle = {
  padding: '7px 16px',
  background: 'transparent',
  color: COLORS.textSecondary,
  border: `1px solid ${COLORS.borderStrong}`,
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
}

// Custom properties consumed by index.css (focus rings, links, inputs,
// keyframe helpers). Applied once on the app root element.
export const CSS_VARS = {
  '--bg': COLORS.bg,
  '--panel': COLORS.panel,
  '--inset': COLORS.inset,
  '--border': COLORS.border,
  '--text': COLORS.text,
  '--muted': COLORS.textMuted,
  '--accent': COLORS.accent,
  '--accent-hover': COLORS.accentHover,
  '--accent-soft': COLORS.accentSoft,
  '--font-body': FONTS.body,
  '--font-mono': FONTS.mono,
  '--ease': MOTION.ease,
}
