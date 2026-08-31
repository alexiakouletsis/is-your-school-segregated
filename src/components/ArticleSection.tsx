import { motion } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import GraphSectionElementary from './GraphSectionElementary'
import GraphSectionRepelAttract from './GraphSectionRepelAttract'
import Section01Part2 from './Section01Part2'
import type { Mode } from '../App'
import Section02 from './Section02'
import GraphSection68 from './GraphSection68'
import Section03Intro from './Section03Intro'
import CourseClusterSection from './CourseClusterSection'
import Section03Part2 from './Section03Part2'
import GraphSection912 from './GraphSection912'
import Conclusion from './Conclusion'

// Moved in from the now-retired ArticleIntro.tsx — per feedback, everything
// else from the old typed multi-paragraph intro is gone; this is the one
// piece that survives, now living directly at the top of Section 01 itself
// rather than in a separate component/section, specifically so there's no
// seam (no gap, no divider, no transition animation) between it and the
// section's own content. Static, small, left-aligned — not typed/animated.
const CITATION_BEFORE = "The "
const CITATION_LINK = "Plural Connections Group"
const CITATION_AFTER = " has partnered with a public school district in the Southeastern United States to collect data on 75 schools (varying from grades k-12) about classes that students share with one another. Classes can not only affect a student's academic breadth, but also the extent of their friendship networks. Let's take a look at this data in the context of "

interface Props {
  onAnimDone?: () => void
  onOverlaySettled?: (scrollY: number) => void
  onAnimReset?: () => void
  onSection03Part2AnimDone?: () => void
  onSection03Part2OverlaySettled?: (scrollY: number) => void
  onSection03Part2AnimReset?: () => void
  onToggleModeAndScrollTop?: () => void
  // Fires once Conclusion's own dot condense-then-explode reveal has
  // actually finished — see Conclusion.tsx's own onRevealed prop for the
  // full reasoning. Forwarded straight through to it; drives NavBar's
  // one-time auto-reveal in App.tsx.
  onRevealed?: () => void
  graphResetSignal?: number
  // Each bumped independently by App.tsx's skipAnimationsUpTo, only for
  // sections before whichever nav destination was actually clicked — see
  // that function's comment. skipSection01Signal drives this component's
  // own inline Section 01 paragraph; the rest are forwarded as-is to
  // their respective child below.
  skipSection01Signal?: number
  skipSection02Signal?: number
  skipSection03IntroSignal?: number
  skipSection03Part2Signal?: number
  mode: Mode
  forceStart?: number
}

