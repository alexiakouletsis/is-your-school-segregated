import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, useTransform } from 'framer-motion'
import type { MotionValue } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Mode } from '../App'

interface Dot {
  id: number
  x: number
  y: number
  size: number
  color: string
  bobDuration: number
  bobDelay: number
  bobAmount: number
}

const SES_COLORS = ['#FF8BDE', '#FF8BDE', '#22D880', '#22D880', '#FF8BDE', '#22D880']
const RACE_COLORS = ['#FF9260', '#FF9260', '#8BA4FF', '#8BA4FF', '#FF9260', '#8BA4FF']

const PARA = "Typically middle school brings more varied schedules and chances to meet different people. But in schools with curricular tracking, ironically, students from different backgrounds often end up in segregated classrooms and disconnected from one another. Let's zoom in on what a middle school with less classroom segregation versus one with more classroom segregation looks like."

function generateDots(mode: Mode, count: number): Dot[] {
  const colors = mode === 'race' ? RACE_COLORS : SES_COLORS
  const dots: Dot[] = []
  for (let i = 0; i < count; i++) {
    dots.push({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 10 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      bobDuration: 1.8 + Math.random() * 1.4,
      bobDelay: Math.random() * 2,
      bobAmount: 6 + Math.random() * 8,
    })
  }
  return dots
}

