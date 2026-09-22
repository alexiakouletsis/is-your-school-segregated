import { useEffect, useRef, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Mode } from '../App'

interface Dot {
  id: number
  baseX: number
  baseY: number
  convergeOffsetX: number
  convergeOffsetY: number
  explodeX: number
  explodeY: number
  explodeScale: number
  size: number
  color: string
  bobDuration: number
  bobDelay: number
  bobAmount: number
  convergeDelay: number
}

const SES_COLORS = ['#FF8BDE', '#FF8BDE', '#22D880', '#22D880', '#FF8BDE', '#22D880']
const RACE_COLORS = ['#FF9260', '#FF9260', '#8BA4FF', '#8BA4FF', '#FF9260', '#8BA4FF']

const CONVERGE_CENTER_X = 50
const CONVERGE_CENTER_Y = 48
const CONVERGE_JITTER_PX = 70

const CONVERGE_END = 0.55
const HOLD_END = 0.60
const CONVERGE_END_MOBILE = 0.30
const HOLD_END_MOBILE = 0.35
const BURST_MS = 900
const CONTENT_DELAY_MS = 350

function generateDots(mode: Mode, count: number): Dot[] {
  const colors = mode === 'race' ? RACE_COLORS : SES_COLORS
  const dots: Dot[] = []
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = Math.sqrt(Math.random()) * CONVERGE_JITTER_PX
    dots.push({
      id: i,
      baseX: Math.random() * 100,
      baseY: Math.random() * 100,
      convergeOffsetX: Math.cos(angle) * radius,
      convergeOffsetY: Math.sin(angle) * radius,
      explodeX: -15 + Math.random() * 130,
      explodeY: -15 + Math.random() * 130,
      explodeScale: 4 + Math.random() * 8,
      size: 10 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      bobDuration: 1.8 + Math.random() * 1.4,
      bobDelay: Math.random() * 2,
      bobAmount: 6 + Math.random() * 8,
      convergeDelay: Math.random(),
    })
  }
  return dots
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))

function renderAlternating(text: string, colorA: string, colorB: string) {
  return text.split('').map((ch, i) => (
    <span key={i} style={{ color: i % 2 === 0 ? colorA : colorB }}>{ch}</span>
  ))
}

const PARA_BEFORE = "School integration has been proven to help disrupt concentrations of poverty and enhance academic outcomes. Yet, within-school segregation is typically a subject that flies under the radar. Putting visuals to the data patterns, talking about the problem, and having empathy for each student in these networks-and nurturing their potential-is how we can truly make a difference. A more connected future can only be achieved by dissolving the walls we have implicitly held for so long. "
const PARA_ACCENT = "Genuine connection"
const PARA_AFTER = " starts by sharing a space."
const PARA_FULL = PARA_BEFORE + PARA_ACCENT + PARA_AFTER

type DialogueSegment = { text: string, color: 'high' | 'low' | null }
type DialogueLine = { speaker: 'high' | 'low', segments: DialogueSegment[], delay: number }

const DIALOGUE_LINES: DialogueLine[] = [
  {
    speaker: 'high',
    segments: [
      { text: '', color: 'low' },
      { text: "!? Is that you? It's been ages!", color: null },
    ],
    delay: 0,
  },
  {
    speaker: 'low',
    segments: [
      { text: 'No way, ', color: null },
      { text: '', color: 'high' },
      { text: "!? I haven't seen you since freshman year of high school!", color: null },
    ],
    delay: 1400,
  },
  {
    speaker: 'high',
    segments: [
      { text: "Yeah, I guess we just... grew apart. Can we get coffee and catch up?", color: null },
    ],
    delay: 2900,
  },
  {
    speaker: 'low',
    segments: [
      { text: "Absolutely!", color: null },
    ],
    delay: 4200,
  },
]

const getDialogueName = (mode: Mode, who: 'high' | 'low') => {
  if (mode === 'race') return who === 'high' ? 'Orange' : 'Blue'
  return who === 'high' ? 'Pink' : 'Green'
}

const INFO_BEFORE = "For more information similar subjects, click "
const INFO_HERE = "here"
const INFO_MIDDLE = " to see "
const INFO_LINK = "Plural Connection Group's other research projects"
const INFO_AFTER = "."
const INFO_FULL = INFO_BEFORE + INFO_HERE + INFO_MIDDLE + INFO_LINK + INFO_AFTER

interface Props {
  mode: Mode
  onToggleModeAndScrollTop?: () => void
  skipSignal?: number
  onRevealed?: () => void
}