export default function ArticleSection({
  onToggleModeAndScrollTop = () => {},
  onRevealed = () => {},
  graphResetSignal = 0,
  skipSection02Signal,
  skipSection03IntroSignal,
  skipSection03Part2Signal,
  mode,
  onSection03Part2AnimDone = () => {},
  onSection03Part2OverlaySettled = () => {},
  onSection03Part2AnimReset = () => {},
}: Props) {
  const isMobile = useIsMobile()

  return (
    <div data-section="01" style={{ position: 'relative' }}>
      {/* Part of the page's own content, NOT the toggle widget itself
          (App.tsx) — this scrolls away with the rest of Section 01 like
          any other element here, unlike the toggle, which stays fixed.
          Positioned to sit visually to the left of the toggle only on
          initial view, before any scrolling happens. */}
      <img src="/assets/spark.svg" className="subtle-stop-motion" style={{
        position: 'absolute',
        top: isMobile ? '1rem' : '1.5rem',
        right: isMobile ? '12.5rem' : '18.25rem',
        width: isMobile ? 'clamp(1.2rem, 4.5vw, 1.6rem)' : 'clamp(1.6rem, 2.2vw, 2.1rem)',
        height: 'auto',
        zIndex: 1,
      }} />

      {/* Text content — normal flow, scrolls away like anything else on
          the page. The node "settle into place" transition used to live
          in a separate sticky element here, handing off to
          GraphSectionRepelAttract's own sticky panel below — but two
          separate sticky elements handing off to each other is inherently
          seam-prone (there's always a boundary where one releases and the
          other engages), which is what was reading as two distinct sets
          of faces rather than one continuous pair. That whole transition
          now lives entirely inside GraphSectionRepelAttract instead, as
          the leading portion of its own single continuous scroll range —
          see the comment there. */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? '0.75rem' : '3rem',
        paddingTop: isMobile ? '5.3rem' : '0.75in',
        paddingBottom: isMobile ? '1rem' : '1.5rem',
        position: 'relative',
      }}>
        {/* Row 1: citation paragraph + toggle-instruction line. Side by
            side on desktop, stacked on mobile — order swapped on mobile
            only (toggle-instruction first, citation second) via CSS
            `order`, so the underlying DOM/JSX order doesn't need to
            differ between platforms. */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: 'center',
          gap: isMobile ? '1.5rem' : '3.6rem',
          padding: isMobile ? '0 1.5rem' : '0 2rem 0 0.5in',
        }}>
          <div style={{
            order: isMobile ? 2 : 0,
            width: isMobile ? '100%' : '50%',
            marginLeft: isMobile ? 0 : '2.5rem',
            marginTop: isMobile ? '-0.3rem' : 0,
            textAlign: 'left',
            fontFamily: "'Kiwi Maru', serif",
            color: '#111',
            lineHeight: isMobile ? 1.7 : 1.85,
            flexShrink: 0,
          }}>
            <p style={{
              fontSize: isMobile ? 'clamp(0.75rem, 3.2vw, 0.92rem)' : 'clamp(0.95rem, 1.45vw, 1.2rem)',
              margin: 0,
            }}>
              {CITATION_BEFORE}
              <a href="https://www.pluralconnections.org/" target="_blank" rel="noopener noreferrer"
                className="pcg-link" style={{ color: '#9E2591', textDecoration: 'none' }}>
                {CITATION_LINK}
              </a>
              {CITATION_AFTER}
              {mode === 'ses' ? (
                <motion.span key="ses" initial={{ scale: 1 }} animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.6, ease: 'easeInOut' }}
                  style={{ display: 'inline-block', backgroundColor: '#FDF4CB', borderRadius: '3px', padding: '0 0.15em' }}>
                  <strong style={{ color: 'var(--color-high-ses)' }}>Socio-Economic </strong>
                  <strong style={{ color: 'var(--color-low-ses)' }}>Status</strong>
                </motion.span>
              ) : (
                // Bug fix: this branch previously rendered plain, uncolored
                // "race." — split to match the SES branch's two-color
                // treatment instead of being the one case with no color at
                // all.
                <motion.span key="race" initial={{ scale: 1 }} animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 0.6, ease: 'easeInOut' }}
                  style={{ display: 'inline-block', backgroundColor: '#FDF4CB', borderRadius: '3px', padding: '0 0.15em' }}>
                  <strong style={{ color: 'var(--color-race-1)' }}>ra</strong>
                  <strong style={{ color: 'var(--color-race-2)' }}>ce</strong>
                </motion.span>
              )}.
            </p>
          </div>

          {/* Toggle-instruction line + arrow — to the right of the citation
              on desktop, above it on mobile (order-swapped, see above).
              rightuparrow.svg points toward wherever the actual SES/Race
              toggle lives (top-right corner). */}
          <div style={{
            order: isMobile ? 1 : 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: isMobile ? 'flex-start' : 'center',
            gap: isMobile ? '0.05rem' : '1.8rem',
            width: isMobile ? '100%' : 'auto',
            marginTop: isMobile ? '-0.6rem' : '0.3rem',
            marginLeft: isMobile ? 0 : '1.5rem',
          }}>
            <span style={{
              fontFamily: "'Gaegu', cursive",
              fontSize: isMobile ? 'clamp(1.1rem, 4.2vw, 1.5rem)' : 'clamp(1.15rem, 1.75vw, 1.55rem)',
              color: '#111',
              lineHeight: 1.3,
              maxWidth: isMobile ? '280px' : '360px',
              marginTop: isMobile ? 0 : '2.7rem',
            }}>
              Click this toggle throughout your experience to view this data in a different context.
            </span>
            <div className="subtle-stop-motion" style={{ flexShrink: 0, display: 'inline-block' }}>
              <img src="/assets/rightuparrow.svg" style={{
                width: isMobile ? 'clamp(2.6rem, 9vw, 3.6rem)' : 'clamp(3.6rem, 5.5vw, 5.2rem)',
                height: 'auto', flexShrink: 0,
                transform: isMobile ? 'translateX(-0.8rem)' : 'none',
                position: 'relative', top: isMobile ? '-0.2rem' : '-0.5rem',
              }} />
            </div>
          </div>
        </div>

        {/* Static SES/race intro line — same wording/coloring convention as
            the rest of the site (higher-SES/lower-SES, white/asian/student
            of color), just a plain paragraph now rather than typed.
            min-height reserves room for whichever mode's text is longer
            (mobile specifically — race mode wraps to one fewer line than
            SES mode there) so switching modes doesn't change this block's
            own height, which otherwise shifted GraphSectionRepelAttract's
            overlap position below it, and with it the node SVGs. */}
        <div style={{
          padding: '0 1.5rem',
          maxWidth: isMobile ? '100%' : '940px',
          margin: isMobile ? '0.5rem auto 0 auto' : '0 auto 0 auto',
          textAlign: 'center',
          minHeight: isMobile ? '9.5em' : undefined,
        }}>
          <p style={{
            fontFamily: "'Kiwi Maru', serif",
            fontSize: isMobile ? 'clamp(1.02rem, 4vw, 1.3rem)' : 'clamp(1.42rem, 2.4vw, 1.8rem)',
            color: '#111', lineHeight: 1.9, margin: 0,
          }}>
            {mode === 'ses' ? (
              <>
                Take these two students entering kindergarten. One of them comes from a{' '}
                <span style={{ color: 'var(--color-high-ses)' }}>higher-SES</span> family (pink/left), and the other from a{' '}
                <span style={{ color: 'var(--color-low-ses)' }}>lower-SES</span> family (green/right).
              </>
            ) : (
              <>
                Take these two students entering kindergarten. One of them is a{' '}
                <span style={{ color: 'var(--color-race-1)' }}>white/asian student</span> (orange/left), and the other is a{' '}
                <span style={{ color: 'var(--color-race-2)' }}>student of color</span> (blue/right).
              </>
            )}
          </p>
        </div>

        {/* Desktop-only decoration — points from this text down toward
            the node SVGs in GraphSectionRepelAttract below. Positioned
            relative to this specific block (not the outer, very tall
            section) so it stays anchored to the intro area regardless of
            how much content follows. */}
        {!isMobile && (
          <img src="/assets/bigarrow.svg" className="subtle-stop-motion" style={{
            position: 'absolute',
            bottom: '-34%',
            left: '10%',
            width: 'clamp(15.5rem, 26vw, 26rem)',
            height: 'auto',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      <GraphSectionRepelAttract mode={mode} />

      <Section01Part2 mode={mode} />

      <GraphSectionElementary mode={mode} resetSignal={graphResetSignal} />

      <Section02 mode={mode} skipSignal={skipSection02Signal} />
      <GraphSection68 mode={mode} resetSignal={graphResetSignal} />
      <Section03Intro mode={mode} skipSignal={skipSection03IntroSignal} />
      <CourseClusterSection mode={mode} />
      <Section03Part2
        onAnimDone={onSection03Part2AnimDone}
        onOverlaySettled={onSection03Part2OverlaySettled}
        onAnimReset={onSection03Part2AnimReset}
        skipSignal={skipSection03Part2Signal}
        mode={mode}
      />
      <GraphSection912 mode={mode} resetSignal={graphResetSignal} />
      <Conclusion
        mode={mode}
        onToggleModeAndScrollTop={onToggleModeAndScrollTop}
        onRevealed={onRevealed}
      />
    </div>
  )
}