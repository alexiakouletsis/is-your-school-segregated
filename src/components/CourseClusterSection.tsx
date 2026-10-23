import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Mode } from '../App'
import {
  computeCourseStats, computeExpectedPct, getRankedCourses, formatCourseName,
  type CoursesRaw, type CourseStat,
} from './courseUtils'

const SES_PARA_BEFORE = "Every course below was taken by at least 50 students across high schools in that district \u2014 ranked from the most heavily "
const SES_PARA_HIGH = "higher-SES"
const SES_PARA_MIDDLE = " to the most heavily "
const SES_PARA_LOW = "lower-SES"
const SES_PARA_AFTER = "."

const RACE_PARA_BEFORE = "Every course below was taken by at least 50 students across high schools in that district \u2014 ranked from the most heavily "
const RACE_PARA_HIGH = "white/asian"
const RACE_PARA_MIDDLE = " to the most heavily "
const RACE_PARA_LOW = "student-of-color"
const RACE_PARA_AFTER = "."

interface Props {
  mode: Mode
  isActiveScreen?: boolean
  // Whether screen has advanced past this section (ArticleSection.tsx's
  // own hasPassedScreen('coursecluster')) — kept in sync with
  // lastExitWasForwardRef below. Without this, a NavBar jump that lands
  // past this section (skipping its own forward/back buttons entirely)
  // left that ref stuck at its default, un-updated value, causing the
  // swipe to animate from the wrong side the next time this section
  // became relevant again.
  passedForward?: boolean
}

