import { useEffect, useRef, useState } from 'react'
import { useMotionValue, useTransform, animate, motion, AnimatePresence, type MotionValue } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import { getNodeColor } from './graphUtils'
import type { Mode } from '../App'
import type { Node } from './graphTypes'

// A small, bespoke two-node illustration of the core graph mechanics
// (repulsion when unconnected, attraction + an edge when connected).
//
// Now a position:fixed sliding overlay (part of the same click-based
// navigation conversion as Section01/GraphSectionElementary/
// GraphExplainerIntro) — isActive (passed down from ArticleSection, tied
// to its own screen state) replaces what used to be scroll-position
// detection entirely. Used to be a very tall (320vh/190vh), negative-
// margin-overlapped section where scrolling brought the nodes into view
// with them starting "above" the graph and settling down into it — that
// whole mechanic was built for continuous vertical scroll and didn't
// translate to this discrete, click-based model at all (per feedback,
// it read as badly broken once wired into a horizontal slide). Nodes now
// just start in their normal resting position immediately once active,
// with no entry animation to speak of. Phase changes (repel <-> attract)
// are click/tap-driven, matching how the other graph sections
// (GraphSectionElementary etc.) handle navigation: desktop uses explicit
// "Click to go back"/"Click to go forward" buttons; mobile taps the
// left/right half of the graph panel. The repel/attract motion itself,
// once triggered, is still a real time-based animation either way
// (Framer's imperative animate()) — that part was never the problem.
const NODE_1 = { id: 0, ses: 'higher', race_ethnicity: 'white_asian' } as Node

const REPEL_LABEL = "Students who don't share classes will repel from each other."
const ATTRACT_LABEL = "Students who share classes will be pulled together."
const EDGE_NOTICE = "Two students who share at least one class are connected by an edge."

const D_CLOSE = ['38%', '62%']
const D_REPEL = ['15%', '85%']
const D_ATTRACT = ['36%', '64%']

// Mobile: pulled further apart at the start than desktop's — the same
// percentage gap was overlapping given mobile's node size relative to a
// narrower screen. Repel pulled in a bit from the edges (was 10/90,
// slightly off-screen once the node's own width is accounted for).
const M_CLOSE = ['30%', '70%']
const M_REPEL = ['15%', '85%']
const M_ATTRACT = ['33%', '67%']

// Builds a keyframe sequence that moves smoothly toward the target, then
// jitters back and forth a couple times right around it before finally
// settling exactly there — like magnets being pushed apart (repel) or
// pulled together (attract), overshooting slightly before catching.
// startPct is read live via motionValue.get() at trigger time (not
// assumed to always be CLOSE), since repel can also be re-triggered from
// an attract position if the user scrolls/taps backward first.
function buildShakeKeyframes(startPct: string, endPct: string): string[] {
  const start = parseFloat(startPct)
  const end = parseFloat(endPct)
  const jitter = 3.6
  const dir = end >= start ? 1 : -1
  return [
    startPct,
    `${end}%`,
    `${end + jitter * dir}%`,
    `${end - jitter * dir * 0.6}%`,
    `${end + jitter * dir * 0.4}%`,
    `${end}%`,
  ]
}
const SHAKE_TIMES = [0, 0.55, 0.68, 0.8, 0.9, 1]

