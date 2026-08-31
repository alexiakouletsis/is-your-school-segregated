import { useEffect, useState } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

const SECTIONS = [
  { id: 'graph-elementary', label: 'Grades K-5' },
  { id: 'graph-68', label: 'Grades 6-8' },
  { id: 'graph-912', label: 'Grades 9-12' },
]

interface Props {
  // True once Conclusion's own dot condense-then-explode transition has
  // actually finished and its content is showing — see Conclusion.tsx's
  // onRevealed prop. Triggers the bar's one-time auto-reveal on desktop.
  // Doesn't gate anything afterward — once shown this way, 'N' is free to
  // hide/show it same as any other time.
  reachedConclusion: boolean
  // Called right before scrollToSection jumps, with the target section's
  // id — see App.tsx's skipAnimationsUpTo for why the id matters (only
  // sections before the destination should be skipped, not everything).
  onNavigate?: (id: string) => void
  // Reports the bar's own current desktop visibility back up to App.tsx,
  // which uses it to bump the persistent top-right toggle down when the
  // bar is showing (so the two don't overlap) and back to its normal spot
  // when it's hidden. Mobile always reports false here — the hamburger
  // sits in its own fixed spot below the toggle instead of pushing it,
  // and never hides once mounted, so there's nothing to react to there.
  onVisibilityChange?: (visible: boolean) => void
}

// Rendered as a sibling of ArticleSection in App.tsx, NOT nested inside it —
// ArticleSection's own wrapper has a `y` transform applied (framer motion's
// overlayY), and per the CSS spec any ancestor with a transform becomes the
// containing block for position:fixed descendants. That's the same "sticky
// doesn't perfectly pin inside the transformed wrapper" issue already
// documented elsewhere in this codebase — keeping this component outside
// that tree entirely avoids it rather than working around it.
export default function NavBar({ reachedConclusion, onNavigate, onVisibilityChange }: Props) {
  const isMobile = useIsMobile()
  const [mobileOpen, setMobileOpen] = useState(false)
  // Desktop-only concept: whether the user currently wants the bar shown.
  // 'N' flips this at ANY time — including right at the very first scroll
  // through the site, not gated behind having reached the conclusion or
  // scrolled past the landing page. reachedConclusion below only ever
  // drives the one-time automatic reveal, never gates 'N' itself.
  const [barVisible, setBarVisible] = useState(false)

  // Always active, regardless of platform — a plain, unconditional toggle.
  // Harmless on touch devices; nobody's pressing a physical key there
  // anyway, and mobile's own hamburger below ignores barVisible entirely.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'n' || e.key === 'N') {
        setBarVisible(v => !v)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // One-time auto-reveal once the conclusion's own reveal has actually
  // finished. Doesn't force it to STAY visible afterward — barVisible is
  // just regular state from here, free to toggle via 'N' like normal.
  useEffect(() => {
    if (reachedConclusion) setBarVisible(true)
  }, [reachedConclusion])

  // Desktop only — mobile's hamburger has its own fixed position below the
  // toggle and doesn't push it around, so there's nothing to report there.
  useEffect(() => {
    onVisibilityChange?.(!isMobile && barVisible)
  }, [barVisible, isMobile, onVisibilityChange])

  const scrollToSection = (id: string) => {
    onNavigate?.(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMobileOpen(false)
  }

  if (isMobile) {
    // Only appears once the user has actually reached the conclusion (not
    // as soon as curtainDone, which is what App.tsx mounts this component
    // on) — then stays permanently, since reachedConclusion never flips
    // back to false once true. Unlike desktop, there's no 'N'-key
    // toggling of this at all on mobile; it's just this one-time reveal.
    if (!reachedConclusion) return null
    return (
      <>
        <button
          onClick={() => setMobileOpen(v => !v)}
          aria-label="Open navigation"
          style={{
            position: 'fixed', top: '4rem', right: '1.5rem', zIndex: 1000,
            width: '42px', height: '42px', borderRadius: '10px',
            backgroundColor: 'rgba(250, 249, 246, 0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >
          <img src="/assets/hamburger.svg" style={{ width: '22px', height: '22px' }} />
        </button>

        {mobileOpen && (
          <div
            onClick={() => setMobileOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              // Transparent, not dark — this was both the unnecessary
              // "dark rectangle" look and, very likely, the actual cause
              // of Safari's own UI chrome darkening (it samples page
              // color near its own edges; a fully transparent catcher
              // here removes that at the source rather than trying to
              // carefully inset a dark color away from it). Still catches
              // taps outside the panel to close it — the panel's own
              // boxShadow below provides the visual separation instead.
              backgroundColor: 'transparent',
              zIndex: 998,
            }}
          />
        )}

        <div style={{
          position: 'fixed', top: 0, right: 0, height: '100%', width: '58%', maxWidth: '320px',
          backgroundColor: 'var(--color-bg)', zIndex: 999,
          boxShadow: mobileOpen ? '-2px 0 12px rgba(0,0,0,0.15)' : 'none',
          transform: mobileOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s ease',
          display: 'flex', flexDirection: 'column',
          padding: '5.5rem 1.6rem 2rem 1.6rem',
          gap: '1.8rem',
          fontFamily: "'Kiwi Maru', serif",
        }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              className="nav-link"
              onClick={() => scrollToSection(s.id)}
              style={{
                fontFamily: "'Kiwi Maru', serif", fontSize: '1.05rem',
                color: '#111', background: 'none', border: 'none', textAlign: 'left',
                padding: 0,
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </>
    )
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', zIndex: 1000,
      backgroundColor: 'var(--color-bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '1.1rem 2rem',
      borderBottom: '1px solid #111',
      fontFamily: "'Kiwi Maru', serif",
      transform: barVisible ? 'translateY(0)' : 'translateY(-100%)',
      opacity: barVisible ? 1 : 0,
      pointerEvents: barVisible ? 'auto' : 'none',
      transition: 'transform 0.4s ease, opacity 0.3s ease',
    }}>
      <span style={{ fontSize: '0.8rem', color: '#111', flexShrink: 0 }}>
        Show/hide bar by clicking 'N'
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '2.75rem' }}>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            className="nav-link"
            onClick={() => scrollToSection(s.id)}
            style={{ fontSize: '1.02rem', color: '#111', background: 'none', border: 'none' }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}