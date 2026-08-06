import { useEffect, useRef, useState } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Mode } from '../App'
import ToggleSwitch from './ToggleSwitch'

const SECTIONS = [
  { id: 'graph-k3', label: 'Graphs K-3' },
  { id: 'graph-45', label: 'Graphs 3-5' },
  { id: 'graph-68', label: 'Graphs 6-8' },
  { id: 'graph-912', label: 'Graphs 9-12' },
]

interface Props {
  mode: Mode
  onToggleMode: () => void
  // True once the user has actually clicked Conclusion's own bottom
  // SES/Race toggle (the "start over" action) — NOT tied to Conclusion
  // merely finishing its reveal animation. The nav bar's first-ever
  // auto-reveal only happens once this is true AND the user has then
  // scrolled down from the resulting restarted landing page (see
  // navUnlocked below); it stays true for the rest of the session
  // afterward regardless of further toggles.
  hasToggledFromConclusion: boolean
  // Called right before scrollToSection jumps, with the target section's
  // id — see App.tsx's skipAnimationsUpTo for why the id matters (only
  // sections before the destination should be skipped, not everything).
  onNavigate?: (id: string) => void
}

// Rendered as a sibling of ArticleSection in App.tsx, NOT nested inside it —
// ArticleSection's own wrapper has a `y` transform applied (framer motion's
// overlayY), and per the CSS spec any ancestor with a transform becomes the
// containing block for position:fixed descendants. That's the same "sticky
// doesn't perfectly pin inside the transformed wrapper" issue already
// documented elsewhere in this codebase — keeping this component outside
// that tree entirely avoids it rather than working around it.
export default function NavBar({ mode, onToggleMode, hasToggledFromConclusion, onNavigate }: Props) {
  const isMobile = useIsMobile()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  // Desktop-only concept: whether the user currently wants the bar shown.
  // 'N' flips this at ANY time, completely independent of
  // hasToggledFromConclusion/navUnlocked — those two only ever drive
  // automatic reveals, never gate 'N' itself.
  const [barVisible, setBarVisible] = useState(false)
  // Direct scroll-position check — deliberately NOT App.tsx's curtainDone,
  // which only flips via a scroll CHANGE event and can get stuck false if
  // the page reloads while already scrolled down (browsers restore scroll
  // position on reload, so no "change" ever fires past that threshold).
  const [atLandingPage, setAtLandingPage] = useState(true)
  const prevAtLandingPageRef = useRef(true)
  // Becomes true (permanently, for the rest of the session) the first
  // time the user scrolls down from the landing page after having clicked
  // Conclusion's toggle at least once. From then on, EVERY subsequent
  // "just scrolled down from the landing page" moment force-reveals the
  // bar again (see the effect below) — matching "it just will always drop
  // in after scrolling down from the landing page" once unlocked.
  const [navUnlocked, setNavUnlocked] = useState(false)

  // Always active, regardless of platform — a plain, unconditional toggle,
  // independent of hasToggledFromConclusion/navUnlocked entirely. Harmless
  // on touch devices; nobody's pressing a physical key there anyway, and
  // mobile's own shouldShow below ignores barVisible regardless.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'n' || e.key === 'N') {
        setBarVisible(v => !v)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    const checkScroll = () => {
      // Rough, robust heuristic for "still essentially at the landing
      // screen" — doesn't need to be pixel-perfectly synced to the exact
      // curtain-drop scroll point, just needs to reliably catch "scrolled
      // back near the very top."
      setAtLandingPage(window.scrollY < window.innerHeight * 0.5)
    }
    checkScroll()
    window.addEventListener('scroll', checkScroll, { passive: true })
    return () => window.removeEventListener('scroll', checkScroll)
  }, [])

  // Edge-detects "just scrolled down from the landing page" (a
  // true→false transition, not just "currently not at the landing page")
  // so this only fires once per departure from the landing screen, not on
  // every scroll tick while already below it.
  useEffect(() => {
    const justLeftLanding = prevAtLandingPageRef.current && !atLandingPage
    if (justLeftLanding) {
      if (hasToggledFromConclusion) {
        setNavUnlocked(true)
        setBarVisible(true)
      } else if (navUnlocked) {
        // Already unlocked from an earlier pass this session — every
        // subsequent departure from the landing page re-reveals it too.
        setBarVisible(true)
      }
    }
    prevAtLandingPageRef.current = atLandingPage
  }, [atLandingPage, hasToggledFromConclusion, navUnlocked])

  // Desktop: 'N'/barVisible works any time, landing page always overrides
  // to hidden. Mobile: no manual toggle at all — purely navUnlocked plus
  // landing-page, matching "hamburger is always visible after scrolling
  // down from the landing page, besides at the landing page."
  const shouldShow = isMobile
    ? navUnlocked && !atLandingPage
    : barVisible && !atLandingPage

  const scrollToSection = (id: string) => {
    onNavigate?.(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMobileOpen(false)
  }

  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setMobileOpen(v => !v)}
          aria-label="Open navigation"
          style={{
            position: 'fixed', top: '1rem', right: '1rem', zIndex: 1000,
            width: '46px', height: '46px', borderRadius: '10px',
            backgroundColor: 'var(--color-bg)', border: '1px solid #111',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
            transform: shouldShow ? 'translateY(0)' : 'translateY(-140%)',
            opacity: shouldShow ? 1 : 0,
            pointerEvents: shouldShow ? 'auto' : 'none',
            transition: 'transform 0.4s ease, opacity 0.3s ease',
          }}
        >
          <img src="/assets/hamburger.svg" style={{ width: '24px', height: '24px' }} />
        </button>

        {mobileOpen && shouldShow && (
          <div
            onClick={() => setMobileOpen(false)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.25)', zIndex: 998 }}
          />
        )}

        <div style={{
          position: 'fixed', top: 0, right: 0, height: '100%', width: '58%', maxWidth: '320px',
          backgroundColor: 'var(--color-bg)', zIndex: 999,
          boxShadow: (mobileOpen && shouldShow) ? '-2px 0 12px rgba(0,0,0,0.15)' : 'none',
          transform: (mobileOpen && shouldShow) ? 'translateX(0)' : 'translateX(100%)',
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
          <div style={{ height: '1px', backgroundColor: '#111', width: '100%' }} />
          <ToggleSwitch mode={mode} onToggle={onToggleMode} sesLabelColor="#111" raceLabelColor="#111" />
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
      transform: shouldShow ? 'translateY(0)' : 'translateY(-100%)',
      opacity: shouldShow ? 1 : 0,
      pointerEvents: shouldShow ? 'auto' : 'none',
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

        <div
          onMouseEnter={() => setTooltipVisible(true)}
          onMouseLeave={() => setTooltipVisible(false)}
          style={{ position: 'relative' }}
        >
          <ToggleSwitch mode={mode} onToggle={onToggleMode} sesLabelColor="#111" raceLabelColor="#111" scale={0.62} />
          {tooltipVisible && (
            <div style={{
              position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
              marginTop: '0.6rem', backgroundColor: '#111', color: '#fff',
              padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.78rem',
              whiteSpace: 'nowrap', pointerEvents: 'none',
            }}>
              Or toggle using the 'R' key
            </div>
          )}
        </div>
      </div>
    </div>
  )
}