export default function GraphSectionRepelAttract({ mode, isActive, hasPassed, overlaySlideProgress }: {
  mode: Mode
  // Replaces scroll-position-based entry/exit detection entirely — this
  // section used to be a very tall (320vh/190vh), negative-margin-
  // overlapped container that scroll-tracked its own entry/exit
  // progress, with the two nodes starting bobbing "above" the graph and
  // settling down into it as the user scrolled through the overlap. That
  // whole mechanic was built for continuous vertical scroll and simply
  // didn't translate to the click-based, discrete-screen model the site
  // is being converted to (Section01/GraphSectionElementary/
  // GraphExplainerIntro) — per feedback, it read as badly broken once
  // wired into a horizontal slide. Reworked instead to just be a plain
  // position:fixed sliding overlay like those other screens, with the
  // nodes starting in their normal resting position immediately once
  // active, rather than animating in from anywhere.
  isActive: boolean
  // Three-state transform (see the outer container below) — without
  // this, once past this screen (screen==='section02'), isActive alone
  // can't distinguish "not yet reached" from "already passed," so this
  // would have incorrectly slid back to the right instead of left
  // alongside GraphExplainerIntro.
  hasPassed: boolean
  // Shared with GraphExplainerIntro — see that file's own comment on its
  // matching prop for why this is a single shared instance now rather
  // than each having its own value synced via events.
  overlaySlideProgress: MotionValue<number>
}) {
  const isMobile = useIsMobile()
  const graphPanelRef = useRef<HTMLDivElement>(null)

  const dot1Src = mode === 'race' ? '/assets/whiteasian-dot-K3.svg' : '/assets/high-SES-dot-K3.svg'
  const dot2Src = mode === 'race' ? '/assets/poc-dot-K3.svg' : '/assets/low-SES-dot-K3.svg'
  const nodeSize = isMobile ? 'clamp(70px, 20vw, 100px)' : 'clamp(90px, 12vw, 150px)'

  const CLOSE = isMobile ? M_CLOSE : D_CLOSE
  const REPEL = isMobile ? M_REPEL : D_REPEL
  const ATTRACT = isMobile ? M_ATTRACT : D_ATTRACT

  const node1Left = useMotionValue(CLOSE[0])
  const node2Left = useMotionValue(CLOSE[1])
  // Bumped up (0.2 -> 0.4) per feedback that the attract edge needed to
  // read as more solid/opaque.
  const edgeOpacity = useMotionValue(0)

  // Simplified — no more scroll-linked "intro/hold phase starts lower,
  // then settles to center" distinction (that was tied to the old
  // scroll-driven entry animation). Nodes are just vertically centered
  // immediately now, on both platforms, since they start in their normal
  // resting position rather than animating in from anywhere.
  const nodeTop = '50%'

  const edgeColor = getNodeColor(NODE_1, mode)

  // bgOpacity is now a simple on/off tied directly to isActive — the
  // overlay's own slide-in transition (see the outer container below)
  // is what provides the "appearing" visual now, so this doesn't need
  // its own separate scroll-linked fade animation anymore.
  const bgOpacity = useMotionValue(0)

  // showPanel and isVisuallyActive used to be separate, scroll-derived
  // states (showPanel for whether the panel had scrolled into view,
  // isVisuallyActive for App.tsx's toggle-shadow logic, kept
  // deliberately distinct from showPanel because that never reverted to
  // false once scrolled past). Both are now just the isActive prop
  // directly — no more scroll-position math to derive them from.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('graphSectionActive', { detail: { id: 'repel-attract', active: isActive } }))
    return () => {
      window.dispatchEvent(new CustomEvent('graphSectionActive', { detail: { id: 'repel-attract', active: false } }))
    }
  }, [isActive])
  const [phase, setPhase] = useState<'repel' | 'attract'>('repel')
  // Hover state for the "Or go back/forward using the arrow keys" hints
  // on the two desktop nav buttons — same convention as App.tsx's own
  // 'R' key hint on the persistent toggle, just smaller.
  const [backHovered, setBackHovered] = useState(false)
  const [forwardHovered, setForwardHovered] = useState(false)

  // Left/right arrow keys mirror the "Click to go back"/"Click to go
  // forward" buttons exactly — left triggers repel (back, from attract)
  // or exits to Explainer (back, from repel — the very first phase now
  // has somewhere to go back TO, unlike before); right triggers attract
  // (forward, from repel) or scrolls into Section02 (forward, from
  // attract). Desktop only.
  useEffect(() => {
    if (isMobile || !isActive) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        if (phase === 'attract') triggerRepel()
        else window.dispatchEvent(new CustomEvent('exitRepelAttractToExplainer'))
      } else if (e.key === 'ArrowRight') {
        if (phase === 'repel') triggerAttract()
        else window.dispatchEvent(new CustomEvent('enterSection02FromRepelAttract'))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isMobile, isActive, phase])

  // Repel's own label now fades in (matching the other graph sections'
  // step-label convention) instead of typing character-by-character —
  // per feedback, typing was specifically the wrong treatment here.
  const [noticeText, setNoticeText] = useState('')
  const noticeDoneRef = useRef(false)

  const hasRepelledRef = useRef(false)
  const hasAttractedRef = useRef(false)

  const triggerRepel = () => {
    if (hasRepelledRef.current) return
    hasRepelledRef.current = true
    hasAttractedRef.current = false
    animate(node1Left, buildShakeKeyframes(node1Left.get(), REPEL[0]), { duration: 1.15, times: SHAKE_TIMES, ease: 'easeInOut' })
    animate(node2Left, buildShakeKeyframes(node2Left.get(), REPEL[1]), { duration: 1.15, times: SHAKE_TIMES, ease: 'easeInOut' })
    animate(edgeOpacity, 0, { duration: 0.3 })
    setPhase(prev => {
      if (prev === 'attract') {
        noticeDoneRef.current = false
        setNoticeText('')
      }
      return 'repel'
    })
  }

  const triggerAttract = () => {
    if (hasAttractedRef.current) return
    hasAttractedRef.current = true
    hasRepelledRef.current = false
    animate(node1Left, buildShakeKeyframes(node1Left.get(), ATTRACT[0]), { duration: 1.15, times: SHAKE_TIMES, ease: 'easeInOut' })
    animate(node2Left, buildShakeKeyframes(node2Left.get(), ATTRACT[1]), { duration: 1.15, times: SHAKE_TIMES, ease: 'easeInOut' })
    animate(edgeOpacity, 0.9, { duration: 0.8, delay: 0.5 })
    if (!noticeDoneRef.current) {
      noticeDoneRef.current = true
      setNoticeText(EDGE_NOTICE)
    }
    setPhase('attract')
  }

  const autoRepelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Replaces both platforms' old scroll-linked effects above — on
  // becoming active, sets bgOpacity directly (no more gradual scroll-
  // linked fade, since the overlay's own slide-in already provides the
  // "appearing" motion) and auto-triggers repel the first time, matching
  // the old "first time panel appears, land on repel automatically"
  // behavior. On becoming inactive, resets everything back to its
  // starting state (nodes at CLOSE, phase back to repel) so it starts
  // fresh the next time it's reached — matching the old "scrolled back
  // above hold" reset.
  useEffect(() => {
    if (isActive) {
      bgOpacity.set(1)
      if (!hasRepelledRef.current && !hasAttractedRef.current) {
        // Delayed now, rather than firing the instant this screen
        // becomes active — per feedback, the nodes need a moment sitting
        // in their starting position first, so the user actually gets to
        // watch them move apart rather than the repel already being
        // mid-motion (or done) the moment the screen appears.
        autoRepelTimerRef.current = setTimeout(() => {
          if (!hasRepelledRef.current && !hasAttractedRef.current) triggerRepel()
        }, 550)
      }
    } else {
      if (autoRepelTimerRef.current) clearTimeout(autoRepelTimerRef.current)
      bgOpacity.set(0)
      // No longer resets phase/hasRepelledRef/hasAttractedRef/node
      // positions here — per feedback, navigating away and back should
      // restore exactly where the user left off (e.g. still on the
      // attract phase), not always reset back to a fresh repel state.
      // The notice-text cleanup below is purely cosmetic and safe to keep.
      noticeDoneRef.current = false
      setNoticeText('')
    }
    return () => {
      if (autoRepelTimerRef.current) clearTimeout(autoRepelTimerRef.current)
    }
  }, [isActive])

  // Reads the shared overlaySlideProgress prop directly (animated from
  // ArticleSection.tsx, shared with GraphExplainerIntro) rather than
  // owning its own separate motion value/animation — see that prop's own
  // comment for why.
  const overlayTransform = useTransform(overlaySlideProgress, (p) => `translateX(${-p * 100}%)`)

  return (
    <motion.div
      id="repel-attract"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20,
        // hasPassed uses the shared overlayTransform above; the other
        // two states (not yet reached / active) are simple CSS values
        // with a plain transition, unchanged from before.
        transform: hasPassed ? overlayTransform : (isActive ? 'translateX(0)' : 'translateX(100%)'),
        transition: hasPassed ? 'none' : 'transform 0.6s cubic-bezier(0.65, 0, 0.35, 1)',
      }}
    >
      <div style={{
        width: '100%', height: '100%',
        backgroundColor: 'var(--color-bg)',
        overflow: 'hidden',
      }}>

        {/* Experimental — graph-paper texture fading in as the section
            transitions from the intro text into the graph itself,
            differentiating graph sections from plain text ones. A
            separate overlay layer (not baked into the panel's own
            background) specifically so background-color opacity can't
            interfere with it, and so it's a one-line removal if it
            doesn't end up working visually. If it reads well here, the
            plan is to reuse it as the background for other graph
            sections too. A direct child of the sticky panel (not the
            content wrapper below) so it always spans the panel's full
            height regardless of how much shorter the actual content is
            on mobile — otherwise the wallpaper stopped short of the
            bottom of the screen right along with the content. */}
        <motion.div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'url(/assets/graph-paper-bg.png)',
          backgroundRepeat: 'repeat',
          opacity: bgOpacity,
          pointerEvents: 'none',
        }} />

        {/* Content wrapper — capped at the mobile graph screen's actual
            height (shorter than the panel's own 100vh, to leave edge
            padding at the bottom) so none of the content shifts position;
            only the wallpaper above extends into that extra space. */}
        <div style={{ height: isMobile ? '94vh' : '100%', width: '100%', display: 'flex', flexDirection: isMobile ? 'column' : 'row', position: 'relative', transform: isMobile ? 'translateY(-2.5rem)' : undefined }}>

        <div style={{ width: isMobile ? '100%' : '28%', height: isMobile ? 'auto' : '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'center' : 'flex-start', justifyContent: 'center', padding: isMobile ? '4.5rem 1.5rem 0.5rem 1.5rem' : '3rem 2rem 3rem 3rem', flexShrink: 0, gap: '1.5rem' }}>
          {/* Desktop: the panel background is now a full block spanning
              the whole left column (inset from top/bottom/sides), not
              just wrapped around the current text — so the look stays
              consistent once future graph sections fill this panel with
              actual stats instead of just a label. */}
          {!isMobile && isActive && !hasPassed && (
            <div style={{ position: 'absolute', top: '3%', bottom: '3%', left: '1rem', right: '1rem', backgroundColor: 'rgba(250, 249, 246, 0.82)', borderRadius: '32px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 0 }} />
          )}
          {isActive && (
            <>
              {!isMobile && noticeText && (
                <AnimatePresence mode="wait">
                  <motion.p key={noticeText}
                    initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    style={{ position: 'absolute', top: '6rem', left: '3rem', right: '2rem', zIndex: 1, fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(1.1rem, 2vw, 1.6rem)', color: '#111', lineHeight: 1.6, margin: 0 }}>
                    {noticeText}
                  </motion.p>
                </AnimatePresence>
              )}
              <div style={{
                position: 'relative', zIndex: 1,
                // Mobile still wraps just the text (no explicit full
                // panel there), matching the toggle's own backdrop style.
                backgroundColor: isMobile ? 'rgba(250, 249, 246, 0.82)' : 'transparent',
                borderRadius: isMobile ? '18px' : 0,
                padding: isMobile ? '1rem 1.5rem' : 0,
                display: 'flex', flexDirection: 'column', gap: '1.5rem',
                alignItems: isMobile ? 'center' : 'flex-start',
              }}>
                <AnimatePresence mode="wait">
                  <motion.p key={phase} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4 }}
                    style={{ fontFamily: "'Kiwi Maru', serif", fontSize: isMobile ? 'clamp(0.9rem, 3.5vw, 1.1rem)' : 'clamp(1rem, 2vw, 1.6rem)', color: '#111', lineHeight: 1.6, margin: 0, textAlign: isMobile ? 'center' : 'left' }}>
                    {phase === 'repel' ? REPEL_LABEL : ATTRACT_LABEL}
                  </motion.p>
                </AnimatePresence>
                {!isMobile && (
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: phase === 'repel' ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: phase === 'attract' ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div
          ref={graphPanelRef}
          onClick={(e) => {
            if (!isMobile || !isActive) return
            const rect = graphPanelRef.current?.getBoundingClientRect()
            if (!rect) return
            const isRightHalf = e.clientX - rect.left > rect.width / 2
            if (isRightHalf) {
              if (phase === 'attract') {
                window.dispatchEvent(new CustomEvent('enterSection02FromRepelAttract'))
              } else {
                triggerAttract()
              }
            } else {
              if (phase === 'attract') {
                triggerRepel()
              } else {
                window.dispatchEvent(new CustomEvent('exitRepelAttractToExplainer'))
              }
            }
          }}
          style={{ flex: 1, minHeight: 0, height: isMobile ? undefined : '100%', position: 'relative', cursor: (isMobile && isActive) ? 'pointer' : undefined }}
        >
          {/* Desktop-only "Click to go back"/"Click to go forward" —
              replaces scroll-driven phase advancement (see the removed
              wheel-resistance handler and scroll-triggering above).
              Exact same convention as GraphSectionElementary's own
              buttons: same size/rounding/font, top corners of this graph
              panel, no cursor override (site's custom cursor SVG). Back
              now shows at both phases — at repel (the first phase), it
              exits back to GraphExplainerIntro instead of being hidden
              with nowhere to go, matching GraphSectionElementary's own
              step-0 back button. */}
          {!isMobile && isActive && !hasPassed && (
            <motion.div
              onClick={(e) => {
                e.stopPropagation()
                if (phase === 'attract') { triggerRepel(); return }
                window.dispatchEvent(new CustomEvent('exitRepelAttractToExplainer'))
              }}
              onMouseEnter={() => setBackHovered(true)}
              onMouseLeave={() => setBackHovered(false)}
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute', bottom: '1.5rem', left: '1rem', zIndex: 5,
                fontFamily: "'Kiwi Maru', serif", fontSize: '1.05rem', color: '#111',
                backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.55rem 1.1rem', borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              ← Click to go back
              {backHovered && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                  marginBottom: '0.45rem', backgroundColor: '#111', color: '#fff',
                  padding: '0.32rem 0.65rem', borderRadius: '6px', fontSize: '0.68rem',
                  whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 9500,
                }}>
                  Or use the left arrow key
                </div>
              )}
            </motion.div>
          )}
          {/* New forward button for the attract phase (previously only
              the back button showed here, with no forward action at
              all) — part of the click-based-navigation conversion.
              Dispatches an event handled by ArticleSection, which jumps
              the page's scroll instantly to Section02 (hidden behind
              this still-covering overlay) and updates screen so this
              overlay actually knows it's been passed and slides away —
              see that listener's own comment for why a direct scroll
              alone didn't work once this became position:fixed. */}
          {!isMobile && isActive && !hasPassed && phase === 'attract' && (
            <motion.div
              onClick={(e) => {
                e.stopPropagation()
                window.dispatchEvent(new CustomEvent('enterSection02FromRepelAttract'))
              }}
              onMouseEnter={() => setForwardHovered(true)}
              onMouseLeave={() => setForwardHovered(false)}
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute', bottom: '1.5rem', right: '1rem', zIndex: 5,
                fontFamily: "'Kiwi Maru', serif", fontSize: '1.05rem', color: '#111',
                backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.55rem 1.1rem', borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              Click to go forward →
              {forwardHovered && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                  marginBottom: '0.45rem', backgroundColor: '#111', color: '#fff',
                  padding: '0.32rem 0.65rem', borderRadius: '6px', fontSize: '0.68rem',
                  whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 9500,
                }}>
                  Or use the right arrow key
                </div>
              )}
            </motion.div>
          )}
          {!isMobile && isActive && phase === 'repel' && (
            <motion.div
              onClick={(e) => { e.stopPropagation(); triggerAttract() }}
              onMouseEnter={() => setForwardHovered(true)}
              onMouseLeave={() => setForwardHovered(false)}
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute', bottom: '1.5rem', right: '1rem', zIndex: 5,
                fontFamily: "'Kiwi Maru', serif", fontSize: '1.05rem', color: '#111',
                backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.55rem 1.1rem', borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              Click to go forward →
              {forwardHovered && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                  marginBottom: '0.45rem', backgroundColor: '#111', color: '#fff',
                  padding: '0.32rem 0.65rem', borderRadius: '6px', fontSize: '0.68rem',
                  whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 9500,
                }}>
                  Or use the right arrow key
                </div>
              )}
            </motion.div>
          )}

          {isMobile && isActive && noticeText && (
            <div style={{ position: 'absolute', top: '2.2rem', left: '16%', right: '16%', zIndex: 5, padding: '0.6rem 1rem', backgroundColor: 'rgba(250,249,246,0.92)', borderRadius: '8px' }}>
              <AnimatePresence mode="wait">
                <motion.p key={noticeText}
                  initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.6rem, 2.5vw, 0.75rem)', color: '#111', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
                  {noticeText}
                </motion.p>
              </AnimatePresence>
            </div>
          )}

          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <motion.line y1={nodeTop} y2={nodeTop} stroke={edgeColor} strokeWidth={5} x1={node1Left} x2={node2Left} opacity={edgeOpacity} />
          </svg>

          {/* Solid white circles behind each face image, slightly larger
              than the image itself — a border illusion that works
              regardless of the SVG's own (non-circular) silhouette,
              unlike a boxShadow outline which would trace the image's
              actual bounding box instead of its visible artwork. Same
              position/animation values as their corresponding images,
              rendered first so they sit behind. Only visible once
              isActive is true (the graph part), not during the
              intro/settle phase. */}
          <motion.div
            animate={{ y: '-50%' }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'absolute', left: node1Left, top: nodeTop, x: '-50%',
              width: `calc(${nodeSize} * 1.015)`, aspectRatio: '1 / 1',
              backgroundColor: 'white', borderRadius: '50%',
              opacity: isActive ? 1 : 0,
            }}
          />
          <motion.div
            animate={{ y: '-50%' }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'absolute', left: node2Left, top: nodeTop, x: '-50%',
              width: `calc(${nodeSize} * 1.015)`, aspectRatio: '1 / 1',
              backgroundColor: 'white', borderRadius: '50%',
              opacity: isActive ? 1 : 0,
            }}
          />

          <motion.img
            src={dot1Src}
            animate={{ y: '-50%' }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'absolute', left: node1Left, top: nodeTop, x: '-50%', width: nodeSize, height: 'auto',
            }}
          />
          <motion.img
            src={dot2Src}
            animate={{ y: '-50%' }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'absolute', left: node2Left, top: nodeTop, x: '-50%', width: nodeSize, height: 'auto',
            }}
          />

          {isMobile && isActive && !hasPassed && (
            <>
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
              <div style={{ position: 'absolute', bottom: '3.4rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '0.4rem' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: phase === 'repel' ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: phase === 'attract' ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
              </div>
            </>
          )}
        </div>
        </div>
      </div>
    </motion.div>
  )
}