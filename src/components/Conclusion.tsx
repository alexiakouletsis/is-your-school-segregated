import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Mode } from '../App'
import ToggleSwitch from './ToggleSwitch'

interface Dot {
  id: number
  baseX: number
  baseY: number
  convergeOffsetX: number
  convergeOffsetY: number
  explodeX: number
  explodeY: number
  explodeScale: number
  size: number
  color: string
  bobDuration: number
  bobDelay: number
  bobAmount: number
  convergeDelay: number
}

const SES_COLORS = ['#F17091', '#F17091', '#00B178', '#00B178', '#F17091', '#00B178']
const RACE_COLORS = ['#FF954D', '#FF954D', '#6897FF', '#6897FF', '#FF954D', '#6897FF']

const CONVERGE_CENTER_X = 50
const CONVERGE_CENTER_Y = 48
const CONVERGE_JITTER_PX = 70

const CONVERGE_END = 0.55
const HOLD_END = 0.60
const BURST_MS = 900
// How long after the burst fires before the body content (title onward)
// starts fading in — long enough that the dots have mostly cleared first,
// short enough that it doesn't feel like a separate, later moment.
const CONTENT_DELAY_MS = 350

function generateDots(mode: Mode, count: number): Dot[] {
  const colors = mode === 'race' ? RACE_COLORS : SES_COLORS
  const dots: Dot[] = []
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = Math.sqrt(Math.random()) * CONVERGE_JITTER_PX
    dots.push({
      id: i,
      baseX: Math.random() * 100,
      baseY: Math.random() * 100,
      convergeOffsetX: Math.cos(angle) * radius,
      convergeOffsetY: Math.sin(angle) * radius,
      explodeX: -15 + Math.random() * 130,
      explodeY: -15 + Math.random() * 130,
      explodeScale: 4 + Math.random() * 8,
      size: 10 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      bobDuration: 1.8 + Math.random() * 1.4,
      bobDelay: Math.random() * 2,
      bobAmount: 6 + Math.random() * 8,
      convergeDelay: Math.random(),
    })
  }
  return dots
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))

// Renders each character of a (possibly partially-typed) word in an
// alternating color pair — used for "Cross-communication" (alternating
// with the current mode's two colors) and the toggle's "SES"/"Race"
// labels (each always alternating its OWN fixed pair, regardless of mode,
// since they're naming the toggle options themselves).
function renderAlternating(text: string, colorA: string, colorB: string) {
  return text.split('').map((ch, i) => (
    <span key={i} style={{ color: i % 2 === 0 ? colorA : colorB }}>{ch}</span>
  ))
}

const PARA_BEFORE = "School integration has been proven to help disrupt concentrations of poverty and enhance academic outcomes. Yet, within-school segregation is typically a subject that flies under the radar. Putting visuals to the data patterns, talking about the problem, and having empathy for each node on those graphs is how we can truly make a difference. A more connected future can only be achieved by dissolving the walls we have implicitly held for so long. "
const PARA_ACCENT = "Cross-communication"
const PARA_AFTER = " starts by sharing a space."
const PARA_FULL = PARA_BEFORE + PARA_ACCENT + PARA_AFTER

const TOGGLE_SENTENCE = "Toggle here to view this entire article again in the context of race rather than socio-economic status. Take note of the similar patterns! :)"

const INFO_BEFORE = "For more information similar subjects, click here to see "
const INFO_LINK = "Plural Connection Group's other research projects"
const INFO_AFTER = "."
const INFO_FULL = INFO_BEFORE + INFO_LINK + INFO_AFTER

interface Props {
  mode: Mode
  onToggleModeAndScrollTop?: () => void
  // Bumped by App.tsx's skipAllIntroAnimations right before NavBar jumps
  // to a section — see that comment. Forces this section's skipAll to
  // run externally, the same way a click on it already does. Not
  // currently reachable by any nav link (Conclusion has no SECTIONS
  // entry and sits after GraphSection912, the last one that does), but
  // wired the same way as every other freeze-gated section for
  // consistency and in case that changes.
  skipSignal?: number
}

