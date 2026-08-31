import { useIsMobile } from '../hooks/useIsMobile'
import type { Mode } from '../App'

// Recycled from its old typed-paragraph implementation (course-tracking
// definition popup, SES/race pink-green paragraph, scroll cue) — axed per
// feedback favoring the site's "no more freeze-frame" static-text
// direction. Now holds the "Section 01: Elementary School" title +
// intro body text that used to live inline in ArticleSection.tsx, moved
// here specifically so that file doesn't have to carry ad-hoc section
// content directly — this component is the reusable home for it instead.
//
// Title formatting matches the original Section01Part1 title exactly;
// body paragraph formatting matches Part1's own paragraph convention; the
// face-SVG row keeps this file's own original positioning convention
// (space-between, max-width 900px, staggered bob animation) — the one
// piece of the old layout that's still an exact fit for the new content.
interface Props {
  mode: Mode
}

export default function Section01Part2({ mode }: Props) {
  const isMobile = useIsMobile()

  const dot1Src = mode === 'race' ? '/assets/whiteasian-dot-45.svg' : '/assets/high-SES-dot-45.svg'
  const dot2Src = mode === 'race' ? '/assets/poc-dot-45.svg' : '/assets/low-SES-dot-45.svg'

  return (
    <div style={{
      width: '100%', minHeight: isMobile ? '110vh' : '150vh', backgroundColor: 'var(--color-bg)', position: 'relative', zIndex: 10,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: isMobile ? '3rem 2rem 3rem 2rem' : '4rem 2rem',
      gap: isMobile ? '1.3rem' : '2.7rem',
    }}>
      <h2 style={{
        fontFamily: "'Gaegu', cursive",
        fontSize: 'clamp(2rem, 5vw, 4rem)',
        color: '#111', fontWeight: 400, textAlign: 'center', margin: 0,
      }}>
        Section 01: Elementary School
      </h2>

      <p style={{
        fontFamily: "'Kiwi Maru', serif",
        fontSize: isMobile ? 'clamp(1.1rem, 4.4vw, 1.4rem)' : 'clamp(1.3rem, 2.2vw, 1.7rem)',
        color: '#111', lineHeight: 1.9,
        maxWidth: '940px', width: '100%', textAlign: 'center', margin: 0,
      }}>
        Keeping in mind how class networks are formed, let's trace these two kindergarten students throughout their time in elementary school. Observe how patterns of classroom sharing change as our students get older.
      </p>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', maxWidth: '900px', padding: isMobile ? '0.5rem 0' : '1rem 0',
        marginTop: isMobile ? '-0.3rem' : '-0.8rem',
      }}>
        <img src={dot1Src} style={{
          width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(100px, 15vw, 180px)',
          height: 'auto', animation: 'bob 2s ease-in-out infinite',
        }} />
        <img src={dot2Src} style={{
          width: isMobile ? 'clamp(80px, 22vw, 120px)' : 'clamp(100px, 15vw, 180px)',
          height: 'auto', animation: 'bob 2s ease-in-out infinite', animationDelay: '0.4s',
        }} />
      </div>
    </div>
  )
}