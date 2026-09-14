import { useIsMobile } from '../hooks/useIsMobile'

const TITLE_TEXT = "How do these graphs actually work?"

// Simple full-screen, title-only breather between GraphSectionElementary
// and GraphSectionRepelAttract. Static text, no type-in (removed per
// feedback). Sits with blank space around it — except that space isn't
// really blank once GraphSectionRepelAttract's own negative-margin
// overlap (bumped way up, see that file's marginTop) pulls its floating
// "settle" nodes up into view here, so this screen leaves them room
// below the title rather than dead-centering it. The bigarrow (restored
// here, same size/formatting as its old spot in ArticleSection.tsx,
// before it was removed) points from the bottom-left toward wherever
// those nodes end up.
export default function GraphExplainerIntro() {
  const isMobile = useIsMobile()

  return (
    <div style={{
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
          corner instead of relative to the old intro paragraph block. */}
      {!isMobile && (
        <img src="/assets/bigarrow.svg" className="subtle-stop-motion" style={{
          position: 'absolute',
          bottom: '5rem',
          left: '14.5rem',
          width: 'clamp(15.5rem, 26vw, 26rem)',
          height: 'auto',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  )
}