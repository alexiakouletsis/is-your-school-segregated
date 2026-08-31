import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Mode } from '../App'

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

const SES_COLORS = ['#FF8BDE', '#FF8BDE', '#22D880', '#22D880', '#FF8BDE', '#22D880']
const RACE_COLORS = ['#FF9260', '#FF9260', '#8BA4FF', '#8BA4FF', '#FF9260', '#8BA4FF']

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
// alternating color pair — used for "Genuine connection" (alternating
// with the current mode's two colors) and the toggle's "SES"/"Race"
// labels (each always alternating its OWN fixed pair, regardless of mode,
// since they're naming the toggle options themselves).
function renderAlternating(text: string, colorA: string, colorB: string) {
  return text.split('').map((ch, i) => (
    <span key={i} style={{ color: i % 2 === 0 ? colorA : colorB }}>{ch}</span>
  ))
}

const PARA_BEFORE = "School integration has been proven to help disrupt concentrations of poverty and enhance academic outcomes. Yet, within-school segregation is typically a subject that flies under the radar. Putting visuals to the data patterns, talking about the problem, and having empathy for each student in these networks-and nurturing their potential-is how we can truly make a difference. A more connected future can only be achieved by dissolving the walls we have implicitly held for so long. "
const PARA_ACCENT = "Genuine connection"
const PARA_AFTER = " starts by sharing a space."
const PARA_FULL = PARA_BEFORE + PARA_ACCENT + PARA_AFTER

const INFO_BEFORE = "For more information similar subjects, click "
const INFO_HERE = "here"
const INFO_MIDDLE = " to see "
const INFO_LINK = "Plural Connection Group's other research projects"
const INFO_AFTER = "."
const INFO_FULL = INFO_BEFORE + INFO_HERE + INFO_MIDDLE + INFO_LINK + INFO_AFTER

interface Props {
  mode: Mode
  // No longer used internally — the toggle this used to wire up (see the
  // removed toggle block below) is gone now that the persistent top-right
  // toggle covers the same "restart in the other mode" need from the very
  // start of the article. Kept in the Props interface rather than removed
  // outright, since removing it here would just move the same "prop
  // doesn't exist" type error to whatever still passes it at the call
  // site — that cleanup belongs there, not here.
  onToggleModeAndScrollTop?: () => void
  // Bumped by App.tsx's skipAllIntroAnimations right before NavBar jumps
  // to a section — see that comment. Forces this section's skipAll to
  // run externally, the same way a click on it already does. Not
  // currently reachable by any nav link (Conclusion has no SECTIONS
  // entry and sits after GraphSection912, the last one that does), but
  // wired the same way as every other freeze-gated section for
  // consistency and in case that changes.
  skipSignal?: number
  // Fires once (the instant contentVisible flips true — i.e. the dot
  // condense-then-explode transition has actually cleared and the
  // conclusion's own content is visible), not on every re-render. Drives
  // NavBar's auto-reveal in App.tsx — replaces the old mechanism that used
  // to key off Conclusion's own since-removed toggle button.
  onRevealed?: () => void
}

