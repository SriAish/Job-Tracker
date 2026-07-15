import { COMPANY_PORTALS, QUICK_LINKS } from '../constants'
import { COLORS, sectionLabelStyle } from '../theme'

export default function Browse() {
  return (
    <div>
      <Section label="Company Portals">
        {COMPANY_PORTALS.map(portal => (
          <div key={portal.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${COLORS.border}` }}>
            <span style={{ width: 90, fontSize: 12, color: COLORS.textSecondary, flexShrink: 0 }}>{portal.name}</span>
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
    <section style={{ marginBottom: 28 }}>
      <div style={{ ...sectionLabelStyle, marginBottom: 10 }}>
        {label}
      </div>
      {children}
    </section>
  )
}

function LinkBtn({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{
      padding: '4px 11px', background: COLORS.panel, border: `1px solid ${COLORS.border}`,
      borderRadius: 6, color: COLORS.textSecondary, fontSize: 12, textDecoration: 'none',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </a>
  )
}
