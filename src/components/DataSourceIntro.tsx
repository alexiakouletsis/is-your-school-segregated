import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'

const TITLE_TEXT = "Where does this data come from?"
const BODY_PREFIX = "The "
const BODY_LINK_TEXT = "Plural Connections Group"
const BODY_SUFFIX = " has partnered with a school district in the southeastern United States to collect data on over 50,000 students. All the graphs shown are either sampled directly from that dataset or are a compiled average statistic from it."

// Simple full-screen, title + body breather between Section01 and
// GraphSectionElementary — added per feedback from Alvin Chang (data
// journalist) that the piece should say, early on, where the underlying
// data actually comes from. A standalone slide rather than folding this
// into Section01's own body text, since Section01 is already a complete,
// self-contained beat and this is its own distinct idea.
//
// Sits between Section01 (a position:fixed overlay) and
// GraphSectionElementary (normal document flow) — unlike
// GraphExplainerIntro/GraphSectionRepelAttract, this slide doesn't need
// to swipe away in lockstep with any other overlay, so its own transform
// is driven directly by a screen comparison (same pattern as Section01
// itself) rather than a shared motion value.
export default function DataSourceIntro({ isActive, hasPassed, isActiveScreen }: {
  isActive: boolean
  hasPassed: boolean
  isActiveScreen?: boolean
}) {
  const isMobile = useIsMobile()

  const goBack = () => window.dispatchEvent(new CustomEvent('exitDataSourceToSection01'))
  const goForward = () => window.dispatchEvent(new CustomEvent('enterElementaryFromDataSource'))

  // Left/right arrow keys mirror the two buttons below, same convention
  // as every other section's own arrow-key handling — desktop only.
  useEffect(() => {
    if (isMobile || !isActiveScreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goBack()
      else if (e.key === 'ArrowRight') goForward()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isMobile, isActiveScreen])

  return (
    <motion.div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 20,
      backgroundColor: 'var(--color-bg)',
      transform: hasPassed ? 'translateX(-100%)' : (isActive ? 'translateX(0)' : 'translateX(100%)'),
      transition: 'transform 0.6s cubic-bezier(0.65, 0, 0.35, 1)',
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
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: isMobile ? 'center' : 'flex-start',
          padding: isMobile ? '0 1.8rem' : '16vh 3rem 0 3rem',
          cursor: isMobile ? 'pointer' : 'default',
        }}>
        <h2 style={{
          fontFamily: "'Gaegu', cursive",
          fontSize: isMobile ? 'clamp(1.6rem, 6.5vw, 2.4rem)' : 'clamp(1.8rem, 4.2vw, 3.2rem)',
          color: '#111', fontWeight: 400, textAlign: 'center', margin: '0 0 2.5rem 0',
        }}>
          {TITLE_TEXT}
        </h2>
        <p style={{
          fontFamily: "'Kiwi Maru', serif",
          fontSize: isMobile ? 'clamp(0.85rem, 3.3vw, 1.05rem)' : 'clamp(1.05rem, 1.9vw, 1.5rem)',
          color: '#111', lineHeight: 1.75, textAlign: 'center', maxWidth: '780px', margin: 0,
        }}>
          {BODY_PREFIX}
          <a
            href="https://www.pluralconnections.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="pcg-link"
            onClick={(e) => e.stopPropagation()}
            style={{ color: '#9E2591', textDecoration: 'none' }}
          >
            {BODY_LINK_TEXT}
          </a>
          {BODY_SUFFIX}
        </p>

        {/* Desktop nav buttons, same convention as every other section's
            own bottom-corner buttons. */}
        {!isMobile && !hasPassed && (
          <motion.div
            onClick={(e) => { e.stopPropagation(); goBack() }}
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
          </motion.div>
        )}
        {!isMobile && !hasPassed && (
          <motion.div
            onClick={(e) => { e.stopPropagation(); goForward() }}
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