export default function CourseClusterSection({ mode, isActiveScreen, passedForward }: Props) {
  const isMobile = useIsMobile()
  const containerRef = useRef<HTMLDivElement>(null)
  const [allStats, setAllStats] = useState<CourseStat[]>([])
  // Computed once from the raw (unfiltered) fetch — both modes at once
  // since mode can be toggled without re-fetching.
  const [expectedPct, setExpectedPct] = useState<{ ses: number; race: number }>({ ses: 0, race: 0 })
  const [inView, setInView] = useState(false)

  const renderPara = () => {
    const before = mode === 'race' ? RACE_PARA_BEFORE : SES_PARA_BEFORE
    const high = mode === 'race' ? RACE_PARA_HIGH : SES_PARA_HIGH
    const middle = mode === 'race' ? RACE_PARA_MIDDLE : SES_PARA_MIDDLE
    const low = mode === 'race' ? RACE_PARA_LOW : SES_PARA_LOW
    const after = mode === 'race' ? RACE_PARA_AFTER : SES_PARA_AFTER
    return (
      <>
        {before}
        <span style={{ color: highColor }}>{high}</span>
        {middle}
        <span style={{ color: lowColor }}>{low}</span>
        {after}
      </>
    )
  }

  useEffect(() => {
    fetch('/data/courses.json')
      .then(r => {
        if (!r.ok) throw new Error(`courses.json fetch failed: ${r.status} ${r.statusText}`)
        return r.json()
      })
      .then((raw: CoursesRaw) => {
        setAllStats(computeCourseStats(raw))
        setExpectedPct({
          ses: computeExpectedPct(raw, 'ses'),
          race: computeExpectedPct(raw, 'race'),
        })
      })
      .catch(err => {
        // Without this, a failed fetch left allStats/expectedPct at their
        // empty initial state forever with zero indication why — the rest
        // of the section (title, paragraph, legend) still renders fine
        // since none of it depends on this data, so only the bar list
        // silently disappears. Logging at least makes that diagnosable.
        console.error('CourseClusterSection: failed to load courses.json', err)
      })
  }, [])

  // Trigger typing + bar reveal once, the first time this section scrolls
  // into view. Unlike ArticleSection/Section01Part2 this section doesn't
  // need a scroll-lock/settle dance — it's a supplementary beat, not a
  // pinned overlay, so free scrolling the whole way through is fine and
  // there's much less state to keep in sync.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect() } },
      { threshold: 0.25 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Direct trigger for the same reveal, bypassing the observer entirely
  // — dispatched by Section03Intro's own forward button, which knows for
  // certain the user is intentionally entering this section. Same root
  // cause/fix as GraphSectionElementary and GraphSection68's earlier
  // mobile dialogue bugs: the observer wasn't reliably firing after an
  // instant scroll jump.
  useEffect(() => {
    const handler = () => setInView(true)
    window.addEventListener('triggerCourseClusterReveal', handler)
    return () => window.removeEventListener('triggerCourseClusterReveal', handler)
  }, [])

  // Tracks this section's own last exit direction — used for both the
  // exit transform AND the re-entry transform below, since re-entering
  // always animates back in from wherever this component itself last
  // exited to (the transform value stays there, off-screen, until
  // isActiveScreen becomes true again).
  const lastExitWasForwardRef = useRef(false)
  lastExitWasForwardRef.current = passedForward ?? lastExitWasForwardRef.current
  const goBack = () => {
    lastExitWasForwardRef.current = false
    window.dispatchEvent(new CustomEvent('exitCourseClusterToSection03'))
  }
  const goForward = () => {
    lastExitWasForwardRef.current = true
    window.dispatchEvent(new CustomEvent('enterSection03Part2FromCourseCluster'))
  }

  useEffect(() => {
    if (isMobile || !isActiveScreen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goBack()
      else if (e.key === 'ArrowRight') goForward()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isMobile, isActiveScreen])

  const ranked = getRankedCourses(allStats, mode)
  const pctKey: keyof CourseStat = mode === 'race' ? 'whiteAsianPct' : 'higherPct'
  const highColor = mode === 'race' ? 'var(--color-race-1)' : 'var(--color-high-ses)'
  const lowColor = mode === 'race' ? 'var(--color-race-2)' : 'var(--color-low-ses)'
  const highLabel = mode === 'race' ? 'White/Asian' : 'Higher SES'
  const lowLabel = mode === 'race' ? 'Student of Color' : 'Lower SES'

  return (
    <div
      ref={containerRef}
      id="course-cluster"
      style={{
        width: '100%',
        height: '100vh',
        backgroundColor: 'var(--color-bg)',
        position: 'relative',
        overflowX: 'hidden',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        touchAction: 'pan-y',
      }}
    >
      <motion.div
        animate={{ x: isActiveScreen ? '0%' : (lastExitWasForwardRef.current ? '-100%' : '100%') }}
        transition={{ duration: 0.5, ease: [0.65, 0, 0.35, 1] }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: isMobile ? '3.5rem 1.3rem 6rem 1.3rem' : '4rem 2rem 3.5rem 2rem',
          gap: isMobile ? '1.2rem' : '1.6rem',
        }}
      >
      <h3 style={{
        fontFamily: "'Gaegu', cursive",
        fontSize: isMobile ? 'clamp(1.3rem, 6vw, 1.8rem)' : 'clamp(1.6rem, 3vw, 2.4rem)',
        color: '#111',
        fontWeight: 400,
        textAlign: 'center',
        margin: 0,
      }}>
        Which classes are doing the sorting?
      </h3>

      <p style={{
        fontFamily: "'Kiwi Maru', serif",
        fontSize: isMobile ? 'clamp(0.78rem, 3.1vw, 0.95rem)' : 'clamp(0.85rem, 1.5vw, 1.1rem)',
        color: '#111',
        lineHeight: 1.7,
        maxWidth: '820px',
        width: '100%',
        textAlign: 'center',
        margin: 0,
        minHeight: isMobile ? '7em' : '3em',
      }}>
        {renderPara()}
      </p>

      {/* legend */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: inView ? 1 : 0 }}
        transition={{ duration: 0.6 }}
        style={{
          display: 'flex',
          gap: isMobile ? '1.2rem' : '2rem',
          fontFamily: "'Kiwi Maru', serif",
          fontSize: isMobile ? 'clamp(0.65rem, 2.8vw, 0.8rem)' : 'clamp(0.75rem, 1.1vw, 0.9rem)',
          color: '#111',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: highColor, display: 'inline-block' }} />
          {highLabel}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: lowColor, display: 'inline-block' }} />
          {lowLabel}
        </span>
      </motion.div>

      {/* ranked bar list */}
      <div style={{ width: '100%', maxWidth: '900px', position: 'relative', marginTop: isMobile ? '1.2rem' : '1.1rem' }}>
        {/* Reference line for "what the makeup would be if classes were
            assigned at random" — computed from the exact same
            courses.json data already driving the bars above (summed
            across every course, not just the ones that clear
            MIN_ENROLLMENT, since a genuine population baseline shouldn't
            drop the smaller courses). The label sits permanently just
            above the line rather than behind a hover/tap-to-reveal —
            a reader scanning straight down the bars should get this
            context for free instead of needing to discover an
            interaction first. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: inView ? 1 : 0 }}
          transition={{ duration: 0.6 }}
          style={{
            position: 'absolute',
            top: isMobile ? '-1.5rem' : '-1.7rem',
            left: isMobile
              ? `${expectedPct[mode]}%`
              : `calc(230px + 0.9rem + (100% - 230px - 48px - 1.8rem) * ${expectedPct[mode] / 100})`,
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            fontFamily: "'Kiwi Maru', serif",
            fontSize: isMobile ? 'clamp(0.6rem, 2.5vw, 0.7rem)' : 'clamp(0.65rem, 0.95vw, 0.78rem)',
            fontStyle: 'italic',
            color: '#555',
            pointerEvents: 'none',
          }}
        >
          {Math.round(expectedPct[mode])}% of high schoolers across the district are {mode === 'race' ? 'white/asian' : 'higher-SES'}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: inView ? 0.55 : 0 }}
          transition={{ duration: 0.6 }}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: isMobile
              ? `${expectedPct[mode]}%`
              : `calc(230px + 0.9rem + (100% - 230px - 48px - 1.8rem) * ${expectedPct[mode] / 100})`,
            borderLeft: '2px dashed #111',
            pointerEvents: 'none',
          }}
        />

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: isMobile ? '0.4rem' : '0.32rem',
        }}>
        {ranked.map((course, i) => {
          const pct = course[pctKey] as number
          return (
            <motion.div
              key={course.name}
              initial={{ opacity: 0, x: -8 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.6) }}
              style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'center',
                gap: isMobile ? '0.2rem' : '0.9rem',
              }}
            >
              <div style={{
                width: isMobile ? '100%' : '230px',
                flexShrink: 0,
                fontFamily: "'Kiwi Maru', serif",
                fontSize: isMobile ? 'clamp(0.6rem, 2.6vw, 0.72rem)' : 'clamp(0.65rem, 0.95vw, 0.8rem)',
                color: '#111',
                lineHeight: 1.3,
                textAlign: isMobile ? 'left' : 'right',
              }}>
                {formatCourseName(course.name)}
                <span style={{ color: '#999', marginLeft: '0.35rem' }}>(n={course.total})</span>
              </div>

              <div style={{
                flex: 1,
                width: '100%',
                height: isMobile ? '11px' : '12px',
                borderRadius: '999px',
                overflow: 'hidden',
                display: 'flex',
                backgroundColor: '#EADDDD',
              }}>
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: inView ? `${pct}%` : '0%' }}
                  transition={{ duration: 0.7, delay: Math.min(i * 0.03, 0.6) + 0.1, ease: [0.4, 0, 0.2, 1] }}
                  style={{ backgroundColor: highColor, height: '100%' }}
                />
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: inView ? `${100 - pct}%` : '0%' }}
                  transition={{ duration: 0.7, delay: Math.min(i * 0.03, 0.6) + 0.1, ease: [0.4, 0, 0.2, 1] }}
                  style={{ backgroundColor: lowColor, height: '100%' }}
                />
              </div>

              <div style={{
                width: isMobile ? 'auto' : '48px',
                flexShrink: 0,
                fontFamily: "'Kiwi Maru', serif",
                fontWeight: 600,
                fontSize: isMobile ? 'clamp(0.6rem, 2.6vw, 0.72rem)' : 'clamp(0.65rem, 0.95vw, 0.8rem)',
                color: highColor,
              }}>
                {Math.round(pct)}%
              </div>
            </motion.div>
          )
        })}
        </div>
      </div>
      </motion.div>
      {!isMobile && isActiveScreen && (
        <motion.div
          onClick={(e) => { e.stopPropagation(); goBack() }}
          whileHover={{ scale: 1.05 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed', bottom: '1.5rem', left: '1rem', zIndex: 50,
            fontFamily: "'Kiwi Maru', serif", fontSize: '1.05rem', color: '#111',
            backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.55rem 1.1rem', borderRadius: '16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          ← Click to go back
        </motion.div>
      )}
      {!isMobile && isActiveScreen && (
        <motion.div
          onClick={(e) => { e.stopPropagation(); goForward() }}
          whileHover={{ scale: 1.05 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed', bottom: '1.5rem', right: '1rem', zIndex: 50,
            fontFamily: "'Kiwi Maru', serif", fontSize: '1.05rem', color: '#111',
            backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.55rem 1.1rem', borderRadius: '16px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          Click to go forward →
        </motion.div>
      )}
      {isMobile && isActiveScreen && (
        <div
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const isRightHalf = e.clientX - rect.left > rect.width / 2
            if (isRightHalf) goForward()
            else goBack()
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 50, cursor: 'pointer', touchAction: 'pan-y' }}
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
  )
}