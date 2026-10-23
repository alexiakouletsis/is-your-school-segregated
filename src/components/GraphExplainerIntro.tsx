import { useState, useEffect } from 'react'
import { motion, useTransform, type MotionValue } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'

const TITLE_TEXT = "How do these graphs actually work?"

// Simple full-screen, title-only breather between GraphSectionElementary
// and GraphSectionRepelAttract. Static text, no type-in (removed per
// feedback).
//
// Now a position:fixed sliding overlay (part of the same click-based
// navigation conversion as Section01/GraphSectionElementary) — slides in
// from the right to cover GraphSectionElementary (which is never
// touched, still sitting in normal document flow exactly where it
// already was) and back out to reveal it again. Its own "go forward"
// into GraphSectionRepelAttract is also a slide now — that section's
// entry animation used to be scroll-linked (nodes settling in from
// "above" via a negative-margin overlap), which didn't translate to
// this click-based, discrete-screen model at all; it's since been
// reworked to just start in its normal resting position immediately
// once active, so there's no more scroll-linked animation to preserve.
//
// The bigarrow (used to point from here toward RepelAttract's nodes,
// which visually settled into view from below via that section's own
// negative-margin overlap) is gone too, per feedback — once RepelAttract
// became a separate, non-overlapping sliding overlay of its own, there
// was nothing left on THIS screen for the arrow to actually point at.
export default function GraphExplainerIntro({ isActive, hasPassed, overlaySlideProgress, isActiveScreen }: {
  isActive: boolean
  hasPassed: boolean
  // Shared with GraphSectionRepelAttract — both read this exact same
  // motion value instance directly (lifted up to and animated from
  // ArticleSection.tsx), rather than each having its own value synced
  // via dispatched events. That event-based sync (tried first) still had
  // enough latency to be visible as the two overlays swiping away one
  // after another instead of together.
  overlaySlideProgress: MotionValue<number>
  // Distinct from isActive — isActive means "visually present" (true for
  // both screen==='explainer' AND 'repel-attract', since this needs to
  // stay visible while RepelAttract's own overlay sits on top of it).
  // isActiveScreen is screen==='explainer' exactly, used ONLY to gate
  // the arrow-key listener below. Missing this distinction meant this
  // file's own arrow-key listener stayed active the whole time
  // screen==='repel-attract' too, firing its OWN "go to Elementary"
  // jump on top of whatever RepelAttract's own phase-navigation handler
  // was doing with that same keypress — exactly what caused the back
  // arrow key to "skip" past phases that the click button correctly
  // stepped through one at a time.
  isActiveScreen?: boolean
}) {
  const isMobile = useIsMobile()

  const [backHovered, setBackHovered] = useState(false)
  const [forwardHovered, setForwardHovered] = useState(false)

  const goBack = () => window.dispatchEvent(new CustomEvent('exitExplainerToElementary'))
  const goForward = () => window.dispatchEvent(new CustomEvent('enterRepelAttractFromExplainer'))

  // Left/right arrow keys mirror the two buttons below, same convention
  // as every other section's own arrow-key handling — desktop only.
  // Gated on isActiveScreen (screen==='explainer' exactly), not isActive
  // (which also stays true through screen==='repel-attract' — see that
  // prop's own comment for why gating on isActive here was the bug).
  useEffect(() => {
    if (isMobile || !isActiveScreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goBack()
      else if (e.key === 'ArrowRight') goForward()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isMobile, isActiveScreen])

  const passTransform = useTransform(overlaySlideProgress, (p) => `translateX(${-p * 100}%)`)

  return (
    <motion.div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 20,
      backgroundColor: 'var(--color-bg)',
      transform: hasPassed ? passTransform : (isActive ? 'translateX(0)' : 'translateX(100%)'),
      transition: hasPassed ? 'none' : 'transform 0.6s cubic-bezier(0.65, 0, 0.35, 1)',
    }}>
      <div
        onClick={isMobile ? (e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const isRightHalf = e.clientX - rect.left > rect.width / 2
          if (isRightHalf) goForward()
          else goBack()
        } : undefined}
        style={{
          width: '100%', height: '100%', backgroundColor: 'var(--color-bg)', position: 'relative',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
          padding: isMobile ? '32vh 2rem 0 2rem' : '38vh 2rem 0 2rem',
          cursor: isMobile ? 'pointer' : 'default',
        }}>
        <h2 style={{
          fontFamily: "'Gaegu', cursive",
          fontSize: isMobile ? 'clamp(1.8rem, 7vw, 2.8rem)' : 'clamp(2rem, 5vw, 4rem)',
          color: '#111', fontWeight: 400, textAlign: 'center', margin: 0,
        }}>
          {TITLE_TEXT}
        </h2>

        {/* Desktop nav buttons, same convention as every other section's
            own bottom-corner buttons. Forward here is deliberately a
            real scroll (see this file's own top comment), not another
            slide. */}
        {!isMobile && !hasPassed && (
          <motion.div
            onClick={(e) => { e.stopPropagation(); goBack() }}
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
        {!isMobile && !hasPassed && (
          <motion.div
            onClick={(e) => { e.stopPropagation(); goForward() }}
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
        {isMobile && !hasPassed && (
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
          </>
        )}
      </div>
    </motion.div>
  )
}