export default function Conclusion({ mode, onToggleModeAndScrollTop = () => {}, skipSignal }: Props) {
  const isMobile = useIsMobile()

  const containerRef = useRef<HTMLDivElement>(null)
  const [dots, setDots] = useState<Dot[]>(() => generateDots(mode, 500))
  const [dotColors, setDotColors] = useState<string[]>(() => dots.map(d => d.color))
  const dotRefs = useRef<(HTMLDivElement | null)[]>([])
  const rafRef = useRef<number | null>(null)
  const frameSkipRef = useRef(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 })
  const lastOpacityRef = useRef<number[]>([])
  // Flat [dx0, dy0, dx1, dy1, ...] pairs — the dirty-check for transform
  // writes during the (continuous, not one-shot) convergence phase.
  const lastTransformRef = useRef<number[]>([])
  const hasExplodedRef = useRef(false)
  const RENDER_SCALE = isMobile ? 3 : 1

  // --- body content sequence: title -> paragraph -> toggle -> signature+info ---
  const [contentVisible, setContentVisible] = useState(false)
  const [paraText, setParaText] = useState('')
  const [paraDone, setParaDone] = useState(false)
  const [toggleVisible, setToggleVisible] = useState(false)
  const [signatureVisible, setSignatureVisible] = useState(false)
  const [infoText, setInfoText] = useState('')
  const [infoDone, setInfoDone] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [sigHovered, setSigHovered] = useState(false)
  const contentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const paraInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const toggleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const infoInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const sigInfoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Local scroll lock (same technique Section02 already uses for its own
  // self-contained typed sequence) — NOT App.tsx's wheel-lock system. This
  // keeps the whole transition + content sequence as one self-contained
  // mechanic, same as the dot burst always was, rather than splitting it
  // into a separate block with its own independent freeze trigger (which
  // is what caused the previous bug: the title only appearing after extra
  // scrolling, instead of right as the burst clears).
  const lockScrollYRef = useRef<number | null>(null)
  const [sequenceStarted, setSequenceStarted] = useState(false)

  useEffect(() => {
    const measure = () => {
      if (panelRef.current) {
        const r = panelRef.current.getBoundingClientRect()
        setPanelSize({ width: r.width, height: r.height })
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (panelRef.current) observer.observe(panelRef.current)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const resetContent = useCallback(() => {
    setContentVisible(false)
    setParaText('')
    setParaDone(false)
    setToggleVisible(false)
    setSignatureVisible(false)
    setInfoText('')
    setInfoDone(false)
    setSkipped(false)
    setSigHovered(false)
    setSequenceStarted(false)
    lockScrollYRef.current = null
    if (contentTimeoutRef.current) clearTimeout(contentTimeoutRef.current)
    clearInterval(paraInterval.current!)
    if (toggleTimeoutRef.current) clearTimeout(toggleTimeoutRef.current)
    clearInterval(infoInterval.current!)
    if (sigInfoTimeoutRef.current) clearTimeout(sigInfoTimeoutRef.current)
  }, [])

  useEffect(() => {
    const count = isMobile ? 160 : 700
    setDots(generateDots(mode, count))
    lastOpacityRef.current = new Array(count).fill(-1)
    lastTransformRef.current = new Array(count * 2).fill(Infinity)
    hasExplodedRef.current = false
    resetContent()
  }, [isMobile])

  // Mode changes (via the nav bar or 'R' key) no longer reset/retype the
  // whole sequence — only the "Cross-communication" accent word reanimates
  // (see its key={mode} in renderPara below), since paraText/toggleVisible/
  // etc. don't need to be touched at all: their colors (where relevant)
  // are already recomputed live from `mode` on every render regardless.

  useEffect(() => {
    const colors = mode === 'race' ? RACE_COLORS : SES_COLORS
    setDotColors(dots.map(() => colors[Math.floor(Math.random() * colors.length)]))
  }, [mode, dots])

  const getConvergeProgress = (dot: Dot, p: number) => {
    const start = dot.convergeDelay * 0.15
    if (p <= start) return 0
    if (p >= CONVERGE_END) return 1
    return (p - start) / (CONVERGE_END - start)
  }

  const getDotOpacity = (dot: Dot, p: number) => {
    const revealStart = dot.convergeDelay * 0.15
    const revealEnd = revealStart + 0.05
    if (p < revealStart) return 0
    if (p < revealEnd) return (p - revealStart) / (revealEnd - revealStart)
    return 1
  }

  // paragraph typing, once the content block has finished fading in
  useEffect(() => {
    if (!contentVisible || skipped) return
    const t = setTimeout(() => {
      paraInterval.current = setInterval(() => {
        setParaText(prev => {
          const next = PARA_FULL.slice(0, prev.length + 1)
          if (next.length === PARA_FULL.length) {
            clearInterval(paraInterval.current!)
            setParaDone(true)
          }
          return next
        })
      }, 22)
    }, 400)
    return () => clearTimeout(t)
  }, [contentVisible, skipped])

  useEffect(() => {
    if (!paraDone || skipped) return
    toggleTimeoutRef.current = setTimeout(() => setToggleVisible(true), 500)
    return () => { if (toggleTimeoutRef.current) clearTimeout(toggleTimeoutRef.current) }
  }, [paraDone, skipped])

  const startSignatureAndInfo = useCallback(() => {
    setSignatureVisible(true)
    sigInfoTimeoutRef.current = setTimeout(() => {
      infoInterval.current = setInterval(() => {
        setInfoText(prev => {
          const next = INFO_FULL.slice(0, prev.length + 1)
          if (next.length === INFO_FULL.length) {
            clearInterval(infoInterval.current!)
            setInfoDone(true)
          }
          return next
        })
      }, 22)
    }, 400)
  }, [])

  const handleToggleFadeComplete = () => {
    if (toggleVisible && !skipped) startSignatureAndInfo()
  }

  const skipAll = useCallback(() => {
    if (skipped || infoDone) return
    setSkipped(true)
    setContentVisible(true)
    clearInterval(paraInterval.current!)
    clearInterval(infoInterval.current!)
    if (sigInfoTimeoutRef.current) clearTimeout(sigInfoTimeoutRef.current)
    if (toggleTimeoutRef.current) clearTimeout(toggleTimeoutRef.current)
    setParaText(PARA_FULL)
    setParaDone(true)
    setToggleVisible(true)
    setSignatureVisible(true)
    setInfoText(INFO_FULL)
    setInfoDone(true)
  }, [skipped, infoDone])

  // External trigger for the same skip a click already does — see
  // App.tsx's skipAllIntroAnimations. Guarded against StrictMode's
  // dev-mode double-invoke the same way ArticleSection's forceStart is.
  const lastSkipSignalRef = useRef(skipSignal)
  useEffect(() => {
    if (skipSignal === undefined) return
    if (skipSignal === lastSkipSignalRef.current) return
    lastSkipSignalRef.current = skipSignal
    skipAll()
  }, [skipSignal, skipAll])

  // local desktop-only scroll lock, mirroring Section02's own — holds
  // scroll at the position captured the instant the burst fired, until the
  // sequence finishes typing or the user skips.
  useEffect(() => {
    if (isMobile) return
    if (!sequenceStarted || infoDone || skipped) return
    const preventScroll = (e: Event) => {
      e.preventDefault()
      window.scrollTo(0, lockScrollYRef.current ?? 0)
    }
    window.addEventListener('wheel', preventScroll, { passive: false })
    window.addEventListener('touchmove', preventScroll, { passive: false })
    return () => {
      window.removeEventListener('wheel', preventScroll)
      window.removeEventListener('touchmove', preventScroll)
    }
  }, [sequenceStarted, infoDone, skipped, isMobile])

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return
      if (panelSize.width === 0 || panelSize.height === 0) return
      const rect = containerRef.current.getBoundingClientRect()
      const containerHeight = containerRef.current.offsetHeight

      if (rect.bottom < -window.innerHeight || rect.top > containerHeight + window.innerHeight) {
        return
      }

      const p = clamp01((-rect.top) / (containerHeight - window.innerHeight))
      const vw = panelSize.width
      const vh = panelSize.height
      const centerPxX = vw * (CONVERGE_CENTER_X / 100)
      const centerPxY = vh * (CONVERGE_CENTER_Y / 100)

      if (p < HOLD_END) {
        if (hasExplodedRef.current) {
          hasExplodedRef.current = false
          dots.forEach((_, i) => {
            const el = dotRefs.current[i]
            if (el) el.style.transition = ''
          })
          // Scrolling back up past the trigger point needs to undo the
          // WHOLE forward sequence, not just the dots' own styles — the
          // title/paragraph/toggle/signature block was left sitting at
          // full opacity here before, which is exactly what read as a
          // "weird overlay" underneath the reforming dot cluster once the
          // dots faded back in. resetContent() clears all of that (and
          // any in-progress typing intervals) back to hidden, matching how
          // the dot flood into Section02 reverses cleanly.
          resetContent()
        }

        dots.forEach((dot, i) => {
          const el = dotRefs.current[i]
          if (!el) return

          const opacity = getDotOpacity(dot, p)
          if (Math.abs(opacity - (lastOpacityRef.current[i] ?? -1)) > 0.004) {
            el.style.opacity = String(opacity)
            lastOpacityRef.current[i] = opacity
          }

          const basePxX = vw * (dot.baseX / 100)
          const basePxY = vh * (dot.baseY / 100)
          const convergePxX = centerPxX + dot.convergeOffsetX
          const convergePxY = centerPxY + dot.convergeOffsetY
          const convergeT = easeOutCubic(getConvergeProgress(dot, p))
          const dx = (convergePxX - basePxX) * convergeT
          const dy = (convergePxY - basePxY) * convergeT
          // Same dirty-check idea as opacity above, applied to transform:
          // most dots aren't actively converging at any given instant
          // (convergeDelay staggers them), so skipping the write once a
          // dot has settled at its current dx/dy cuts real per-frame cost
          // on mobile, where this continuous (not one-shot) phase was
          // still the remaining source of lag.
          const lastDx = lastTransformRef.current[i * 2]
          const lastDy = lastTransformRef.current[i * 2 + 1]
          if (Math.abs(dx - lastDx) > 0.15 || Math.abs(dy - lastDy) > 0.15) {
            el.style.transform = `translate(${dx}px, ${dy}px) scale(${1 / RENDER_SCALE})`
            lastTransformRef.current[i * 2] = dx
            lastTransformRef.current[i * 2 + 1] = dy
          }
        })
      } else if (!hasExplodedRef.current) {
        hasExplodedRef.current = true
        dots.forEach((dot, i) => {
          const el = dotRefs.current[i]
          if (!el) return
          const basePxX = vw * (dot.baseX / 100)
          const basePxY = vh * (dot.baseY / 100)
          const explodePxX = vw * (dot.explodeX / 100)
          const explodePxY = vh * (dot.explodeY / 100)
          el.style.willChange = 'transform, opacity'
          el.style.transition = `transform ${BURST_MS}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${BURST_MS}ms ease-out`
          el.style.transform = `translate(${explodePxX - basePxX}px, ${explodePxY - basePxY}px) scale(${dot.explodeScale / RENDER_SCALE})`
          el.style.opacity = '0'
          lastOpacityRef.current[i] = 0
        })
        // This is the single trigger for the whole rest of the sequence —
        // lock scroll (desktop only actually enforces it, see the effect
        // above) right where the user is, then fade in the body content
        // right in place. No separate scroll-linked threshold needed.
        lockScrollYRef.current = window.scrollY
        setSequenceStarted(true)
        contentTimeoutRef.current = setTimeout(() => setContentVisible(true), CONTENT_DELAY_MS)
      }
    }

    const handleScroll = () => {
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        // Mobile only: update every other frame instead of every frame.
        // The continuous convergence phase is the remaining source of lag
        // there — this halves its JS/DOM-write cost without touching dot
        // count (which would make the transition read as sparse instead).
        // The one-shot burst trigger still fires on whichever of these
        // calls first crosses HOLD_END, so this doesn't meaningfully delay
        // it (at most one skipped frame, ~16ms).
        if (isMobile) {
          frameSkipRef.current += 1
          if (frameSkipRef.current % 2 !== 0) return
        }
        update()
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    update()
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (contentTimeoutRef.current) clearTimeout(contentTimeoutRef.current)
    }
  }, [dots, panelSize])

  const highColor = mode === 'race' ? 'var(--color-race-1)' : 'var(--color-high-ses)'
  const lowColor = mode === 'race' ? 'var(--color-race-2)' : 'var(--color-low-ses)'

  const renderPara = (text: string) => {
    const beforeLen = PARA_BEFORE.length
    const accentEnd = beforeLen + PARA_ACCENT.length
    const before = text.slice(0, Math.min(text.length, beforeLen))
    const accentTyped = text.slice(beforeLen, Math.min(text.length, accentEnd))
    const after = text.slice(accentEnd)
    return (
      <>
        {before}
        {accentTyped && (
          // key={mode} forces React to remount this span whenever mode
          // changes, which restarts the CSS fade-in animation below — the
          // one part of the paragraph that's meant to visibly reanimate on
          // a mode switch. Everything else (before/after text, the rest of
          // the sequence) is untouched since it's not wrapped this way.
          <span key={mode} className="accent-reanimate" style={{ display: 'inline-block' }}>
            {renderAlternating(accentTyped, highColor, lowColor)}
          </span>
        )}
        {after && <span style={{ fontWeight: 700 }}>{after}</span>}
      </>
    )
  }

  const infoLinkStart = INFO_BEFORE.length
  const infoLinkEnd = infoLinkStart + INFO_LINK.length
  const renderInfo = () => {
    const before = infoText.slice(0, Math.min(infoText.length, infoLinkStart))
    const link = infoText.slice(infoLinkStart, Math.min(infoText.length, infoLinkEnd))
    const after = infoText.slice(infoLinkEnd)
    return (
      <>
        {before}
        {link && (
          <a
            href="https://www.pluralconnections.org/projects"
            target="_blank"
            rel="noopener noreferrer"
            className="pcg-link"
            onClick={(e) => e.stopPropagation()}
            style={{ color: '#9E2591', textDecoration: 'none' }}
          >
            {link}
          </a>
        )}
        {after}
        {infoText.length > 0 && infoText.length < INFO_FULL.length && (
          <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
        )}
      </>
    )
  }

  return (
    <div
      ref={containerRef}
      onClick={sequenceStarted && !infoDone ? skipAll : undefined}
      style={{
        height: '300vh',
        position: 'relative',
        flexShrink: 0,
        width: '100vw',
        marginLeft: 'calc(-1 * ((100vw - 100%) / 2))',
        marginTop: isMobile ? '-8vh' : '-15vh',
        cursor: sequenceStarted && !infoDone ? 'default' : 'auto',
      }}
    >
      <div ref={panelRef} style={{
        position: 'sticky',
        top: '-4vh',
        width: '100%',
        marginLeft: 'calc(-1 * ((100vw - 100%) / 2))',
        height: 'calc(100vh + 8vh)',
        minHeight: 'calc(100vh + 8vh)',
        overflow: 'hidden',
        backgroundColor: 'transparent',
        ...(isMobile ? { overflowAnchor: 'none' as const, willChange: 'transform' } : {}),
      }}>
        {dots.map((dot, i) => {
          const renderSize = dot.size * RENDER_SCALE
          return (
            <div
              key={dot.id}
              ref={(el) => { dotRefs.current[i] = el }}
              style={{
                position: 'absolute',
                left: `${dot.baseX}%`,
                top: `${dot.baseY}%`,
                width: 0,
                height: 0,
                opacity: 0,
                zIndex: 2,
                pointerEvents: 'none',
                ...(isMobile ? {} : { willChange: 'transform, opacity' }),
              }}
            >
              <div style={{
                position: 'absolute',
                left: -renderSize / 2,
                top: -renderSize / 2,
                width: renderSize,
                height: renderSize,
                borderRadius: '50%',
                backgroundColor: dotColors[i],
                ...(isMobile ? {} : {
                  animation: `dotFloatBob ${dot.bobDuration}s ease-in-out infinite`,
                  animationDelay: `${dot.bobDelay}s`,
                }),
                ['--dot-bob-amount' as string]: `${-dot.bobAmount}px`,
              }} />
            </div>
          )
        })}

        {/* body content — fades in right where the dots just cleared,
            no additional scrolling required */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: contentVisible ? 1 : 0 }}
          transition={{ duration: 0.9 }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            overflowY: 'auto',
            padding: isMobile ? '7.5rem 1.5rem 2.5rem 1.5rem' : '7.5rem 3rem 3rem 3rem',
            gap: isMobile ? '2.2rem' : '3.2rem',
            pointerEvents: contentVisible ? 'auto' : 'none',
          }}
        >
          <h2 style={{
            fontFamily: "'Gaegu', cursive",
            fontSize: 'clamp(1.7rem, 4.2vw, 3rem)',
            color: '#111',
            fontWeight: 400,
            textAlign: 'center',
            margin: 0,
            flexShrink: 0,
          }}>
            So...what about it?
          </h2>

          <div style={{
            position: 'relative', width: '100%', maxWidth: '950px', flexShrink: 0,
            marginBottom: isMobile ? 0 : '1.4rem',
            marginTop: isMobile ? 0 : '-0.35rem',
          }}>            <p aria-hidden="true" style={{
              fontFamily: "'Kiwi Maru', serif",
              fontSize: isMobile ? 'clamp(0.75rem, 3vw, 0.9rem)' : 'clamp(1.05rem, 1.9vw, 1.35rem)',
              lineHeight: 1.8,
              width: '100%',
              textAlign: 'center',
              margin: 0,
              visibility: 'hidden',
            }}>
              {renderPara(PARA_FULL)}
            </p>
            <p style={{
              fontFamily: "'Kiwi Maru', serif",
              color: '#111',
              fontSize: isMobile ? 'clamp(0.75rem, 3vw, 0.9rem)' : 'clamp(1.05rem, 1.9vw, 1.35rem)',
              lineHeight: 1.8,
              width: '100%',
              textAlign: 'center',
              margin: 0,
              position: 'absolute',
              top: 0, left: 0, right: 0,
            }}>
              {renderPara(paraText)}
              {paraText.length > 0 && paraText.length < PARA_FULL.length && (
                <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
              )}
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: toggleVisible ? 1 : 0 }}
            transition={{ duration: 0.7 }}
            onAnimationComplete={handleToggleFadeComplete}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '1rem', width: '100%', maxWidth: '700px', flexShrink: 0,
              marginTop: isMobile ? 0 : '-1.2rem',
            }}
          >
            <p style={{
              fontFamily: "'Kiwi Maru', serif",
              fontStyle: 'italic',
              fontSize: isMobile ? 'clamp(0.62rem, 2.5vw, 0.75rem)' : 'clamp(0.68rem, 1vw, 0.82rem)',
              color: '#111', lineHeight: 1.55, textAlign: 'center', margin: 0,
            }}>
              {TOGGLE_SENTENCE}
            </p>
            <ToggleSwitch mode={mode} onToggle={onToggleModeAndScrollTop} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: signatureVisible ? 1 : 0 }}
            transition={{ duration: 0.7 }}
            style={{
              display: 'flex',
              // Mobile: text above, signature below (reversed from source
              // order via column-reverse, rather than swapping the JSX
              // itself, so desktop's row layout/order is untouched).
              flexDirection: isMobile ? 'column-reverse' : 'row',
              alignItems: 'center', justifyContent: 'center',
              gap: isMobile ? '0.7rem' : '1.4rem',
              width: '100%', maxWidth: '760px', flexShrink: 0,
              ...(isMobile ? {} : { marginTop: '-1.5rem' }),
            }}
          >
            <a
              href="https://www.alexiakouletsis.com/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={() => setSigHovered(true)}
              onMouseLeave={() => setSigHovered(false)}
              style={{
                flexShrink: 0,
                display: 'block',
                ...(isMobile ? {} : { transform: 'translate(-30px, -15px)' }),
              }}
            >
              <img
                src="/assets/signature.svg"
                style={{
                  width: isMobile ? '100px' : '175px',
                  height: 'auto', display: 'block',
                  transform: sigHovered ? 'scale(1.08)' : 'scale(1)',
                  transition: 'transform 0.25s ease',
                }}
              />
            </a>
            <p style={{
              fontFamily: "'Kiwi Maru', serif",
              fontSize: isMobile ? 'clamp(0.65rem, 2.6vw, 0.78rem)' : 'clamp(0.72rem, 1.05vw, 0.85rem)',
              color: '#111', lineHeight: 1.6,
              textAlign: isMobile ? 'center' : 'left', margin: 0,
              // Fixed width (not just maxWidth) on desktop — this paragraph
              // grows character-by-character as it types, and without a
              // fixed box the row's total content width kept changing,
              // which (combined with justifyContent:'center' on the row)
              // re-centered the whole row every frame — visually dragging
              // the signature sideways instead of it staying put.
              ...(isMobile ? {} : { width: '420px', transform: 'translate(20px, -28px)' }),
            }}>
              {renderInfo()}
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}