export default function Conclusion({ mode, onToggleModeAndScrollTop: _onToggleModeAndScrollTop, skipSignal, onRevealed }: Props) {
  const isMobile = useIsMobile()

  const containerRef = useRef<HTMLDivElement>(null)
  const [dots, setDots] = useState<Dot[]>(() => generateDots(mode, 500))
  const [dotColors, setDotColors] = useState<string[]>(() => dots.map(d => d.color))
  const dotRefs = useRef<(HTMLDivElement | null)[]>([])
  const rafRef = useRef<number | null>(null)
  const frameSkipRef = useRef(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 })
  const stableViewportRef = useRef({ width: 0, height: 0 })
  const lastOpacityRef = useRef<number[]>([])
  const lastTransformRef = useRef<number[]>([])
  const hasExplodedRef = useRef(false)
  const RENDER_SCALE = isMobile ? 3 : 1
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const explodeRafRef = useRef<number | null>(null)
  const explodeStartRef = useRef<number | null>(null)

  const [contentVisible, setContentVisible] = useState(false)
  const [infoDone, setInfoDone] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [sigHovered, setSigHovered] = useState(false)
  const contentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dialogueVisible, setDialogueVisible] = useState<boolean[]>(DIALOGUE_LINES.map(() => false))
  const [dialogueDone, setDialogueDone] = useState(false)
  const dialogueTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const hasPlayedDialogueRef = useRef(false)
  const hasFiredRevealedRef = useRef(false)
  const fireRevealed = useCallback(() => {
    if (hasFiredRevealedRef.current) return
    hasFiredRevealedRef.current = true
    onRevealed?.()
  }, [onRevealed])
  const bodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!contentVisible || !bodyRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fireRevealed()
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(bodyRef.current)
    return () => observer.disconnect()
  }, [contentVisible, fireRevealed])
  const lockScrollYRef = useRef<number | null>(null)
  const [sequenceStarted, setSequenceStarted] = useState(false)
  const mobileLockCleanupRef = useRef<(() => void) | null>(null)
  const mobileLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const releaseMobileLock = useCallback(() => {
    if (mobileLockTimerRef.current !== null) {
      clearTimeout(mobileLockTimerRef.current)
      mobileLockTimerRef.current = null
    }
    if (mobileLockCleanupRef.current) {
      mobileLockCleanupRef.current()
      mobileLockCleanupRef.current = null
    }
  }, [])

  useEffect(() => {
    const measure = () => {
      if (!panelRef.current) return
      const r = panelRef.current.getBoundingClientRect()
      setPanelSize(prev => {
        if (Math.abs(r.width - prev.width) < 8 && Math.abs(r.height - prev.height) < 8) {
          return prev
        }
        return { width: r.width, height: r.height }
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (panelRef.current) observer.observe(panelRef.current)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  useEffect(() => {
    const measure = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      if (stableViewportRef.current.width === 0 && stableViewportRef.current.height === 0) {
        stableViewportRef.current = { width: w, height: h }
        return
      }
      if (Math.abs(w - stableViewportRef.current.width) < 8 && Math.abs(h - stableViewportRef.current.height) < 8) {
        return
      }
      stableViewportRef.current = { width: w, height: h }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  useEffect(() => {
    if (!isMobile || !canvasRef.current) return
    const canvas = canvasRef.current
    const resize = () => {
      if (explodeRafRef.current !== null) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [isMobile])

  const resetContent = useCallback(() => {
    setContentVisible(false)
    setInfoDone(false)
    setSkipped(false)
    setSigHovered(false)
    setSequenceStarted(false)
    setDialogueVisible(DIALOGUE_LINES.map(() => false))
    setDialogueDone(false)
    hasPlayedDialogueRef.current = false
    dialogueTimersRef.current.forEach(t => clearTimeout(t))
    dialogueTimersRef.current = []
    lockScrollYRef.current = null
    if (contentTimeoutRef.current) clearTimeout(contentTimeoutRef.current)
  }, [])

  useEffect(() => {
    const count = isMobile ? 160 : 700
    setDots(generateDots(mode, count))
    lastOpacityRef.current = new Array(count).fill(-1)
    lastTransformRef.current = new Array(count * 2).fill(Infinity)
    hasExplodedRef.current = false
    resetContent()
  }, [isMobile])

  useEffect(() => {
    const colors = mode === 'race' ? RACE_COLORS : SES_COLORS
    setDotColors(dots.map(() => colors[Math.floor(Math.random() * colors.length)]))
  }, [mode, dots])

  const getConvergeProgress = (dot: Dot, p: number) => {
    const convergeEnd = isMobile ? CONVERGE_END_MOBILE : CONVERGE_END
    const start = dot.convergeDelay * 0.15
    if (p <= start) return 0
    if (p >= convergeEnd) return 1
    return (p - start) / (convergeEnd - start)
  }

  const getDotOpacity = (dot: Dot, p: number) => {
    const revealStart = dot.convergeDelay * 0.15
    const revealEnd = revealStart + 0.05
    if (p < revealStart) return 0
    if (p < revealEnd) return (p - revealStart) / (revealEnd - revealStart)
    return 1
  }

  useEffect(() => {
    if (!contentVisible || skipped) return
    if (hasPlayedDialogueRef.current) return
    hasPlayedDialogueRef.current = true
    DIALOGUE_LINES.forEach((_, i) => {
      const t = setTimeout(() => {
        setDialogueVisible(prev => { const next = [...prev]; next[i] = true; return next })
        if (i === DIALOGUE_LINES.length - 1) setDialogueDone(true)
      }, DIALOGUE_LINES[i].delay + 400)
      dialogueTimersRef.current.push(t)
    })
  }, [contentVisible, skipped])

  useEffect(() => {
    if (!contentVisible || skipped) return
    setInfoDone(true)
  }, [contentVisible, skipped])

  const skipAll = useCallback(() => {
    if (skipped || infoDone) return
    setSkipped(true)
    setContentVisible(true)
    dialogueTimersRef.current.forEach(t => clearTimeout(t))
    setDialogueVisible(DIALOGUE_LINES.map(() => true))
    setDialogueDone(true)
    setInfoDone(true)
    fireRevealed()
  }, [skipped, infoDone, fireRevealed])

  // Click/tap-to-skip for the reunion dialogue specifically, matching the
  // graph sections' own dialogue-skip convention — needed as a SEPARATE
  // function from skipAll above, since infoDone flips true the instant
  // contentVisible does (see that effect just above this one), which is
  // BEFORE the dialogue even starts playing. That left the container's
  // own onClick (gated on !infoDone) disabled for the entire ~4.6s the
  // dialogue actually plays out over, so clicking during it did nothing.
  const skipDialogue = useCallback(() => {
    if (dialogueDone) return
    dialogueTimersRef.current.forEach(t => clearTimeout(t))
    dialogueTimersRef.current = []
    setDialogueVisible(DIALOGUE_LINES.map(() => true))
    setDialogueDone(true)
  }, [dialogueDone])

  const lastSkipSignalRef = useRef(skipSignal)
  useEffect(() => {
    if (skipSignal === undefined) return
    if (skipSignal === lastSkipSignalRef.current) return
    lastSkipSignalRef.current = skipSignal
    skipAll()
  }, [skipSignal, skipAll])

  useEffect(() => {
    if (isMobile) return
    if (!sequenceStarted || infoDone || skipped) return
    const preventScroll = (e: Event) => {
      e.preventDefault()
      window.scrollTo(0, lockScrollYRef.current ?? 0)
    }
    window.addEventListener('wheel', preventScroll, { passive: false })
    window.addEventListener('touchmove', preventScroll, { passive: false })
    return () => {
      window.removeEventListener('wheel', preventScroll)
      window.removeEventListener('touchmove', preventScroll)
    }
  }, [sequenceStarted, infoDone, skipped, isMobile])

  useEffect(() => {
    return releaseMobileLock
  }, [releaseMobileLock])


  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return
      const readyWidth = isMobile ? stableViewportRef.current.width : panelSize.width
      const readyHeight = isMobile ? stableViewportRef.current.height : panelSize.height
      if (readyWidth === 0 || readyHeight === 0) return
      const rect = containerRef.current.getBoundingClientRect()
      const containerHeight = containerRef.current.offsetHeight

      if (rect.bottom < -window.innerHeight || rect.top > containerHeight + window.innerHeight) {
        return
      }

      const p = clamp01((-rect.top) / (containerHeight - window.innerHeight))
      const vw = isMobile ? stableViewportRef.current.width : panelSize.width
      const vh = isMobile ? stableViewportRef.current.height : panelSize.height
      const centerPxX = vw * (CONVERGE_CENTER_X / 100)
      const centerPxY = vh * (CONVERGE_CENTER_Y / 100)

      const holdEnd = isMobile ? HOLD_END_MOBILE : HOLD_END
      const reverseThreshold = isMobile ? holdEnd - 0.08 : holdEnd
      if (hasExplodedRef.current) {
        if (p < reverseThreshold) {
          hasExplodedRef.current = false
          if (isMobile) releaseMobileLock()
          if (isMobile) {
            if (explodeRafRef.current !== null) {
              cancelAnimationFrame(explodeRafRef.current)
              explodeRafRef.current = null
            }
            explodeStartRef.current = null
            const ctx = canvasRef.current?.getContext('2d')
            if (ctx) ctx.clearRect(0, 0, vw, vh)
          } else {
            dots.forEach((_, i) => {
              const el = dotRefs.current[i]
              if (el) el.style.transition = ''
            })
          }
          resetContent()

          if (isMobile) {
            const ctx = canvasRef.current?.getContext('2d')
            if (ctx) {
              ctx.clearRect(0, 0, vw, vh)
              dots.forEach((dot, i) => {
                const opacity = getDotOpacity(dot, p)
                lastOpacityRef.current[i] = opacity
                if (opacity <= 0.003) return
                const basePxX = vw * (dot.baseX / 100)
                const basePxY = vh * (dot.baseY / 100)
                const convergePxX = centerPxX + dot.convergeOffsetX
                const convergePxY = centerPxY + dot.convergeOffsetY
                const convergeT = easeOutCubic(getConvergeProgress(dot, p))
                const dx = (convergePxX - basePxX) * convergeT
                const dy = (convergePxY - basePxY) * convergeT
                ctx.globalAlpha = opacity
                ctx.fillStyle = dotColors[i]
                ctx.beginPath()
                ctx.arc(basePxX + dx, basePxY + dy, dot.size / 2, 0, Math.PI * 2)
                ctx.fill()
              })
              ctx.globalAlpha = 1
            }
          } else {
            dots.forEach((dot, i) => {
              const el = dotRefs.current[i]
              if (!el) return

              const opacity = getDotOpacity(dot, p)
              if (Math.abs(opacity - (lastOpacityRef.current[i] ?? -1)) > 0.004) {
                el.style.opacity = String(opacity)
                lastOpacityRef.current[i] = opacity
              }

              const basePxX = vw * (dot.baseX / 100)
              const basePxY = vh * (dot.baseY / 100)
              const convergePxX = centerPxX + dot.convergeOffsetX
              const convergePxY = centerPxY + dot.convergeOffsetY
              const convergeT = easeOutCubic(getConvergeProgress(dot, p))
              const dx = (convergePxX - basePxX) * convergeT
              const dy = (convergePxY - basePxY) * convergeT
              const lastDx = lastTransformRef.current[i * 2]
              const lastDy = lastTransformRef.current[i * 2 + 1]
              if (Math.abs(dx - lastDx) > 0.15 || Math.abs(dy - lastDy) > 0.15) {
                el.style.transform = `translate(${dx}px, ${dy}px) scale(${1 / RENDER_SCALE})`
                lastTransformRef.current[i * 2] = dx
                lastTransformRef.current[i * 2 + 1] = dy
              }
            })
          }
        }
      } else if (p >= holdEnd) {
        hasExplodedRef.current = true
        if (isMobile) {
          explodeStartRef.current = performance.now()
          const drawExplodeFrame = () => {
            const ctx = canvasRef.current?.getContext('2d')
            if (!ctx || explodeStartRef.current === null) return
            const elapsed = performance.now() - explodeStartRef.current
            const t = Math.min(1, elapsed / BURST_MS)
            try {
              const eased = easeOutCubic(t)
              ctx.clearRect(0, 0, vw, vh)
              dots.forEach((dot, i) => {
                try {
                  const basePxX = vw * (dot.baseX / 100)
                  const basePxY = vh * (dot.baseY / 100)
                  const explodePxX = vw * (dot.explodeX / 100)
                  const explodePxY = vh * (dot.explodeY / 100)
                  const dx = (explodePxX - basePxX) * eased
                  const dy = (explodePxY - basePxY) * eased
                  const scale = 1 + (dot.explodeScale - 1) * eased
                  const opacity = 1 - eased
                  lastOpacityRef.current[i] = opacity
                  if (opacity <= 0.003) return
                  const radius = Math.max(0, (dot.size / 2) * scale)
                  if (!Number.isFinite(basePxX + dx) || !Number.isFinite(basePxY + dy) || !Number.isFinite(radius)) return
                  ctx.globalAlpha = opacity
                  ctx.fillStyle = dotColors[i] ?? '#999'
                  ctx.beginPath()
                  ctx.arc(basePxX + dx, basePxY + dy, radius, 0, Math.PI * 2)
                  ctx.fill()
                } catch {
                  // Skip this one dot, not the whole frame/loop.
                }
              })
              ctx.globalAlpha = 1
            } catch {
              // Whatever failed, still fall through to `finally` below so
              // the loop keeps running rather than dying silently.
            } finally {
              explodeRafRef.current = t < 1 ? requestAnimationFrame(drawExplodeFrame) : null
            }
          }
          drawExplodeFrame()
        } else {
          dots.forEach((dot, i) => {
            const el = dotRefs.current[i]
            if (!el) return
            const basePxX = vw * (dot.baseX / 100)
            const basePxY = vh * (dot.baseY / 100)
            const explodePxX = vw * (dot.explodeX / 100)
            const explodePxY = vh * (dot.explodeY / 100)
            el.style.willChange = 'transform, opacity'
            el.style.transition = `transform ${BURST_MS}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${BURST_MS}ms ease-out`
            el.style.transform = `translate(${explodePxX - basePxX}px, ${explodePxY - basePxY}px) scale(${dot.explodeScale / RENDER_SCALE})`
            el.style.opacity = '0'
            lastOpacityRef.current[i] = 0
          })
        }
        lockScrollYRef.current = window.scrollY
        if (isMobile && !mobileLockCleanupRef.current) {
          const target = lockScrollYRef.current
          const preventScroll = (e: Event) => {
            e.preventDefault()
            window.scrollTo(0, target)
          }
          const correctScroll = () => {
            if (Math.abs(window.scrollY - target) > 1) {
              window.scrollTo(0, target)
            }
          }
          window.addEventListener('wheel', preventScroll, { passive: false })
          window.addEventListener('touchmove', preventScroll, { passive: false })
          window.addEventListener('scroll', correctScroll, { passive: true })
          mobileLockCleanupRef.current = () => {
            window.removeEventListener('wheel', preventScroll)
            window.removeEventListener('touchmove', preventScroll)
            window.removeEventListener('scroll', correctScroll)
          }
          mobileLockTimerRef.current = setTimeout(releaseMobileLock, BURST_MS + 150)
        }
        setSequenceStarted(true)
        contentTimeoutRef.current = setTimeout(() => {
          setContentVisible(true)
        }, isMobile ? BURST_MS : CONTENT_DELAY_MS)
      } else {
        if (isMobile) {
          const ctx = canvasRef.current?.getContext('2d')
          if (ctx) {
            ctx.clearRect(0, 0, vw, vh)
            dots.forEach((dot, i) => {
              const opacity = getDotOpacity(dot, p)
              lastOpacityRef.current[i] = opacity
              if (opacity <= 0.003) return
              const basePxX = vw * (dot.baseX / 100)
              const basePxY = vh * (dot.baseY / 100)
              const convergePxX = centerPxX + dot.convergeOffsetX
              const convergePxY = centerPxY + dot.convergeOffsetY
              const convergeT = easeOutCubic(getConvergeProgress(dot, p))
              const dx = (convergePxX - basePxX) * convergeT
              const dy = (convergePxY - basePxY) * convergeT
              ctx.globalAlpha = opacity
              ctx.fillStyle = dotColors[i]
              ctx.beginPath()
              ctx.arc(basePxX + dx, basePxY + dy, dot.size / 2, 0, Math.PI * 2)
              ctx.fill()
            })
            ctx.globalAlpha = 1
          }
        } else {
          dots.forEach((dot, i) => {
            const el = dotRefs.current[i]
            if (!el) return

            const opacity = getDotOpacity(dot, p)
            if (Math.abs(opacity - (lastOpacityRef.current[i] ?? -1)) > 0.004) {
              el.style.opacity = String(opacity)
              lastOpacityRef.current[i] = opacity
            }

            const basePxX = vw * (dot.baseX / 100)
            const basePxY = vh * (dot.baseY / 100)
            const convergePxX = centerPxX + dot.convergeOffsetX
            const convergePxY = centerPxY + dot.convergeOffsetY
            const convergeT = easeOutCubic(getConvergeProgress(dot, p))
            const dx = (convergePxX - basePxX) * convergeT
            const dy = (convergePxY - basePxY) * convergeT
            const lastDx = lastTransformRef.current[i * 2]
            const lastDy = lastTransformRef.current[i * 2 + 1]
            if (Math.abs(dx - lastDx) > 0.15 || Math.abs(dy - lastDy) > 0.15) {
              el.style.transform = `translate(${dx}px, ${dy}px) scale(${1 / RENDER_SCALE})`
              lastTransformRef.current[i * 2] = dx
              lastTransformRef.current[i * 2 + 1] = dy
            }
          })
        }
      }
    }

    const handleScroll = () => {
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (isMobile) {
          frameSkipRef.current += 1
          if (frameSkipRef.current % 2 !== 0) return
        }
        update()
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    update()
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (explodeRafRef.current !== null) cancelAnimationFrame(explodeRafRef.current)
      if (contentTimeoutRef.current) clearTimeout(contentTimeoutRef.current)
    }
  }, [dots, dotColors, isMobile, isMobile ? 0 : panelSize.width, isMobile ? 0 : panelSize.height])

  const highColor = mode === 'race' ? 'var(--color-race-1)' : 'var(--color-high-ses)'
  const lowColor = mode === 'race' ? 'var(--color-race-2)' : 'var(--color-low-ses)'

  const renderPara = (text: string) => {
    const beforeLen = PARA_BEFORE.length
    const accentEnd = beforeLen + PARA_ACCENT.length
    const before = text.slice(0, Math.min(text.length, beforeLen))
    const accentTyped = text.slice(beforeLen, Math.min(text.length, accentEnd))
    const after = text.slice(accentEnd)
    return (
      <>
        {before}
        {accentTyped && (
          <span key={mode} className="accent-reanimate" style={{ display: 'inline-block', backgroundColor: 'rgba(253, 244, 203, 0.62)', borderRadius: '3px', padding: '0 0.15em', fontWeight: 700 }}>
            {renderAlternating(accentTyped, highColor, lowColor)}
          </span>
        )}
        {after && <span style={{ fontWeight: 700 }}>{after}</span>}
      </>
    )
  }

  const infoHereStart = INFO_BEFORE.length
  const infoHereEnd = infoHereStart + INFO_HERE.length
  const infoLinkStart = infoHereEnd + INFO_MIDDLE.length
  const infoLinkEnd = infoLinkStart + INFO_LINK.length
  const renderInfo = () => {
    const before = INFO_FULL.slice(0, infoHereStart)
    const here = INFO_FULL.slice(infoHereStart, infoHereEnd)
    const middle = INFO_FULL.slice(infoHereEnd, infoLinkStart)
    const link = INFO_FULL.slice(infoLinkStart, infoLinkEnd)
    const after = INFO_FULL.slice(infoLinkEnd)
    return (
      <>
        {before}
        <a
          href="https://www.pluralconnections.org/projects"
          target="_blank"
          rel="noopener noreferrer"
          className="pcg-link"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: '#9E2591',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '1.08em',
          }}
        >
          {here}
        </a>
        {middle}
        {link}
        {after}
      </>
    )
  }

  const renderDialogueLine = (line: DialogueLine) => (
    <>
      {line.segments.map((seg, i) => {
        if (seg.color && seg.text === '') {
          return <span key={i} style={{ color: seg.color === 'high' ? highColor : lowColor, fontWeight: 700 }}>{getDialogueName(mode, seg.color)}</span>
        }
        if (seg.color) {
          return <span key={i} style={{ color: seg.color === 'high' ? highColor : lowColor, fontWeight: 700 }}>{seg.text}</span>
        }
        return <span key={i}>{seg.text}</span>
      })}
    </>
  )

  const dialogueBubbleStyle = (isRight: boolean, color: string, maxWidth?: string) => ({
    backgroundColor: 'white',
    border: `2px solid ${color}`,
    borderRadius: '12px',
    padding: '0.5rem 0.75rem',
    fontFamily: "'Kiwi Maru', serif",
    fontSize: isMobile ? 'clamp(0.65rem, 2.8vw, 0.85rem)' : 'clamp(0.8rem, 1.2vw, 1rem)',
    color: '#111',
    lineHeight: 1.4,
    boxShadow: '0 7px 17px rgba(0,0,0,0.24)',
    position: 'absolute' as const,
    textAlign: isRight ? 'right' as const : 'left' as const,
    maxWidth: maxWidth ?? (isMobile ? '150px' : '220px'),
  })

  return (
    <div
      ref={containerRef}
      onClick={
        sequenceStarted && !infoDone ? skipAll
        : contentVisible && !dialogueDone ? skipDialogue
        : undefined
      }
      style={{
        height: isMobile ? '420vh' : '300vh',
        position: 'relative',
        flexShrink: 0,
        width: '100vw',
        marginLeft: 'calc(-1 * ((100vw - 100%) / 2))',
        marginTop: isMobile ? '-8vh' : '-15vh',
        cursor: sequenceStarted && !infoDone ? 'default' : 'auto',
      }}
    >
      <div ref={panelRef} style={{
        position: 'sticky',
        top: '-4vh',
        width: '100%',
        marginLeft: 'calc(-1 * ((100vw - 100%) / 2))',
        height: isMobile ? 'calc(100vh + 82vh)' : 'calc(100vh + 8vh)',
        minHeight: isMobile ? 'calc(100vh + 82vh)' : 'calc(100vh + 8vh)',
        overflow: 'hidden',
        backgroundColor: 'transparent',
        ...(isMobile ? { overflowAnchor: 'none' as const, willChange: 'transform' } : {}),
      }}>
        {isMobile ? (
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 2,
              pointerEvents: 'none',
            }}
          />
        ) : (
          dots.map((dot, i) => {
            const renderSize = dot.size * RENDER_SCALE
            return (
              <div
                key={dot.id}
                ref={(el) => { dotRefs.current[i] = el }}
                style={{
                  position: 'absolute',
                  left: `${dot.baseX}%`,
                  top: `${dot.baseY}%`,
                  width: 0,
                  height: 0,
                  opacity: 0,
                  zIndex: 2,
                  pointerEvents: 'none',
                  willChange: 'transform, opacity',
                }}
              >
                <div style={{
                  position: 'absolute',
                  left: -renderSize / 2,
                  top: -renderSize / 2,
                  width: renderSize,
                  height: renderSize,
                  borderRadius: '50%',
                  backgroundColor: dotColors[i],
                  animation: `dotFloatBob ${dot.bobDuration}s ease-in-out infinite`,
                  animationDelay: `${dot.bobDelay}s`,
                  ['--dot-bob-amount' as string]: `${-dot.bobAmount}px`,
                }} />
              </div>
            )
          })
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: contentVisible ? 1 : 0 }}
          transition={{ duration: 0.9 }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            overflowY: isMobile ? 'visible' : 'auto',
            padding: isMobile ? '7.5rem 1.5rem 2.2rem 1.5rem' : '7.5rem 3rem 6.5rem 3rem',
            gap: isMobile ? '2.2rem' : '3.2rem',
            pointerEvents: contentVisible ? 'auto' : 'none',
          }}
        >
          <h2 style={{
            fontFamily: "'Gaegu', cursive",
            fontSize: 'clamp(1.7rem, 4.2vw, 3rem)',
            color: '#111',
            fontWeight: 400,
            textAlign: 'center',
            margin: 0,
            flexShrink: 0,
          }}>
            Fast forward 20 years...
          </h2>

          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'center',
            gap: isMobile ? '4rem' : '10.5rem',
            width: '100%',
            marginTop: isMobile ? '3.2rem' : '2.8rem',
            flexShrink: 0,
          }}>
            <div style={{ position: 'relative', width: isMobile ? '170px' : '270px' }}>
              <div style={{ position: 'relative', height: isMobile ? '16rem' : '14rem' }}>
                {dialogueVisible[0] && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={{ ...dialogueBubbleStyle(false, highColor), top: '-2rem', left: isMobile ? '0.6rem' : '1rem' }}
                  >
                    {renderDialogueLine(DIALOGUE_LINES[0])}
                    {!dialogueVisible[2] && (
                      <>
                        <div style={{ position: 'absolute', bottom: '-10px', left: '20px', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid white' }} />
                        <div style={{ position: 'absolute', bottom: '-13px', left: '18px', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `12px solid ${highColor}` }} />
                      </>
                    )}
                  </motion.div>
                )}
                {dialogueVisible[2] && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={{ ...dialogueBubbleStyle(false, highColor), top: isMobile ? '5rem' : '4.8rem', left: isMobile ? '0.6rem' : '1rem' }}
                  >
                    {renderDialogueLine(DIALOGUE_LINES[2])}
                    <div style={{ position: 'absolute', bottom: '-10px', left: '20px', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid white' }} />
                    <div style={{ position: 'absolute', bottom: '-13px', left: '18px', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `12px solid ${highColor}` }} />
                  </motion.div>
                )}
              </div>
              <img
                src={mode === 'race' ? '/assets/orange-adult.svg' : '/assets/pink-adult.svg'}
                style={{ width: '100%', height: 'auto', display: 'block', animation: dialogueDone ? 'bob 2s ease-in-out infinite' : undefined }}
              />
            </div>
            <div style={{ position: 'relative', width: isMobile ? '170px' : '270px' }}>
              <div style={{ position: 'relative', height: isMobile ? '16rem' : '14rem' }}>
                {dialogueVisible[1] && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={{ ...dialogueBubbleStyle(true, lowColor, mode === 'race' ? (isMobile ? '235px' : '320px') : (isMobile ? '210px' : '280px')), top: isMobile ? '2.5rem' : '1.4rem', right: isMobile ? '0.6rem' : '1rem' }}
                  >
                    {renderDialogueLine(DIALOGUE_LINES[1])}
                    {!dialogueVisible[3] && (
                      <>
                        <div style={{ position: 'absolute', bottom: '-10px', right: '20px', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid white' }} />
                        <div style={{ position: 'absolute', bottom: '-13px', right: '18px', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `12px solid ${lowColor}` }} />
                      </>
                    )}
                  </motion.div>
                )}
                {dialogueVisible[3] && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={{ ...dialogueBubbleStyle(true, lowColor), top: isMobile ? '11rem' : '8.2rem', right: isMobile ? '0.6rem' : '1rem' }}
                  >
                    {renderDialogueLine(DIALOGUE_LINES[3])}
                    <div style={{ position: 'absolute', bottom: '-10px', right: '20px', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid white' }} />
                    <div style={{ position: 'absolute', bottom: '-13px', right: '18px', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `12px solid ${lowColor}` }} />
                  </motion.div>
                )}
              </div>
              <img
                src={mode === 'race' ? '/assets/blue-adult.svg' : '/assets/green-adult.svg'}
                style={{ width: '100%', height: 'auto', display: 'block', animation: dialogueDone ? 'bob 2s ease-in-out infinite' : undefined, animationDelay: '0.4s' }}
              />
            </div>
          </div>

          <div
            ref={bodyRef}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              width: '100%', gap: isMobile ? '2.2rem' : '3.2rem',
              marginTop: isMobile ? '2.6rem' : '4.2rem',
            }}
          >
          <div style={{
            position: 'relative', width: '100%', maxWidth: '950px', flexShrink: 0,
            marginBottom: isMobile ? 0 : '1.4rem',
            marginTop: isMobile ? 0 : '-0.35rem',
          }}>
            <p style={{
              fontFamily: "'Kiwi Maru', serif",
              color: '#111',
              fontSize: isMobile ? 'clamp(0.75rem, 3vw, 0.9rem)' : 'clamp(1.05rem, 1.9vw, 1.35rem)',
              lineHeight: 1.8,
              width: '100%',
              textAlign: 'center',
              margin: 0,
            }}>
              {renderPara(PARA_FULL)}
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'center' : 'flex-end',
              justifyContent: 'center',
              gap: isMobile ? '0.7rem' : '1.5rem',
              width: '100%', maxWidth: '760px', flexShrink: 0,
              marginTop: isMobile ? '1rem' : '-5.6rem',
              position: 'relative',
              zIndex: 2,
              ...(isMobile ? {} : { transform: 'translateX(20px)' }),
            }}
          >
            <div style={{ transform: isMobile ? 'none' : 'translateY(50%)' }}>
              <div className="subtle-stop-motion" style={{ flexShrink: 0, display: 'block' }}>
                <a
                  href="https://www.alexiakouletsis.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={() => setSigHovered(true)}
                  onMouseLeave={() => setSigHovered(false)}
                  style={{
                    flexShrink: 0,
                    display: 'block',
                  }}
                >
                  <img
                    src="/assets/signature.svg"
                    style={{
                      width: isMobile ? '100px' : '175px',
                      height: 'auto', display: 'block',
                      transform: sigHovered ? 'scale(1.08)' : 'scale(1)',
                      transition: 'transform 0.25s ease',
                    }}
                />
                </a>
              </div>
            </div>
            <p style={{
              fontFamily: "'Kiwi Maru', serif",
              fontSize: isMobile ? 'clamp(0.65rem, 2.6vw, 0.78rem)' : 'clamp(0.76rem, 1.1vw, 0.9rem)',
              color: '#111', lineHeight: 1.6,
              textAlign: 'center', margin: 0,
              ...(isMobile ? {} : { width: '450px', transform: 'translateY(-4px)' }),
            }}>
              {renderInfo()}
            </p>
          </div>

          <div
            style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: isMobile ? 'center' : 'space-between',
            gap: isMobile ? '1.5rem' : '0',
            width: '100%',
            maxWidth: isMobile ? undefined : '1650px',
            padding: isMobile ? 0 : '0',
            flexShrink: 0,
            marginTop: isMobile ? '2.5rem' : '1.8rem',
            position: 'relative',
            zIndex: 1,
          }}>
            <img
              src={mode === 'race' ? '/assets/phases-orange.svg' : '/assets/phases-pink.svg'}
              style={{ width: isMobile ? '150px' : '330px', height: 'auto', display: 'block' }}
            />
            <img
              src={mode === 'race' ? '/assets/phases-blue.svg' : '/assets/phases-green.svg'}
              style={{ width: isMobile ? '150px' : '330px', height: 'auto', display: 'block' }}
            />
          </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}