export default function Conclusion({ mode, onToggleModeAndScrollTop: _onToggleModeAndScrollTop, skipSignal, onRevealed }: Props) {
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
  // Mobile only: instead of one DOM node per dot (up to 160 separate
  // elements, each needing their own layout/paint/composite work every
  // frame — the likely source of the reported jank even after this file's
  // existing dirty-check/frame-skip tuning), draw every dot in a single
  // canvas pass per update. Same underlying dot data and the same
  // getConvergeProgress/getDotOpacity math drive both phases — this only
  // changes HOW they're painted, not their positions, colors, or timing.
  // The explosion burst needs its own short-lived RAF loop below since
  // it's a one-shot timed animation (previously a CSS transition), not
  // scroll-driven like convergence is. Desktop keeps the existing
  // DOM-node + CSS-transition approach untouched.
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const explodeRafRef = useRef<number | null>(null)
  const explodeStartRef = useRef<number | null>(null)

  // --- body content sequence: title -> paragraph -> signature+info ---
  const [contentVisible, setContentVisible] = useState(false)
  const [infoDone, setInfoDone] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [sigHovered, setSigHovered] = useState(false)
  const contentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guards onRevealed so it only ever fires once per session, regardless
  // of which path (the normal scroll-triggered reveal, or a skip/nav-jump)
  // triggers contentVisible, and regardless of the user later scrolling
  // back up and re-triggering the sequence.
  const hasFiredRevealedRef = useRef(false)
  const fireRevealed = useCallback(() => {
    if (hasFiredRevealedRef.current) return
    hasFiredRevealedRef.current = true
    onRevealed?.()
  }, [onRevealed])
  // Local scroll lock (same technique Section02 already uses for its own
  // self-contained typed sequence) — NOT App.tsx's wheel-lock system. This
  // keeps the whole transition + content sequence as one self-contained
  // mechanic, same as the dot burst always was, rather than splitting it
  // into a separate block with its own independent freeze trigger (which
  // is what caused the previous bug: the title only appearing after extra
  // scrolling, instead of right as the burst clears).
  const lockScrollYRef = useRef<number | null>(null)
  const [sequenceStarted, setSequenceStarted] = useState(false)
  // Measures the phase svgs row's actual rendered position so mobile can

  useEffect(() => {
    const measure = () => {
      if (!panelRef.current) return
      const r = panelRef.current.getBoundingClientRect()
      setPanelSize(prev => {
        // Mobile browsers fire a 'resize' event whenever the address bar
        // shows/hides during scroll, nudging window.innerHeight (and this
        // panel's measured height) by a handful of px with no real layout
        // change. Since the scroll-position effect below depends on
        // panelSize, every one of those tiny changes was tearing down and
        // rebuilding its scroll listener AND shifting the vh-based math it
        // uses — visible as dots jumping position mid-transition. Ignoring
        // sub-8px changes filters that noise out while still catching
        // genuine resizes (rotation, real viewport/window changes).
        if (Math.abs(r.width - prev.width) < 8 && Math.abs(r.height - prev.height) < 8) {
          return prev
        }
        return { width: r.width, height: r.height }
      })
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

  useEffect(() => {
    if (!isMobile || !canvasRef.current) return
    const canvas = canvasRef.current
    const dpr = window.devicePixelRatio || 1
    canvas.width = panelSize.width * dpr
    canvas.height = panelSize.height * dpr
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [isMobile, panelSize])

  const resetContent = useCallback(() => {
    setContentVisible(false)
    setInfoDone(false)
    setSkipped(false)
    setSigHovered(false)
    setSequenceStarted(false)
    lockScrollYRef.current = null
    if (contentTimeoutRef.current) clearTimeout(contentTimeoutRef.current)
  }, [])

  useEffect(() => {
    const count = isMobile ? 160 : 700
    setDots(generateDots(mode, count))
    lastOpacityRef.current = new Array(count).fill(-1)
    lastTransformRef.current = new Array(count * 2).fill(Infinity)
    hasExplodedRef.current = false
    resetContent()
  }, [isMobile])

  // Mode changes (via the persistent toggle or 'R' key) don't reset/retype
  // anything — only the "Genuine connection" accent word reanimates (see
  // its key={mode} in renderPara below); everything else's colors (where
  // relevant) are already recomputed live from `mode` on every render
  // regardless.

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

  // No more staggered typing/fade sequence — everything shows in full as
  // soon as the content block itself fades in. infoDone still exists
  // since the desktop scroll-lock effect below reads it as "the reveal is
  // done, safe to unlock" — it just no longer waits on typing to get
  // there.
  useEffect(() => {
    if (!contentVisible || skipped) return
    setInfoDone(true)
  }, [contentVisible, skipped])

  const skipAll = useCallback(() => {
    if (skipped || infoDone) return
    setSkipped(true)
    setContentVisible(true)
    setInfoDone(true)
    fireRevealed()
  }, [skipped, infoDone, fireRevealed])

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
          if (isMobile) {
            if (explodeRafRef.current !== null) {
              cancelAnimationFrame(explodeRafRef.current)
              explodeRafRef.current = null
            }
            explodeStartRef.current = null
            const ctx = canvasRef.current?.getContext('2d')
            if (ctx) ctx.clearRect(0, 0, vw, vh)
          } else {
            dots.forEach((_, i) => {
              const el = dotRefs.current[i]
              if (el) el.style.transition = ''
            })
          }
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

        if (isMobile) {
          const ctx = canvasRef.current?.getContext('2d')
          if (ctx) {
            ctx.clearRect(0, 0, vw, vh)
            dots.forEach((dot, i) => {
              const opacity = getDotOpacity(dot, p)
              lastOpacityRef.current[i] = opacity
              if (opacity <= 0.003) return
              const basePxX = vw * (dot.baseX / 100)
              const basePxY = vh * (dot.baseY / 100)
              const convergePxX = centerPxX + dot.convergeOffsetX
              const convergePxY = centerPxY + dot.convergeOffsetY
              const convergeT = easeOutCubic(getConvergeProgress(dot, p))
              const dx = (convergePxX - basePxX) * convergeT
              const dy = (convergePxY - basePxY) * convergeT
              ctx.globalAlpha = opacity
              ctx.fillStyle = dotColors[i]
              ctx.beginPath()
              ctx.arc(basePxX + dx, basePxY + dy, dot.size / 2, 0, Math.PI * 2)
              ctx.fill()
            })
            ctx.globalAlpha = 1
          }
        } else {
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
        }
      } else if (!hasExplodedRef.current) {
        hasExplodedRef.current = true
        if (isMobile) {
          // One-shot timed burst, driven by its own short-lived RAF loop
          // (previously a CSS transition — canvas has no equivalent, so
          // this reimplements the same eased position/opacity/scale curve
          // by hand over the same BURST_MS window).
          explodeStartRef.current = performance.now()
          const drawExplodeFrame = () => {
            const ctx = canvasRef.current?.getContext('2d')
            if (!ctx || explodeStartRef.current === null) return
            const elapsed = performance.now() - explodeStartRef.current
            const t = Math.min(1, elapsed / BURST_MS)
            const eased = easeOutCubic(t)
            ctx.clearRect(0, 0, vw, vh)
            dots.forEach((dot, i) => {
              const basePxX = vw * (dot.baseX / 100)
              const basePxY = vh * (dot.baseY / 100)
              const explodePxX = vw * (dot.explodeX / 100)
              const explodePxY = vh * (dot.explodeY / 100)
              const dx = (explodePxX - basePxX) * eased
              const dy = (explodePxY - basePxY) * eased
              const scale = 1 + (dot.explodeScale - 1) * eased
              const opacity = 1 - eased
              lastOpacityRef.current[i] = opacity
              if (opacity <= 0.003) return
              ctx.globalAlpha = opacity
              ctx.fillStyle = dotColors[i]
              ctx.beginPath()
              ctx.arc(basePxX + dx, basePxY + dy, (dot.size / 2) * scale, 0, Math.PI * 2)
              ctx.fill()
            })
            ctx.globalAlpha = 1
            explodeRafRef.current = t < 1 ? requestAnimationFrame(drawExplodeFrame) : null
          }
          drawExplodeFrame()
        } else {
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
        }
        // This is the single trigger for the whole rest of the sequence —
        // lock scroll (desktop only actually enforces it, see the effect
        // above) right where the user is, then fade in the body content
        // right in place. No separate scroll-linked threshold needed.
        lockScrollYRef.current = window.scrollY
        setSequenceStarted(true)
        contentTimeoutRef.current = setTimeout(() => {
          setContentVisible(true)
          fireRevealed()
        }, CONTENT_DELAY_MS)
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
      if (explodeRafRef.current !== null) cancelAnimationFrame(explodeRafRef.current)
      if (contentTimeoutRef.current) clearTimeout(contentTimeoutRef.current)
    }
    // dotColors included so a mode toggle (which regenerates it in a
    // separate effect) forces this effect to re-run and immediately
    // redraw with the new colors via the update() call below — see the
    // identical comment in Section02.tsx for the full explanation.
  }, [dots, panelSize, dotColors])

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
          <span key={mode} className="accent-reanimate" style={{ display: 'inline-block', backgroundColor: 'rgba(253, 244, 203, 0.5)', borderRadius: '3px', padding: '0 0.15em' }}>
            {renderAlternating(accentTyped, highColor, lowColor)}
          </span>
        )}
        {after && <span style={{ fontWeight: 700 }}>{after}</span>}
      </>
    )
  }

  const infoHereStart = INFO_BEFORE.length
  const infoHereEnd = infoHereStart + INFO_HERE.length
  const infoLinkStart = infoHereEnd + INFO_MIDDLE.length
  const infoLinkEnd = infoLinkStart + INFO_LINK.length
  const renderInfo = () => {
    const before = INFO_FULL.slice(0, infoHereStart)
    const here = INFO_FULL.slice(infoHereStart, infoHereEnd)
    const middle = INFO_FULL.slice(infoHereEnd, infoLinkStart)
    const link = INFO_FULL.slice(infoLinkStart, infoLinkEnd)
    const after = INFO_FULL.slice(infoLinkEnd)
    return (
      <>
        {before}
        <a
          href="https://www.pluralconnections.org/projects"
          target="_blank"
          rel="noopener noreferrer"
          className="pcg-link"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: '#9E2591',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '1.08em',
          }}
        >
          {here}
        </a>
        {middle}
        {link}
        {after}
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
        {isMobile ? (
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              zIndex: 2,
              pointerEvents: 'none',
            }}
          />
        ) : (
          dots.map((dot, i) => {
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
                  willChange: 'transform, opacity',
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
                  animation: `dotFloatBob ${dot.bobDuration}s ease-in-out infinite`,
                  animationDelay: `${dot.bobDelay}s`,
                  ['--dot-bob-amount' as string]: `${-dot.bobAmount}px`,
                }} />
              </div>
            )
          })
        )}

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
            // Mobile: no independent scroll container here — this was
            // very likely capturing touch-scroll gestures meant for the
            // outer page scroll instead (a nested overflow:auto region,
            // sitting inside a parent that already clips via its own
            // overflow:hidden), especially once content got tall enough
            // to actually need it, which the newer, larger phase svgs
            // made more likely. That read as the page being "frozen" —
            // scrolling within a container with nowhere further to go,
            // rather than the outer page ever actually moving. The
            // parent panel's own overflow:hidden plus its taller mobile
            // buffer height (see panelRef above) now does the clipping
            // instead, without creating a second scrollable region.
            // Desktop keeps overflowY:auto — wheel/trackpad input over a
            // nested scroll region doesn't have the same
            // gesture-capture/frozen-feeling failure mode touch does.
            overflowY: isMobile ? 'visible' : 'auto',
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
          }}>
            <p style={{
              fontFamily: "'Kiwi Maru', serif",
              color: '#111',
              fontSize: isMobile ? 'clamp(0.75rem, 3vw, 0.9rem)' : 'clamp(1.05rem, 1.9vw, 1.35rem)',
              lineHeight: 1.8,
              width: '100%',
              textAlign: 'center',
              margin: 0,
            }}>
              {renderPara(PARA_FULL)}
            </p>
          </div>

          {/* The toggle sentence + ToggleSwitch used to sit here — removed
              since the persistent top-right toggle (added to the article
              from the very start) makes this "restart in the other mode"
              affordance redundant. */}

          <div
            style={{
              display: 'flex',
              // Source order is [signature, info text] — desktop reads
              // this as a row (signature left, text right); mobile now
              // uses plain 'column' so it reads top-to-bottom in that
              // same source order (signature above, text below) — this
              // used to be column-reverse (text above, signature below)
              // before the order was swapped.
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'center' : 'flex-end',
              justifyContent: 'center',
              gap: isMobile ? '0.7rem' : '1.5rem',
              width: '100%', maxWidth: '760px', flexShrink: 0,
              marginTop: isMobile ? '-0.7rem' : '-8.6rem',
              position: 'relative',
              zIndex: 2,
              // Manual nudge right on desktop — the centering math checked
              // out (justifyContent:center on a row with two fixed-width
              // children should be symmetric regardless of their exact
              // widths), but it still read as skewed left visually, so
              // this compensates directly rather than continuing to guess
              // at a CSS-level cause.
              ...(isMobile ? {} : { transform: 'translateX(20px)' }),
            }}
          >
            {/* Desktop: bottom-aligned with the info text via the row's
                own alignItems:flex-end above, then shifted down by half
                its own height here — the standard trick for "this
                element's CENTER lines up with that one's BOTTOM edge"
                (both start bottom-aligned; translating down 50% of this
                element's own height moves what was its center to that
                same shared bottom line). Mobile stays put (no shift) —
                the two are stacked in a column there, not side by side,
                so this specific alignment doesn't apply the same way. */}
            <div style={{ transform: isMobile ? 'none' : 'translateY(50%)' }}>
              <div className="subtle-stop-motion" style={{ flexShrink: 0, display: 'block' }}>
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
              </div>
            </div>
            <p style={{
              fontFamily: "'Kiwi Maru', serif",
              fontSize: isMobile ? 'clamp(0.65rem, 2.6vw, 0.78rem)' : 'clamp(0.76rem, 1.1vw, 0.9rem)',
              color: '#111', lineHeight: 1.6,
              textAlign: 'center', margin: 0,
              // Fixed width (not just maxWidth) on desktop — keeps this
              // row's total content width constant so justifyContent:
              // 'center' on the row doesn't shift the signature sideways
              // if this text's own rendered width varies at all.
              ...(isMobile ? {} : { width: '450px', transform: 'translateY(-4px)' }),
            }}>
              {renderInfo()}
            </p>
          </div>

          {/* Decorative phase svgs — just the three node-face phases,
              mode-colored. Desktop: pushed out much further toward the
              left/right edges and pulled up enough to sit in roughly the
              same vertical band as the signature/info row above (a
              negative margin here, not absolute positioning) — since
              they're so much further outward horizontally at this width,
              that vertical overlap doesn't create any actual visual
              collision with the signature/text, which stay narrower and
              centered. zIndex:2 on the signature row above and zIndex:1
              here just makes sure that if they ever do get close, the
              signature/text stays on top. Mobile: no corners to speak of
              at this width, so both sit close together, centered, under
              the signature. */}
          <div
            style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: isMobile ? 'center' : 'space-between',
            gap: isMobile ? '1.5rem' : '0',
            width: '100%',
            maxWidth: isMobile ? undefined : '1650px',
            padding: isMobile ? 0 : '0',
            flexShrink: 0,
            marginTop: isMobile ? '0.3rem' : '-2.8rem',
            position: 'relative',
            zIndex: 1,
          }}>
            <img
              src={mode === 'race' ? '/assets/phases-orange.svg' : '/assets/phases-pink.svg'}
              style={{ width: isMobile ? '150px' : '330px', height: 'auto', display: 'block' }}
            />
            <img
              src={mode === 'race' ? '/assets/phases-blue.svg' : '/assets/phases-green.svg'}
              style={{ width: isMobile ? '150px' : '330px', height: 'auto', display: 'block' }}
            />
          </div>
        </motion.div>
      </div>
    </div>
  )
}