export default function Section02({ mode, skipSignal: _skipSignal, waveProgress, hasPassed, notYetRelevant, isActive }: { mode: Mode; skipSignal?: number; waveProgress: MotionValue<number>; hasPassed: boolean; notYetRelevant: boolean; isActive: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  // Measured via window.innerWidth rather than trusted to the CSS `100vw`
  // unit used below. On some mobile browsers 100vw doesn't reliably equal
  // the true visible width (a known category of vw/vh browser quirk this
  // codebase has already run into elsewhere, e.g. BlobCurtain's mobile
  // measurement comment) — since this component's dots are positioned as
  // percentages of THIS panel's own box, if the panel itself renders even
  // slightly wider/narrower or offset from the true screen edges because
  // of that quirk, the dots (accurately placed within the panel) still end
  // up missing from one true screen edge and spilling past the other.
  // Measuring window.innerWidth directly and using it in place of every
  // 100vw below sidesteps that unit's quirk entirely.
  const [viewportWidth, setViewportWidth] = useState<number | null>(null)
  useEffect(() => {
    const measure = () => setViewportWidth(window.innerWidth)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const vwPx = viewportWidth !== null ? `${viewportWidth}px` : '100vw'
  const fullBleedMarginLeft = viewportWidth !== null
    ? `calc(-1 * ((${viewportWidth}px - 100%) / 2))`
    : 'calc(-1 * ((100vw - 100%) / 2))'
  const [dots, setDots] = useState<Dot[]>(() => generateDots(mode, 500))
  const [dotColors, setDotColors] = useState<string[]>(() => dots.map(d => d.color))
  const [textOpacity, setTextOpacity] = useState(0)
  // Tracks whether the wave has substantially completed — used to hide
  // this section's own nav buttons/arrow-key listener until then. Set
  // up here (before its first use below) rather than down near
  // applyProgress, where it's ALSO subscribed to waveProgress a second
  // time for the same reason — see that second subscription's own
  // comment for the full reasoning on why this exists separately from
  // notYetRelevant.
  const [waveSubstantiallyDone, setWaveSubstantiallyDone] = useState(false)

  const goForward = () => {
    window.dispatchEvent(new CustomEvent('enterGraph68FromSection02'))
    window.dispatchEvent(new CustomEvent('triggerGraph68Dialogue'))
  }
  const goBack = () => window.dispatchEvent(new CustomEvent('exitSection02ToRepelAttract'))

  // Left/right arrow keys mirror the two buttons below, desktop only,
  // same convention as every other section. Gated on isActive
  // specifically (screen==='section02' exactly) — missing entirely
  // before, this fired on EVERY arrow-key press regardless of which
  // screen was actually active. That's exactly what caused arrow keys to
  // jump straight to GraphSection68 from anywhere. Note this excludes
  // screen==='repel-attract' too, even though Section02 is visually
  // "ready" then (sitting at translateX(0), about to be revealed) —
  // that screen still owns the arrow keys for its own phase navigation
  // at that point, not this one.
  useEffect(() => {
    if (isMobile || !isActive || !waveSubstantiallyDone) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goBack()
      else if (e.key === 'ArrowRight') goForward()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isMobile, isActive, waveSubstantiallyDone])
  const progressRef = useRef(0)
  const dotRefs = useRef<(HTMLDivElement | null)[]>([])
  // Mobile only: instead of one DOM node per dot (up to 240 separate
  // elements each needing their own layout/paint/composite work every
  // frame — the likely source of the reported jank, even after the
  // dirty-check/frame-skip/reduced-count tuning below), draw every dot
  // in a single canvas pass per update. Same underlying dot data and the
  // same getDotOpacity math drive both — this only changes HOW they're
  // painted, not their positions, colors, or fade timing. Desktop keeps
  // the existing DOM-node approach untouched.
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canvasSizeRef = useRef({ width: 0, height: 0 })
  // Tracks each dot's last-written opacity so the scroll handler below can
  // skip the DOM write entirely once a dot has settled at a stable value
  // (fully 0 before its reveal / after its fade, or fully 1 mid-hold) —
  // most of the 200+ dots sit at one of those two stable states for most
  // of the scroll range at any given moment, so this is what actually lets
  // the dot count go back up without a proportional per-frame cost.
  const lastOpacityRef = useRef<number[]>([])

  useEffect(() => {
    if (!isMobile) return
    const measure = () => {
      if (!canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      canvasSizeRef.current = { width: rect.width, height: rect.height }
      const dpr = window.devicePixelRatio || 1
      canvasRef.current.width = rect.width * dpr
      canvasRef.current.height = rect.height * dpr
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (canvasRef.current) observer.observe(canvasRef.current)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [isMobile])

  useEffect(() => {
    // Mobile count restored now that the dirty-check above (and bob being
    // desktop-only) keep the actual per-frame work low regardless of total
    // count — the earlier plain cut to 110 fixed the symptom but lost too
    // much of the flood's visual density.
    const count = isMobile ? 240 : 700
    setDots(generateDots(mode, count))
    lastOpacityRef.current = new Array(count).fill(-1)
  }, [isMobile])



  useEffect(() => {
    const colors = mode === 'race' ? RACE_COLORS : SES_COLORS
    setDotColors(dots.map(() => colors[Math.floor(Math.random() * colors.length)]))
  }, [mode, dots])

  // Extracted so it can be driven by either scroll position (normal
  // case, below) OR directly by the shared waveProgress motion value
  // (passed down from ArticleSection.tsx, animated there in step with
  // GraphSectionRepelAttract's own horizontal slide), so this section's
  // wave animation plays IN STEP with that slide rather than with
  // scrolling. Both paths do exactly the same visual work; only where p
  // comes from differs.
  const applyProgress = useCallback((p: number) => {
    progressRef.current = p
    setTextOpacity(getTextOpacity(p))

    if (isMobile) {
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) {
        const { width: cw, height: ch } = canvasSizeRef.current
        ctx.clearRect(0, 0, cw, ch)
        dots.forEach((dot, i) => {
          const opacity = getDotOpacity(dot, p)
          lastOpacityRef.current[i] = opacity
          if (opacity <= 0.003) return
          ctx.globalAlpha = opacity
          ctx.fillStyle = dotColors[i]
          ctx.beginPath()
          ctx.arc((dot.x / 100) * cw, (dot.y / 100) * ch, dot.size / 2, 0, Math.PI * 2)
          ctx.fill()
        })
        ctx.globalAlpha = 1
      }
    } else {
      dots.forEach((dot, i) => {
        const el = dotRefs.current[i]
        if (!el) return
        const opacity = getDotOpacity(dot, p)
        // Skip the DOM write entirely if this dot's opacity hasn't
        // meaningfully moved since last frame — see the comment on
        // lastOpacityRef above for why this is what actually makes a
        // higher dot count affordable.
        if (Math.abs(opacity - (lastOpacityRef.current[i] ?? -1)) > 0.004) {
          el.style.opacity = String(opacity)
          lastOpacityRef.current[i] = opacity
          el.style.animationPlayState = opacity > 0.01 ? 'running' : 'paused'
        }
      })
    }
  }, [isMobile, dots, dotColors])

  // Direct override, driven by the shared waveProgress motion value
  // instead of scroll — see applyProgress's own comment above. Reads it
  // via .on('change', ...) (framer-motion's own direct subscription),
  // not a dispatched CustomEvent — an earlier version used events for a
  // similar sync between two other components and that round-trip had
  // enough latency to be visibly out of step; subscribing directly to
  // the same shared value avoids that entirely. While this is actively
  // firing, the normal scroll-driven path below is redundant but
  // harmless (it'll just keep computing whatever p the current scroll
  // position implies — since the page isn't actually scrolling during
  // this specific transition, it has nothing to do anyway).
  useEffect(() => {
    return waveProgress.on('change', (p) => applyProgress(p))
  }, [waveProgress, applyProgress])

  // Separate subscription (see the state's own declaration further up)
  // — tracks whether the wave has substantially completed, used ONLY to
  // hide this section's own nav buttons until then, separate from
  // notYetRelevant (which gates the whole section, including the wave
  // itself, and needs to stay opaque/visible while the wave is actually
  // playing). Without this, the buttons were visible for the ENTIRE
  // wave animation: screen becomes 'section02' right at the START of
  // the wave, not once it finishes, and notYetRelevant only excludes
  // screens BEFORE this one — nothing was hiding the buttons
  // specifically during the wave itself.
  useEffect(() => {
    return waveProgress.on('change', (p) => setWaveSubstantiallyDone(p >= 0.9))
  }, [waveProgress])

  const getDotOpacity = (dot: Dot, p: number) => {
    // Right-to-left reveal (was tied to dot.y, bottom-to-top) — matches
    // the direction the RepelAttract/Explainer overlay itself slides
    // away (off-screen to the left), so the wave sweeps the same
    // direction as that slide rather than a different, vertical one.
    const xFrac = dot.x / 100
    // Compressed (was 0.15) — per feedback there was still a brief
    // blank-looking moment right as the overlay finishes clearing (0.3s
    // into the wave's own 1.8s total), since the last dots to reveal
    // (leftmost, xFrac near 0) didn't finish their own reveal window
    // until p≈0.21. Narrower window means even those last dots are
    // fully visible well before the overlay clears.
    const revealStart = (1 - xFrac) * 0.05
    const revealEnd = revealStart + 0.06
    const fadeStart = 0.55 + (1 - xFrac) * 0.25
    const fadeEnd = fadeStart + 0.1
    if (p < revealStart) return 0
    if (p < revealEnd) return (p - revealStart) / (revealEnd - revealStart)
    if (p < fadeStart) return 1
    if (p < fadeEnd) return 1 - (p - fadeStart) / (fadeEnd - fadeStart)
    return 0
  }

  const getTextOpacity = (p: number) => {
    if (p < 0.65) return 0
    if (p < 0.9) return (p - 0.65) / 0.25
    return 1
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      overflow: 'hidden',
      // Lower z-index than RepelAttract/Explainer (both 20) — this needs
      // to stay BEHIND them until their own slide-away reveals it (the
      // whole RepelAttract wave-reveal mechanic), not on top of them from
      // the start.
      zIndex: 15,
      // Two states only, not three like most other overlays in this
      // conversion — Section02 doesn't have a "not yet reached, off-
      // screen right" state, since it's always sitting at translateX(0)
      // from the moment GraphSectionRepelAttract's own slide-away starts
      // revealing it (that transition is unchanged by this — Section02
      // itself was never the thing sliding there, RepelAttract/Explainer
      // were). This only adds the NEW slide-away-left behavior once the
      // user advances into GraphSection68.
      transform: hasPassed ? 'translateX(-100%)' : 'translateX(0)',
      transition: 'transform 0.6s cubic-bezier(0.65, 0, 0.35, 1)',
      // Explicit gate for every screen before repel-attract — sitting at
      // translateX(0) works fine once RepelAttract/Explainer (both
      // higher z-index) are covering this same screen space, but on any
      // EARLIER screen (landing page, Section01, etc.) nothing has a
      // reason to be covering it yet, so without this it would show
      // (and its buttons would be clickable) right on top of those
      // screens too.
      opacity: notYetRelevant ? 0 : 1,
      pointerEvents: notYetRelevant ? 'none' : 'auto',
    }}>
    {/* Opaque background layer, separate from the existing 300vh
        container below (which stays deliberately transparent — see its
        own sticky panel's comment — so RepelAttract's wave-reveal effect
        is unaffected). Opacity ramps up FAST relative to waveProgress
        (full by 0.15, not gradually across the whole 1.8s) — per
        feedback, tying it directly to the full range meant it stayed
        mostly see-through (RepelAttract still visible) for most of the
        wave's own duration, when what's actually wanted is a solid
        background appearing quickly, with the dots then sweeping across
        on top of it. */}
    <motion.div style={{
      position: 'absolute', inset: 0, backgroundColor: 'var(--color-bg)',
      opacity: useTransform(waveProgress, (p) => p > 0 ? 1 : 0), zIndex: 0,
    }} />
    <div
      ref={containerRef}
      style={{
        height: '300vh',
        position: 'relative',
        flexShrink: 0,
        width: vwPx,
        marginLeft: fullBleedMarginLeft,
        // Desktop: pulled up to overlap GraphSection45's tail so the dot
        // flood rises over it directly instead of after a scroll gap over
        // blank background. Scaled back from a full viewport (-100vh) to a
        // smaller overlap — the full-viewport version was too large a shift
        // relative to how much scroll distance the shared ancestor sticky
        // panel budgets around this section. Still a starting guess; tune
        // this one number to taste.
        //
        // Mobile: reverted to its original small value. Mobile doesn't give
        // each section its own independent position:sticky the way desktop
        // does — every section here (GraphSection45, Section02, etc.) lives
        // inside one shared sticky wrapper in ArticleSection.tsx. A large
        // negative margin is a much bigger structural move in that shared-
        // parent context than on desktop, and is the likely cause of
        // GraphSection45's graph disappearing and the dot wall painting
        // beneath its overlay labels. Not attempting the overlap effect on
        // mobile for now rather than risk more of that breakage.
        marginTop: isMobile ? '-8vh' : '-20vh',
      }}
    >
      <div style={{
        position: 'sticky',
        top: 0,
        width: '100%',
        marginLeft: fullBleedMarginLeft,
        height: '100vh',
        minHeight: '100vh',
        overflow: 'hidden',
        // Transparent, not a solid color — the whole point of overlapping
        // GraphSection45 is so the dots themselves are what visually cover
        // it as they reveal. A solid background here would show up as an
        // opaque wall the instant this panel overlaps GraphSection45,
        // before the dots (which start at opacity 0) have appeared at all.
        // Body's own background-color is the same value, so once this panel
        // has scrolled well past GraphSection45 there's no visible
        // difference from before.
        backgroundColor: 'transparent',
        cursor: 'auto',
        ...(isMobile ? { overflowAnchor: 'none' as const, willChange: 'transform' } : {}),
      }}>

        {/* text layer */}
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: isMobile ? 'flex-start' : 'center',
          padding: isMobile ? '5rem 2rem 3rem 2rem' : '4rem 3rem',
          zIndex: 0,
          opacity: textOpacity,
        }}>

          <h2 style={{
            fontFamily: "'Gaegu', cursive",
            fontSize: 'clamp(2rem, 5vw, 4rem)',
            color: '#111',
            fontWeight: 400,
            textAlign: 'center',
            margin: '0 0 2.5rem 0',
          }}>
            Section 02: Middle School
          </h2>

          <p style={{
            fontFamily: "'Kiwi Maru', serif",
            fontSize: isMobile ? 'clamp(0.9rem, 3.5vw, 1.1rem)' : 'clamp(1.05rem, 1.9vw, 1.35rem)',
            color: '#111',
            lineHeight: 1.9,
            maxWidth: '940px',
            textAlign: 'center',
            margin: 0,
            height: isMobile ? '22em' : '11em',
            overflow: 'hidden',
          }}>
            {PARA}
          </p>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: isMobile ? '0.5rem' : '0rem',
            width: '100%',
            maxWidth: '900px',
            marginTop: isMobile ? '0rem' : '2.5rem',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              maxWidth: isMobile ? '85%' : '92%',
              padding: isMobile ? '0.5rem 0' : '1rem 0',
            }}>
              <img
                src={mode === 'race' ? '/assets/whiteasian-dot-68.svg' : '/assets/high-SES-dot-68.svg'}
                style={{
                  width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(90px, 12vw, 160px)',
                  height: 'auto',
                  animation: 'bob 2s ease-in-out infinite',
                }}
              />
              <img
                src={mode === 'race' ? '/assets/poc-dot-68.svg' : '/assets/low-SES-dot-68.svg'}
                style={{
                  width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(90px, 12vw, 160px)',
                  height: 'auto',
                  animation: 'bob 2s ease-in-out infinite',
                  animationDelay: '0.4s',
                }}
              />
            </div>
          </div>
        </div>

        {/* dot flood layer */}
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
          dots.map((dot, i) => (
            <div
              key={dot.id}
              ref={(el) => { dotRefs.current[i] = el }}
              style={{
                position: 'absolute',
                left: `${dot.x}%`,
                top: `${dot.y}%`,
                width: dot.size,
                height: dot.size,
                borderRadius: '50%',
                backgroundColor: dotColors[i],
                opacity: 0,
                zIndex: 2,
                pointerEvents: 'none',
                animation: `dotFloatBob ${dot.bobDuration}s ease-in-out infinite`,
                animationDelay: `${dot.bobDelay}s`,
                animationPlayState: 'paused',
                ['--dot-bob-amount' as string]: `${-dot.bobAmount}px`,
              }}
            />
          ))
        )}
      </div>

      {/* New click-based nav buttons, same convention as every other
          section. Desktop buttons + arrow-key hints; mobile gets a
          tap-anywhere-left/right zone with hint pills instead. */}
      {!isMobile && waveSubstantiallyDone && (
        <motion.div
          onClick={(e) => { e.stopPropagation(); goBack() }}
          whileHover={{ scale: 1.05 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed', bottom: '1.5rem', left: '1rem', zIndex: 5,
            fontFamily: "'Kiwi Maru', serif", fontSize: '1.05rem', color: '#111',
            backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.55rem 1.1rem', borderRadius: '16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          ← Click to go back
        </motion.div>
      )}
      {!isMobile && waveSubstantiallyDone && (
        <motion.div
          onClick={(e) => { e.stopPropagation(); goForward() }}
          whileHover={{ scale: 1.05 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed', bottom: '1.5rem', right: '1rem', zIndex: 5,
            fontFamily: "'Kiwi Maru', serif", fontSize: '1.05rem', color: '#111',
            backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.55rem 1.1rem', borderRadius: '16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          Click to go forward →
        </motion.div>
      )}
      {isMobile && waveSubstantiallyDone && (
        <div
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const isRightHalf = e.clientX - rect.left > rect.width / 2
            if (isRightHalf) goForward()
            else goBack()
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 5, cursor: 'pointer' }}
        >
          <div style={{
            position: 'absolute', top: '0.6rem', left: '0.6rem', zIndex: 5, pointerEvents: 'none',
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.55rem, 2.2vw, 0.68rem)', color: '#111',
            backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.25rem 0.5rem', borderRadius: '999px',
          }}>
            ← Tap to go back
          </div>
          <div style={{
            position: 'absolute', top: '0.6rem', right: '0.6rem', zIndex: 5, pointerEvents: 'none',
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.55rem, 2.2vw, 0.68rem)', color: '#111',
            backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.25rem 0.5rem', borderRadius: '999px',
          }}>
            Tap to go forward →
          </div>
        </div>
      )}
    </div>
    </div>
  )
}