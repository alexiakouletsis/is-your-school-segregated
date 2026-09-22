import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'

const TITLE_TEXT = "How do these graphs actually work?"

// Simple full-screen, title-only breather between GraphSectionElementary
// and GraphSectionRepelAttract. Static text, no type-in (removed per
// feedback). Sits with blank space around it — except that space isn't
// really blank once GraphSectionRepelAttract's own negative-margin
// overlap (-85vh/-65vh) pulls its floating "settle" nodes up into view
// here, so this screen leaves them room below the title rather than
// dead-centering it. The bigarrow (restored here, same size/formatting
// as its old spot in ArticleSection.tsx, before it was removed) points
// from the bottom-left toward wherever those nodes end up.
export default function GraphExplainerIntro() {
  const isMobile = useIsMobile()
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ['start start', 'end start'] })
  // Bigarrow fade-out: was lingering visibly well into
  // GraphSectionRepelAttract's own content, since it previously had no
  // fade at all and this section only scrolls fully out of view at v=1.
  // Given RepelAttract's overlap (-85vh into this section's own 100vh)
  // means its content already engages around v≈0.15, fading out over
  // [0.05, 0.18] gets it gone right around when that content is taking
  // over, instead of hanging around for the rest of this section's scroll.
  // Per feedback it was STILL fading a bit too early — pushed the whole
  // window later, [0.12, 0.27], so it holds on screen a little longer
  // before clearing out.
  const bigArrowOpacity = useTransform(scrollYProgress, [0.12, 0.27], [1, 0])

  return (
    <div ref={containerRef} style={{
      width: '100%', minHeight: '100vh', backgroundColor: 'var(--color-bg)', position: 'relative',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
      padding: isMobile ? '32vh 2rem 0 2rem' : '38vh 2rem 0 2rem',
    }}>
      <h2 style={{
        fontFamily: "'Gaegu', cursive",
        fontSize: isMobile ? 'clamp(1.8rem, 7vw, 2.8rem)' : 'clamp(2rem, 5vw, 4rem)',
        color: '#111', fontWeight: 400, textAlign: 'center', margin: 0,
      }}>
        {TITLE_TEXT}
      </h2>

      {/* Restored from its old spot in ArticleSection.tsx (removed
          earlier per feedback) — same asset, same size/formatting,
          desktop only, just repositioned to this screen's bottom-left
          corner instead of relative to the old intro paragraph block.
          Moved up (bottom: 5rem -> 11rem) to stay in line with
          RepelAttract's own two starting nodes, which were moved up by a
          roughly equivalent amount (their own 70%/50% top values shifted
          to 58%/38% — see that file's own comment) per feedback that
          both should sit closer to the title above. */}
      {!isMobile && (
        <motion.img src="/assets/bigarrow.svg" className="subtle-stop-motion" style={{
          position: 'absolute',
          bottom: '11rem',
          left: '14.5rem',
          width: 'clamp(15.5rem, 26vw, 26rem)',
          height: 'auto',
          pointerEvents: 'none',
          opacity: bigArrowOpacity,
        }} />
      )}
    </div>
  )
}