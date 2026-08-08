import { useRef } from 'react'
import { useScroll } from 'framer-motion'
import BlobCurtain from './BlobCurtain'
import ArticleIntro from './ArticleIntro'
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

export default function Hero({ curtainDone, onCurtainDropping, setCurtainDone, onTypingDone, onTypingReset, onAdvance, mode, mobilePressed }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const pinkDotRef = useRef<HTMLImageElement>(null)
  const greenDotRef = useRef<HTMLImageElement>(null)

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  })

  return (
    // Keep a uniform structural height tracking footprint so Framer Motion doesn't snap to 1.0 immediately
    <div ref={containerRef} style={{ height: '1200vh' }}>
      <div style={{
        position: 'sticky',
        top: 0,
        height: '100vh',
        width: '100%',
        backgroundColor: 'var(--color-bg)',
      }}>

        {curtainDone && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            backgroundColor: 'var(--color-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isMobile ? '3.5rem 2rem 1.5rem 2rem' : '4rem 4rem 4rem 4rem',
          }}>
            <ArticleIntro
              startTyping={curtainDone}
              onDone={onTypingDone}
              onReset={onTypingReset}
              onAdvance={onAdvance}
              mode={mode}
            />
          </div>
        )}

        {!curtainDone && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 15 }}>
            {isMobile ? (
              <>
                <img src="/assets/sparkle-sketch.svg" style={{ position: 'absolute', left: '34.4%', top: '3%', width: '13%', animation: 'teeter 3s ease-in-out infinite' }} />
                <img src="/assets/heart-sketch.svg" style={{ position: 'absolute', left: '73.8%', top: '6%', width: '15%', animation: 'teeter 2.7s ease-in-out infinite', animationDelay: '0.4s' }} />
                <img src="/assets/plane-sketch.svg" style={{ position: 'absolute', left: '7.7%', top: '10%', width: '100%', animation: 'teeter 3.5s ease-in-out infinite', animationDelay: '0.8s' }} />
                <img src="/assets/pencil-sketch.svg" style={{ position: 'absolute', left: '-3.3%', top: '14%', width: '20%', animation: 'teeter 2.5s ease-in-out infinite', animationDelay: '1.2s' }} />
                <img src="/assets/butterfly-sketch.svg" style={{ position: 'absolute', left: '5%', top: '52%', width: '25%', animation: 'teeter 3.2s ease-in-out infinite', animationDelay: '0.6s' }} />
                <img src="/assets/stars-sketch.svg" style={{ position: 'absolute', left: '55%', top: '58%', width: '42%', animation: 'teeter 2.8s ease-in-out infinite', animationDelay: '1.0s' }} />
                <img src="/assets/apple-sketch.svg" style={{ position: 'absolute', left: '2%', top: '64%', width: '28%', animation: 'teeter 3.3s ease-in-out infinite', animationDelay: '0.2s' }} />

                <div style={{ position: 'absolute', top: '38%', transform: 'translateY(-50%)', width: '100%', textAlign: 'center' }}>
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

                <div style={{
                  position: 'absolute',
                  left: '50%',
                  top: '49%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontFamily: "'Gaegu', cursive",
                  fontSize: 'clamp(0.6rem, 5vw, 22px)',
                  color: '#111',
                }}>
                  <span>press & hold</span>
                  <img src="/assets/tap-icon.svg" style={{ width: '5.5vw', maxWidth: '22px', animation: 'bob 2s ease-in-out infinite' }} />
                </div>
              </>
            ) : (
              <>
                <img src="/assets/pencil-sketch.svg" style={{ position: 'absolute', left: '0.4%', top: '13.4%', width: '12.3%', animation: 'teeter 3s ease-in-out infinite' }} />
                <img src="/assets/apple-sketch.svg" style={{ position: 'absolute', left: '0.8%', top: '64.0%', width: '16.8%', animation: 'teeter 3.3s ease-in-out infinite', animationDelay: '0.2s' }} />
                <img src="/assets/sparkle-sketch.svg" style={{ position: 'absolute', left: '18.9%', top: '4.8%', width: '10.6%', animation: 'teeter 2.7s ease-in-out infinite', animationDelay: '0.4s' }} />
                <img src="/assets/butterfly-sketch.svg" style={{ position: 'absolute', left: '21.9%', top: '66.6%', width: '15.2%', animation: 'teeter 3.2s ease-in-out infinite', animationDelay: '0.6s' }} />
                <img src="/assets/plane-sketch.svg" style={{ position: 'absolute', left: '44.3%', top: '9.7%', width: '57.3%', animation: 'teeter 3.5s ease-in-out infinite', animationDelay: '0.8s' }} />
                <img src="/assets/heart-sketch.svg" style={{ position: 'absolute', left: '81.4%', top: '4.4%', width: '10.2%', animation: 'teeter 2.7s ease-in-out infinite', animationDelay: '1.0s' }} />
                <img src="/assets/stars-sketch.svg" style={{ position: 'absolute', left: '68.8%', top: '57.8%', width: '28.5%', animation: 'teeter 2.8s ease-in-out infinite', animationDelay: '1.2s' }} />

                <div style={{ position: 'absolute', top: '28%', width: '100%', textAlign: 'center' }}>
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

                <div style={{
                  position: 'absolute',
                  left: '49.9%',
                  top: '64.8%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1.5rem',
                  fontFamily: "'Gaegu', cursive",
                  fontSize: 'clamp(0.8rem, 2.8vw, 40px)',
                  color: '#111',
                }}>
                  <span>scroll</span>
                  <img src="/assets/down-scroll-arrow.svg" style={{ width: '3.55vw', maxWidth: '38px' }} />
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
          mobilePressed={mobilePressed}
        />

      </div>
    </div>
  )
}