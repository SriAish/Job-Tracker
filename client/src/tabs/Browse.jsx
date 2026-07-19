import { COMPANY_PORTALS, QUICK_LINKS } from '../constants'
import { COLORS, FONTS, sectionLabelStyle, pageTitleStyle, monoMetaStyle } from '../theme'

export default function Browse() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={pageTitleStyle}>Browse</h1>
        <span style={{ ...monoMetaStyle, fontSize: 10, letterSpacing: '0.08em' }}>
          curated portals · pre-baked searches · one click out
        </span>
      </div>

      <Section label="Company Portals">
        {COMPANY_PORTALS.map((portal, i) => (
          <div
            key={portal.name}
            className={i < 15 ? 'rise' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0',
              borderBottom: `1px solid ${COLORS.border}`,
              animationDelay: `${i * 40}ms`,
            }}
          >
            <span style={{
              width: 110, flexShrink: 0,
              fontFamily: FONTS.display, fontSize: 15, fontWeight: 600,
              color: COLORS.text, letterSpacing: '-0.01em',
            }}>
              {portal.name}
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {portal.links.map(link => (
                <LinkBtn key={link.label} href={link.url}>{link.label}</LinkBtn>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section label="Quick Launch">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {QUICK_LINKS.map(link => (
            <LinkBtn key={link.label} href={link.url}>{link.label}</LinkBtn>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Section({ label, children }) {
  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ ...sectionLabelStyle, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden="true" style={{ color: COLORS.accent }}>▸</span>
        {label}
      </div>
      {children}
    </section>
  )
}

function LinkBtn({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link-chip" style={{
      padding: '4px 12px', background: COLORS.panel, border: `1px solid ${COLORS.borderStrong}`,
      borderRadius: 999, color: COLORS.textSecondary, fontSize: 12, textDecoration: 'none',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </a>
  )
}
