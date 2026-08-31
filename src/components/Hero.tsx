import { useRef, useState, useEffect } from 'react'
import { useScroll } from 'framer-motion'
import BlobCurtain from './BlobCurtain'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Mode } from '../App'

interface Props {
  curtainDone: boolean
  onCurtainDropping: () => void
  setCurtainDone: (v: boolean) => void
  onTypingDone: () => void
  onTypingReset: () => void
  onAdvance: () => void
  mode: Mode
  mobilePressed: boolean
}

const DESCRIPTION_TEXT = "An analysis of the socioeconomic and racial makeups of classrooms in American public schools"

export default function Hero({ curtainDone, onCurtainDropping, setCurtainDone, onTypingDone, onTypingReset, mode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const pinkDotRef = useRef<HTMLImageElement>(null)
  const greenDotRef = useRef<HTMLImageElement>(null)
  const [buttonHovered, setButtonHovered] = useState(false)
  // Bumped by the "Click me"/"Tap me" button below — the sole trigger for
  // the dot-expansion/curtain-drop sequence now, on both desktop and
  // mobile. Previously desktop grew the blobs by scrolling and mobile by a
  // press-and-hold gesture; both are gone in favor of this single click,
  // passed straight through to BlobCurtain.
  const [manualTrigger, setManualTrigger] = useState(0)
  // True only once the ENTIRE sequence (growth + curtain-drop) has
  // actually finished — see BlobCurtain's onSequenceComplete for why this
  // is deliberately NOT the same as curtainDone (which fires at the START
  // of the drop, so the intro content underneath can mount in time to be
  // revealed as the curtain falls away). Hero itself no longer renders any
  // post-click content at all — the citation paragraph that used to live
  // here moved directly into ArticleSection.tsx, so there's nothing left
  // to show once the sequence finishes; this wrapper just collapses to
  // nothing and Section 01 continues immediately below it.
  const [sequenceComplete, setSequenceComplete] = useState(false)

  // Mirrors curtainDone's old relay duty (it used to hand this off to
  // ArticleIntro's onDone, which no longer exists) — fires the app-level
  // scroll-lock's unlock signal once the sequence genuinely finishes,
  // and resets it if the user scrolls back up to the landing page.
  // Deliberately later than the wrapper's own collapse below — the wrapper
  // collapses as soon as curtainDone fires so Section 01's content is
  // already reflowed into its final position while the curtain is still
  // visually falling (that's what makes the curtain's motion actually
  // reveal it, instead of the text popping in only after the curtain's
  // already gone) — but scroll itself stays locked a bit longer, through
  // sequenceComplete, so the user can't scroll away mid-reveal.
  useEffect(() => {
    if (sequenceComplete) {
      onTypingDone()
    }
  }, [sequenceComplete, onTypingDone])

  useEffect(() => {
    if (!curtainDone) {
      setSequenceComplete(false)
      onTypingReset()
    }
  }, [curtainDone, onTypingReset])

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  })

  const circleButtonSize = isMobile ? 95 : 195

  return (
    // Tall + sticky only pre-click — collapses to nothing the INSTANT
    // curtainDone fires (the start of the drop, not the end), which is
    // what lets Section 01's content already be in its final position
    // while the curtain is still visually falling, so the curtain's own
    // motion is what reveals it rather than a blank gap followed by a
    // sudden pop-in. This is now safe specifically because the bg-color
    // panels and blob shapes (BlobCurtain.tsx) no longer size themselves
    // relative to this wrapper at all — they're position:fixed against
    // the viewport directly, so this can collapse under them mid-drop
    // without stranding anything (which is what caused the earlier
    // leftover-rectangles bug when this used to collapse early).
    <div ref={containerRef} style={{ height: curtainDone ? 0 : '1200vh', overflow: curtainDone ? 'hidden' : 'visible' }}>
      <div style={{
        position: curtainDone ? 'relative' : 'sticky',
        top: 0,
        height: curtainDone ? 0 : '100vh',
        width: '100%',
        backgroundColor: 'var(--color-bg)',
      }}>

        {!curtainDone && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 15 }}>
            {isMobile ? (
              <>
                <img src="/assets/sparkle-sketch.svg" style={{ position: 'absolute', left: '34.4%', top: '3%', width: '13%', animation: 'stopMotionJitterStrong 3s steps(1) infinite' }} />
                <img src="/assets/heart-sketch.svg" style={{ position: 'absolute', left: '73.8%', top: '6%', width: '15%', animation: 'stopMotionJitterStrong 2.7s steps(1) infinite', animationDelay: '0.4s' }} />
                <img src="/assets/plane-sketch.svg" style={{ position: 'absolute', left: '7.7%', top: '10%', width: '100%', animation: 'stopMotionJitterStrong 3.5s steps(1) infinite', animationDelay: '0.8s' }} />
                <img src="/assets/pencil-sketch.svg" style={{ position: 'absolute', left: '-3.3%', top: '14%', width: '20%', animation: 'stopMotionJitterStrong 2.5s steps(1) infinite', animationDelay: '1.2s' }} />
                <img src="/assets/stars-sketch.svg" style={{ position: 'absolute', left: '55%', top: '59%', width: '42%', animation: 'stopMotionJitterStrong 2.8s steps(1) infinite', animationDelay: '1.0s' }} />
                <img src="/assets/apple-sketch.svg" style={{ position: 'absolute', left: '3%', top: '61%', width: '29%', animation: 'stopMotionJitterStrong 3.3s steps(1) infinite', animationDelay: '0.2s' }} />
                <img src="/assets/butterfly-sketch.svg" style={{ position: 'absolute', left: '34%', top: '56%', width: '20%', animation: 'stopMotionJitterStrong 3.2s steps(1) infinite', animationDelay: '0.6s' }} />

                <div style={{ position: 'absolute', top: '36%', transform: 'translateY(-50%)', width: '100%', textAlign: 'center' }}>
                  <div style={{
                    fontFamily: 'omnes-semicond, sans-serif',
                    fontWeight: 700,
                    fontStyle: 'normal',
                    fontSize: 'clamp(1.5rem, 9vw, 35px)',
                    lineHeight: 1.1,
                    color: '#111',
                    position: 'relative',
                    display: 'inline-block',
                  }}>
                    <span style={{ position: 'relative' }}>
                      i
                      <img ref={pinkDotRef} src={mode === 'ses' ? '/assets/pink-dot-on-i.svg' : '/assets/orange-dot-on-i.svg'}
                        style={{ position: 'absolute', top: '0.26em', left: '50%', transform: 'translateX(-50%)', width: '0.45em', pointerEvents: 'none' }} />
                    </span>
                    s Your School
                  </div>
                  <div style={{
                    fontFamily: 'omnes-semicond, sans-serif',
                    fontWeight: 700,
                    fontStyle: 'italic',
                    fontSize: 'clamp(2rem, 15.4vw, 60px)',
                    lineHeight: 1.1,
                    color: '#111',
                    position: 'relative',
                    display: 'inline-block',
                  }}>
                    Segregated
                    <span style={{ position: 'relative' }}>
                      ?
                      <img ref={greenDotRef} src={mode === 'ses' ? '/assets/green-dot-on-q.svg' : '/assets/blue-dot-on-q.svg'}
                        style={{ position: 'absolute', top: '0.81em', left: '40.5%', transform: 'translateX(-50%)', width: '0.21em', pointerEvents: 'none' }} />
                    </span>
                  </div>
                </div>

                {/* Description text — left-aligned rather than centered,
                    smaller than the old "scroll"/"press & hold" cue it
                    replaces. */}
                <div style={{
                  position: 'absolute',
                  left: '6.5%',
                  top: '45%',
                  width: '52%',
                  textAlign: 'right',
                  fontFamily: "'Gaegu', cursive",
                  fontSize: 'clamp(0.85rem, 3.6vw, 1.15rem)',
                  lineHeight: 1.15,
                  color: '#111',
                }}>
                  {DESCRIPTION_TEXT}
                </div>

                {/* "Tap me" button — button.svg, with a drop-shadow.
                    Tapping this is now the ONLY way to start the intro on
                    mobile — no more press-and-hold. */}
                <div
                  onClick={() => setManualTrigger(v => v + 1)}
                  style={{
                    position: 'absolute',
                    left: '77%',
                    top: '49%',
                    transform: 'translate(-50%, -50%)',
                    width: circleButtonSize,
                    height: circleButtonSize,
                    cursor: 'pointer',
                  }}
                >
                  <img
                    src="/assets/button.svg"
                    style={{
                      position: 'absolute', inset: 0,
                      width: '100%', height: '100%',
                      filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.4))',
                      // Isolates this into its own compositing layer — a
                      // known mobile Safari/WebKit quirk can rasterize
                      // filter:drop-shadow using the element's bounding box
                      // (reading as a boxy shadow) instead of its actual
                      // alpha silhouette when it shares a layer with
                      // sibling 3D-transformed content (the TAP ME span
                      // below uses perspective/rotateX).
                      transform: 'translateZ(0)',
                      WebkitBackfaceVisibility: 'hidden',
                    }}
                  />
                  <span style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    textAlign: 'center',
                    fontFamily: "'Gaegu', cursive",
                    fontSize: 'clamp(1.1rem, 4.6vw, 1.5rem)',
                    fontWeight: 700,
                    color: '#111',
                    pointerEvents: 'none',
                    transform: 'translateY(-10px) perspective(200px) rotateX(35deg)',
                  }}>
                    TAP ME
                  </span>
                </div>
              </>
            ) : (
              <>
                <img src="/assets/pencil-sketch.svg" style={{ position: 'absolute', left: '0.4%', top: '13.4%', width: '12.3%', animation: 'stopMotionJitterStrong 3s steps(1) infinite' }} />
                <img src="/assets/apple-sketch.svg" style={{ position: 'absolute', left: '0.8%', top: '64.0%', width: '16.8%', animation: 'stopMotionJitterStrong 3.3s steps(1) infinite', animationDelay: '0.2s' }} />
                <img src="/assets/butterfly-sketch.svg" style={{ position: 'absolute', left: '21%', top: '69%', width: '14%', animation: 'stopMotionJitterStrong 3.2s steps(1) infinite', animationDelay: '0.6s' }} />
                <img src="/assets/sparkle-sketch.svg" style={{ position: 'absolute', left: '18.9%', top: '4.8%', width: '10.6%', animation: 'stopMotionJitterStrong 2.7s steps(1) infinite', animationDelay: '0.4s' }} />
                <img src="/assets/plane-sketch.svg" style={{ position: 'absolute', left: '44.3%', top: '8.2%', width: '57.3%', animation: 'stopMotionJitterStrong 3.5s steps(1) infinite', animationDelay: '0.8s' }} />
                <img src="/assets/heart-sketch.svg" style={{ position: 'absolute', left: '81.4%', top: '4.4%', width: '10.2%', animation: 'stopMotionJitterStrong 2.7s steps(1) infinite', animationDelay: '1.0s' }} />
                <img src="/assets/stars-sketch.svg" style={{ position: 'absolute', left: '68.8%', top: '57.8%', width: '28.5%', animation: 'stopMotionJitterStrong 2.8s steps(1) infinite', animationDelay: '1.2s' }} />

                <div style={{ position: 'absolute', top: '26.5%', width: '100%', textAlign: 'center' }}>
                  <div style={{
                    fontFamily: 'omnes-semicond, sans-serif',
                    fontWeight: 700,
                    fontStyle: 'normal',
                    fontSize: 'clamp(1.5rem, 5.8vw, 100px)',
                    lineHeight: 1.0,
                    color: '#111',
                    position: 'relative',
                  }}>
                    <span style={{ position: 'relative' }}>
                      i
                      <img ref={pinkDotRef} src={mode === 'ses' ? '/assets/pink-dot-on-i.svg' : '/assets/orange-dot-on-i.svg'}
                        style={{ position: 'absolute', top: '0.24em', left: '50%', transform: 'translateX(-50%)', width: '0.45em', pointerEvents: 'none' }} />
                    </span>
                    s Your School
                  </div>
                  <div style={{
                    fontFamily: 'omnes-semicond, sans-serif',
                    fontWeight: 700,
                    fontStyle: 'italic',
                    fontSize: 'clamp(2rem, 11vw, 168px)',
                    lineHeight: 1.1,
                    color: '#111',
                    position: 'relative',
                  }}>
                    Segregated
                    <span style={{ position: 'relative' }}>
                      ?
                      <img ref={greenDotRef} src={mode === 'ses' ? '/assets/green-dot-on-q.svg' : '/assets/blue-dot-on-q.svg'}
                        style={{ position: 'absolute', top: '0.79em', left: '40.5%', transform: 'translateX(-50%)', width: '0.21em', pointerEvents: 'none' }} />
                    </span>
                  </div>
                </div>

                {/* Description text — right-aligned, smaller than the old
                    "scroll" cue it replaces. */}
                <div style={{
                  position: 'absolute',
                  left: '32.5%',
                  top: '62.3%',
                  width: '22%',
                  textAlign: 'right',
                  fontFamily: "'Gaegu', cursive",
                  fontSize: 'clamp(1.02rem, 1.8vw, 1.4rem)',
                  lineHeight: 1.15,
                  color: '#111',
                }}>
                  {DESCRIPTION_TEXT}
                </div>

                {/* "Click me" button — button.svg, with a drop-shadow.
                    Clicking this is now the ONLY way to start the intro on
                    desktop — no more scrolling to grow the blobs. */}
                <div
                  onClick={() => setManualTrigger(v => v + 1)}
                  onMouseEnter={() => setButtonHovered(true)}
                  onMouseLeave={() => setButtonHovered(false)}
                  style={{
                    position: 'absolute',
                    left: '64%',
                    top: '69%',
                    transform: `translate(-50%, -50%) scale(${buttonHovered ? 1.06 : 1})`,
                    transition: 'transform 0.2s ease',
                    width: circleButtonSize,
                    height: circleButtonSize,
                    cursor: 'pointer',
                  }}
                >
                  <img
                    src="/assets/button.svg"
                    style={{
                      position: 'absolute', inset: 0,
                      width: '100%', height: '100%',
                      filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.4))',
                    }}
                  />
                  <span style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    textAlign: 'center',
                    fontFamily: "'Gaegu', cursive",
                    fontSize: 'clamp(1.5rem, 2.25vw, 1.8rem)',
                    fontWeight: 700,
                    color: '#111',
                    pointerEvents: 'none',
                    transform: 'translateY(-21px) perspective(220px) rotateX(35deg)',
                  }}>
                    CLICK ME
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        <BlobCurtain
          scrollYProgress={scrollYProgress}
          onCurtainDone={() => setCurtainDone(true)}
          onCurtainReset={() => setCurtainDone(false)}
          onCurtainDropping={onCurtainDropping}
          mode={mode}
          pinkDotRef={pinkDotRef as any}
          greenDotRef={greenDotRef as any}
          manualTrigger={manualTrigger}
          onSequenceComplete={() => setSequenceComplete(true)}
        />

      </div>
    </div>
  )
}