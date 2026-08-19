import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Mode } from '../App'
import {
  computeCourseStats, computeExpectedPct, getRankedCourses, formatCourseName,
  type CoursesRaw, type CourseStat,
} from './courseUtils'

const SES_PARA = "Every course below was taken by at least 50 students across high schools in that district \u2014 ranked from the most heavily higher-SES to the most heavily lower-SES."
const RACE_PARA = "Every course below was taken by at least 50 students across high schools in that district \u2014 ranked from the most heavily white/asian to the most heavily student-of-color."

interface Props {
  mode: Mode
}

export default function CourseClusterSection({ mode }: Props) {
  const isMobile = useIsMobile()
  const containerRef = useRef<HTMLDivElement>(null)
  const [allStats, setAllStats] = useState<CourseStat[]>([])
  // Computed once from the raw (unfiltered) fetch — both modes at once
  // since mode can be toggled without re-fetching.
  const [expectedPct, setExpectedPct] = useState<{ ses: number; race: number }>({ ses: 0, race: 0 })
  const [inView, setInView] = useState(false)

  const [paraText, setParaText] = useState('')
  const [paraDone, setParaDone] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const paraInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const PARA_FULL = mode === 'race' ? RACE_PARA : SES_PARA

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

  useEffect(() => {
    if (!inView || skipped) return
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
      }, 18)
    }, 400)
    return () => clearTimeout(t)
  }, [inView, skipped, PARA_FULL])

  // retype on mode change, same pattern used throughout the rest of the site
  const isFirstModeRender = useRef(true)
  useEffect(() => {
    if (isFirstModeRender.current) { isFirstModeRender.current = false; return }
    if (!inView) return
    clearInterval(paraInterval.current!)
    setSkipped(false)
    setParaText('')
    setParaDone(false)
  }, [mode])

  const skipAll = useCallback(() => {
    if (skipped || paraDone) return
    setSkipped(true)
    clearInterval(paraInterval.current!)
    setParaText(PARA_FULL)
    setParaDone(true)
  }, [skipped, paraDone, PARA_FULL])

  const ranked = getRankedCourses(allStats, mode)
  const pctKey: keyof CourseStat = mode === 'race' ? 'whiteAsianPct' : 'higherPct'
  const highColor = mode === 'race' ? 'var(--color-race-1)' : 'var(--color-high-ses)'
  const lowColor = mode === 'race' ? 'var(--color-race-2)' : 'var(--color-low-ses)'
  const highLabel = mode === 'race' ? 'White/Asian' : 'Higher SES'
  const lowLabel = mode === 'race' ? 'Student of Color' : 'Lower SES'

  return (
    <div
      ref={containerRef}
      onClick={inView && !paraDone ? skipAll : undefined}
      style={{
        width: '100%',
        backgroundColor: 'var(--color-bg)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: isMobile ? '3.5rem 1.3rem 4rem 1.3rem' : '5rem 2rem 6rem 2rem',
        gap: isMobile ? '1.6rem' : '2.5rem',
        cursor: inView && !paraDone ? 'default' : 'auto',
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
        fontSize: isMobile ? 'clamp(0.85rem, 3.3vw, 1.05rem)' : 'clamp(1rem, 1.6vw, 1.25rem)',
        color: '#111',
        lineHeight: 1.85,
        maxWidth: '820px',
        width: '100%',
        textAlign: 'center',
        margin: 0,
        minHeight: isMobile ? '9em' : '4em',
      }}>
        {paraText}
        {paraText.length > 0 && paraText.length < PARA_FULL.length && (
          <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
        )}
      </p>

      {/* legend */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: paraDone ? 1 : 0 }}
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
      <div style={{ width: '100%', maxWidth: '900px', position: 'relative', marginTop: isMobile ? '1.6rem' : '1.8rem' }}>
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
          animate={{ opacity: paraDone ? 1 : 0 }}
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
          animate={{ opacity: paraDone ? 0.55 : 0 }}
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
          gap: isMobile ? '0.55rem' : '0.5rem',
        }}>
        {ranked.map((course, i) => {
          const pct = course[pctKey] as number
          return (
            <motion.div
              key={course.name}
              initial={{ opacity: 0, x: -8 }}
              animate={paraDone ? { opacity: 1, x: 0 } : {}}
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
                height: isMobile ? '14px' : '16px',
                borderRadius: '999px',
                overflow: 'hidden',
                display: 'flex',
                backgroundColor: '#EADDDD',
              }}>
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: paraDone ? `${pct}%` : '0%' }}
                  transition={{ duration: 0.7, delay: Math.min(i * 0.03, 0.6) + 0.1, ease: [0.4, 0, 0.2, 1] }}
                  style={{ backgroundColor: highColor, height: '100%' }}
                />
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: paraDone ? `${100 - pct}%` : '0%' }}
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
    </div>
  )
}