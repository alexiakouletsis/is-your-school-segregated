import { useIsMobile } from '../hooks/useIsMobile'
import GraphSectionElementary from './GraphSectionElementary'
import GraphExplainerIntro from './GraphExplainerIntro'
import GraphSectionRepelAttract from './GraphSectionRepelAttract'
// Section01Part2 is still out of the flow per feedback — its "Section 01:
// Elementary School" title block comes back later. Commented out (not
// deleted) so it's a one-line restore, and so the noUnusedLocals build
// check doesn't fail on the import below in the meantime.
// import Section01Part2 from './Section01Part2'
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
// Unused for now — the citation paragraph that read these is temporarily
// cut from render below. Kept here (not deleted) for the one-line restore.
// const CITATION_BEFORE = "The "
// const CITATION_LINK = "Plural Connections Group"
// const CITATION_AFTER = " has partnered with a public school district in the Southeastern United States to collect data on 75 schools (varying from grades k-12) about classes that students share with one another. Classes can not only affect a student's academic breadth, but also the extent of their friendship networks. Let's take a look at this data in the context of "

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
  // Fires once GraphSectionElementary has been fully scrolled past (see
  // its own onExited prop). Drives App.tsx's persistent toggle reveal —
  // per feedback, the toggle should stay hidden through the intro and
  // elementary section, and probably a bit further (exact point still
  // TBD), so this wiring is a placeholder trigger point that's easy to
  // move to a later section once that's decided.
  onElementaryExited?: () => void
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

// Single adjustable knob for the intro block's mobile vertical centering —
// padding-based tweaks kept overshooting in both directions without being
// able to see the actual render live. Negative = nudge up, positive = nudge
// down. Adjust this one value directly if it's still off.
const MOBILE_VERTICAL_NUDGE = '-10vh'

export default function ArticleSection({
  onToggleModeAndScrollTop = () => {},
  onRevealed = () => {},
  onElementaryExited = () => {},
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
      {/* spark.svg removed — it was positioned next to the toggle, which
          isn't shown yet at this point in the article. Bring it back
          alongside the toggle's own reintroduction later. */}

      {/* Text content — normal flow, scrolls away like anything else on
          the page. No transition tying it to the graph section below;
          the two protagonist dots (rendered further down, still inside
          this same box) are just static. */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: isMobile ? 'center' : 'flex-start',
        gap: isMobile ? '0.75rem' : '3rem',
        minHeight: '100vh',
        paddingTop: isMobile ? 0 : '16vh',
        paddingBottom: isMobile ? 0 : '1.5rem',
        position: 'relative',
      }}>
        {/* Citation paragraph + toggle-instruction row removed for now per
            feedback — the intro should lead with "Take these two..."
            first. Both the Plural Connections Group citation and the
            toggle-instruction line come back later, once the toggle
            itself is reintroduced (see App.tsx's toggleRevealed). Not
            deleted, just cut from render — CITATION_BEFORE/LINK/AFTER
            constants above are temporarily unused as a result. */}

        {/* Static SES/race intro line — same wording/coloring convention as
            the rest of the site (higher-SES/lower-SES, white/asian/student
            of color), just a plain paragraph now rather than typed.
            min-height reserves room for whichever mode's text is longer
            (mobile specifically — race mode wraps to one fewer line than
            SES mode there) so switching modes doesn't change this block's
            own height, which otherwise shifted GraphSectionRepelAttract's
            overlap position below it, and with it the node SVGs. */}
        {/* Paragraph + dots grouped together so mobile vertical centering
            can be nudged with one transform instead of fighting over
            padding (padding-based tweaks kept overshooting in both
            directions without being able to see the actual render).
            MOBILE_VERTICAL_NUDGE below is the one knob to adjust —
            negative moves the group up, positive moves it down. */}
        <div style={{ transform: isMobile ? `translateY(${MOBILE_VERTICAL_NUDGE})` : undefined }}>
        <div style={{
          padding: '0 1.5rem',
          maxWidth: isMobile ? '100%' : '940px',
          margin: isMobile ? '0.5rem auto 0 auto' : '0 auto 0 auto',
          textAlign: 'center',
          minHeight: isMobile ? '9.5em' : undefined,
        }}>
          {/* Title — same styling convention as Section01Part2's own
              title (before that file was taken out of the flow), just
              living here now instead. */}
          <h2 style={{
            fontFamily: "'Gaegu', cursive",
            fontSize: isMobile ? 'clamp(1.8rem, 7vw, 2.8rem)' : 'clamp(2rem, 5vw, 4rem)',
            color: '#111', fontWeight: 400, textAlign: 'center', margin: '0 0 1rem 0',
          }}>
            Section 01: Elementary School
          </h2>
          <p style={{
            fontFamily: "'Kiwi Maru', serif",
            fontSize: isMobile ? 'clamp(0.98rem, 3.8vw, 1.22rem)' : 'clamp(1.28rem, 2.1vw, 1.65rem)',
            color: '#111', lineHeight: 1.9, margin: 0,
          }}>
            {mode === 'ses' ? (
              <>
                Take these two students entering kindergarten. One of them comes from a{' '}
                <span style={{ color: 'var(--color-high-ses)' }}>higher-SES</span> family, and the other from a{' '}
                <span style={{ color: 'var(--color-low-ses)' }}>lower-SES</span> family. Let's trace who they share classes with throughout elementary school.
              </>
            ) : (
              <>
                Take these two students entering kindergarten. One of them is a{' '}
                <span style={{ color: 'var(--color-race-1)' }}>white/asian student</span>, and the other is a{' '}
                <span style={{ color: 'var(--color-race-2)' }}>student of color</span>. Let's trace who they share classes with throughout elementary school.
              </>
            )}
          </p>
        </div>

        {/* The two protagonist face SVGs, static below the paragraph —
            same K3-size assets used by GraphSectionElementary's own
            single-kindergarten-class step, just a plain bobbing pair
            here, centered across the full width. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: isMobile ? '3rem' : '6rem',
          width: '100%', maxWidth: '600px', margin: isMobile ? '3rem auto 0 auto' : '5.5rem auto 0 auto',
        }}>
          <img src={mode === 'race' ? '/assets/whiteasian-dot-K3.svg' : '/assets/high-SES-dot-K3.svg'} style={{
            width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(100px, 12vw, 160px)',
            height: 'auto', animation: 'bob 2s ease-in-out infinite',
          }} />
          <img src={mode === 'race' ? '/assets/poc-dot-K3.svg' : '/assets/low-SES-dot-K3.svg'} style={{
            width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(100px, 12vw, 160px)',
            height: 'auto', animation: 'bob 2s ease-in-out infinite', animationDelay: '0.4s',
          }} />
        </div>
        </div>

        {/* bigarrow removed per feedback — not needed here. */}
      </div>

      {/* Section01Part2 removed for now — its "Section 01: Elementary
          School" title/intro text block comes back later. */}
      {/* <Section01Part2 mode={mode} /> */}

      <GraphSectionElementary mode={mode} resetSignal={graphResetSignal} onExited={onElementaryExited} />

      {/* Simple title-only breather, then back into GraphSectionRepelAttract. */}
      <GraphExplainerIntro />
      <GraphSectionRepelAttract mode={mode} />

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