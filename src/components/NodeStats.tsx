import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { Mode } from '../App'
import type { Node, Edge } from './graphTypes'
import { computeLowGroupAvgHighNeighborPct, computeLowGroupFullIsolationPct } from './graphUtils'

interface Props {
  nodes: Node[]
  edges: Edge[]
  mode: Mode
  visible: boolean
  mobile: boolean
  // Gate on when the entrance typing sequence is allowed to START (distinct
  // from `visible`, which only controls opacity). Defaults to true so
  // callers with nothing to wait on (e.g. GraphSection912, which has no
  // notice text blocking the stats) behave exactly as before. GraphSection68
  // passes this tied to its step-1 notice text finishing, so the stats
  // don't start typing until "This is what a middle school..." is done.
  startTyping?: boolean
  // Bump this (any increasing number) to instantly complete the entrance
  // typing sequence, e.g. on a click-to-skip. No-op once already finished.
  skipSignal?: number
}

type Segment = {
  text: string
  // Yellow background highlight (baseline/isolation's percentages).
  highlight?: boolean
  // Marks this substring as a percentage value that should do the brief
  // scale-up-then-back pulse when the underlying number changes — applies
  // to every percentage across breakdown/baseline/isolation, independent
  // of whether it also gets the yellow highlight.
  pulse?: boolean
}

const segmentsLength = (segments: Segment[]) => segments.reduce((sum, s) => sum + s.text.length, 0)
const segmentsPlainText = (segments: Segment[]) => segments.map(s => s.text).join('')

const Cursor = () => <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />

// Renders segments up to typedLen characters, preserving highlight/pulse
// spans — same "slice by accumulated length" approach ArticleIntro.tsx uses
// for its own bold/colored spans, generalized to arbitrary per-segment
// styling instead of hardcoded bold/color breakpoints. Segments marked
// `pulse` are remounted (via the pulseKey-derived key) whenever pulseKey
// changes, replaying the scale keyframe — everything else stays static.
const renderTypedSegments = (segments: Segment[], typedLen: number, pulseKey: number) => {
  const fullLen = segmentsLength(segments)
  const clampedLen = Math.min(typedLen, fullLen)
  const rendered: ReactNode[] = []
  let remaining = clampedLen
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (remaining <= 0) break
    const take = Math.min(seg.text.length, remaining)
    const partial = seg.text.slice(0, take)
    const highlightStyle = seg.highlight ? { backgroundColor: '#FDF4CB', borderRadius: '3px', padding: '0 0.15em' } : undefined
    if (seg.pulse) {
      rendered.push(
        <motion.span
          key={`${i}-${pulseKey}`}
          style={{ display: 'inline-block', ...highlightStyle }}
          initial={{ scale: 1 }}
          animate={{ scale: pulseKey > 0 ? [1, 1.9, 1] : 1 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        >
          {partial}
        </motion.span>
      )
    } else {
      rendered.push(<span key={i} style={highlightStyle}>{partial}</span>)
    }
    remaining -= take
    if (take < seg.text.length) break
  }
  if (clampedLen > 0 && clampedLen < fullLen) rendered.push(<Cursor key="cursor" />)
  return rendered
}

export default function NodeStats({ nodes, edges, mode, visible, mobile, startTyping = true, skipSignal }: Props) {
  const filtered = nodes.filter(n => n.ses || n.race_ethnicity)
  const hasData = filtered.length > 0

  const total = hasData ? filtered.length : 0
  const highCount = mode === 'race'
    ? filtered.filter(n => n.race_ethnicity === 'white_asian').length
    : filtered.filter(n => n.ses === 'higher').length
  const highPct = hasData ? Math.round((highCount / total) * 100) : 0
  const lowPct = hasData ? 100 - highPct : 0

  const highLabelText = mode === 'race' ? ' of students are white/asian' : ' of students are high-SES'
  const lowLabelText = mode === 'race' ? ' of students are students of color' : ' of students are low-SES'
  const highColor = mode === 'race' ? '#FF954D' : '#F17091'
  const lowColor = mode === 'race' ? '#6897FF' : '#00B178'

  const highSegments: Segment[] = [
    { text: `${highPct}%`, pulse: true },
    { text: highLabelText },
  ]
  const lowSegments: Segment[] = [
    { text: `${lowPct}%`, pulse: true },
    { text: lowLabelText },
  ]

  const avgHighNeighborPct = computeLowGroupAvgHighNeighborPct(nodes, edges, mode)
  const isolationPct = computeLowGroupFullIsolationPct(nodes, edges, mode)

  const baselineSegments: Segment[] = mode === 'race'
    ? [
        { text: "On average, a student of color's classmates are " },
        { text: `${avgHighNeighborPct}%`, highlight: true, pulse: true },
        { text: " white/asian — you'd expect " },
        { text: `${highPct}%`, highlight: true, pulse: true },
        { text: ' if classes were assigned at random.' },
      ]
    : [
        { text: "On average, a low-SES student's classmates are " },
        { text: `${avgHighNeighborPct}%`, highlight: true, pulse: true },
        { text: " high-SES — you'd expect " },
        { text: `${highPct}%`, highlight: true, pulse: true },
        { text: ' if classes were assigned at random.' },
      ]

  const isolationSegments: Segment[] = mode === 'race'
    ? [
        { text: `${isolationPct}%`, highlight: true, pulse: true },
        { text: ' of students of color share zero classes with any white/asian student.' },
      ]
    : [
        { text: `${isolationPct}%`, highlight: true, pulse: true },
        { text: ' of low-SES students share zero classes with any high-SES student.' },
      ]

  // --- Sequential type-out on first appearance ------------------------
  // Five stages typed one after another (breakdown's own three lines, then
  // baseline, then isolation) so the whole block doesn't just fade in as
  // one info-dump. Waits on both `visible` and `startTyping` — the latter
  // lets a caller (GraphSection68) hold off until its own notice text has
  // finished typing first. Once the sequence finishes once, it never
  // replays — later value changes render instantly and use the per-percent
  // pulse above to draw the eye instead.
  const labelText = 'Of this given network:'
  const stageSegments: Segment[][] = [
    [{ text: labelText }],
    highSegments,
    lowSegments,
    baselineSegments,
    isolationSegments,
  ]
  const stageFullLens = stageSegments.map(segmentsLength)

  const [activeStage, setActiveStage] = useState(-1)
  const [typedLen, setTypedLen] = useState(0)
  const hasStartedRef = useRef(false)
  const hasFinishedFirstPassRef = useRef(false)

  useEffect(() => {
    if (!visible || !startTyping || !hasData || hasStartedRef.current) return
    hasStartedRef.current = true
    setActiveStage(0)
    setTypedLen(0)
  }, [visible, startTyping, hasData])

  useEffect(() => {
    if (activeStage < 0 || activeStage >= stageFullLens.length) return
    const fullLen = stageFullLens[activeStage]

    const advance = () => {
      if (activeStage + 1 < stageFullLens.length) {
        setActiveStage(activeStage + 1)
        setTypedLen(0)
      } else {
        hasFinishedFirstPassRef.current = true
        setActiveStage(stageFullLens.length)
      }
    }

    if (fullLen === 0) {
      const t = setTimeout(advance, 0)
      return () => clearTimeout(t)
    }

    const iv = setInterval(() => {
      setTypedLen(l => {
        const next = l + 1
        if (next >= fullLen) {
          clearInterval(iv)
          setTimeout(advance, 250)
        }
        return next
      })
    }, 20)
    return () => clearInterval(iv)
  }, [activeStage])

  // Click-to-skip: jump straight to the fully-typed end state. Effect (not
  // a plain function call) so it also fires if skipSignal arrives before
  // hasStartedRef.current is even true yet (e.g. a very fast click).
  useEffect(() => {
    if (!skipSignal || hasFinishedFirstPassRef.current) return
    hasStartedRef.current = true
    hasFinishedFirstPassRef.current = true
    setActiveStage(stageFullLens.length)
    setTypedLen(0)
  }, [skipSignal])

  const typedLenFor = (stage: number, fullLen: number) => {
    if (hasFinishedFirstPassRef.current) return fullLen
    if (activeStage > stage) return fullLen
    if (activeStage === stage) return typedLen
    return 0
  }

  // --- Attention pulse on value change ---------------------------------
  // After the first pass is done, bump pulseKey whenever the underlying
  // numbers change (grade/step change) — renderTypedSegments uses it to
  // remount just the `pulse` spans (the numbers themselves), not the
  // surrounding sentence.
  const statsSignature = `${highPct}-${lowPct}-${avgHighNeighborPct}-${isolationPct}`
  const prevSignatureRef = useRef(statsSignature)
  const [pulseKey, setPulseKey] = useState(0)

  useEffect(() => {
    if (!hasFinishedFirstPassRef.current) { prevSignatureRef.current = statsSignature; return }
    if (statsSignature !== prevSignatureRef.current) {
      prevSignatureRef.current = statsSignature
      setPulseKey(k => k + 1)
    }
  }, [statsSignature])

  if (!hasData) return null

  const fontSize = mobile
    ? 'clamp(0.62rem, 2.1vw, 0.8rem)'
    : 'clamp(0.8rem, 1.1vw, 1rem)'

  // ~2pt bigger than the %-breakdown text on desktop; identical size on
  // mobile, per request — mobile's corners are already tight on space.
  const shareFontSize = mobile ? fontSize : 'clamp(0.95rem, 1.3vw, 1.15rem)'

  const breakdown = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.6 }}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', pointerEvents: 'none' }}
    >
      <div style={{ position: 'relative', width: '100%' }}>
        <p aria-hidden="true" style={{ fontFamily: "'Kiwi Maru', serif", fontSize, color: '#111', margin: 0, lineHeight: 1.3, fontWeight: 500, visibility: 'hidden' }}>
          {labelText}
        </p>
        <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize, color: '#111', margin: 0, lineHeight: 1.3, fontWeight: 500, position: 'absolute', top: 0, left: 0, right: 0 }}>
          {(() => {
            const len = typedLenFor(0, stageFullLens[0])
            return <>{labelText.slice(0, len)}{len > 0 && len < labelText.length && <Cursor />}</>
          })()}
        </p>
      </div>
      <div style={{ position: 'relative', width: '100%' }}>
        <p aria-hidden="true" style={{ fontFamily: "'Kiwi Maru', serif", fontSize, color: highColor, margin: 0, lineHeight: 1.3, fontWeight: 500, visibility: 'hidden' }}>
          {segmentsPlainText(highSegments)}
        </p>
        <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize, color: highColor, margin: 0, lineHeight: 1.3, fontWeight: 500, position: 'absolute', top: 0, left: 0, right: 0 }}>
          {renderTypedSegments(highSegments, typedLenFor(1, stageFullLens[1]), pulseKey)}
        </p>
      </div>
      <div style={{ position: 'relative', width: '100%' }}>
        <p aria-hidden="true" style={{ fontFamily: "'Kiwi Maru', serif", fontSize, color: lowColor, margin: 0, lineHeight: 1.3, fontWeight: 500, visibility: 'hidden' }}>
          {segmentsPlainText(lowSegments)}
        </p>
        <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize, color: lowColor, margin: 0, lineHeight: 1.3, fontWeight: 500, position: 'absolute', top: 0, left: 0, right: 0 }}>
          {renderTypedSegments(lowSegments, typedLenFor(2, stageFullLens[2]), pulseKey)}
        </p>
      </div>
    </motion.div>
  )

  const baselineStat = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.6 }}
      style={{ position: 'relative', width: '100%', maxWidth: mobile ? '11.5rem' : '19rem', pointerEvents: 'none' }}
    >
      <p aria-hidden="true" style={{ fontFamily: "'Kiwi Maru', serif", fontSize: shareFontSize, color: '#111', margin: 0, lineHeight: 1.35, fontWeight: 500, visibility: 'hidden' }}>
        {segmentsPlainText(baselineSegments)}
      </p>
      <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: shareFontSize, color: '#111', margin: 0, lineHeight: 1.35, fontWeight: 500, position: 'absolute', top: 0, left: 0, right: 0 }}>
        {renderTypedSegments(baselineSegments, typedLenFor(3, stageFullLens[3]), pulseKey)}
      </p>
    </motion.div>
  )

  const isolationStat = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.6 }}
      style={{ position: 'relative', width: '100%', maxWidth: mobile ? '11.5rem' : '19rem', pointerEvents: 'none' }}
    >
      <p aria-hidden="true" style={{ fontFamily: "'Kiwi Maru', serif", fontSize: shareFontSize, color: '#111', margin: 0, lineHeight: 1.35, fontWeight: 500, visibility: 'hidden' }}>
        {segmentsPlainText(isolationSegments)}
      </p>
      <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: shareFontSize, color: '#111', margin: 0, lineHeight: 1.35, fontWeight: 500, position: 'absolute', top: 0, left: 0, right: 0 }}>
        {renderTypedSegments(isolationSegments, typedLenFor(4, stageFullLens[4]), pulseKey)}
      </p>
    </motion.div>
  )

  if (mobile) {
    return (
      <>
        <div style={{
          position: 'absolute',
          bottom: '2rem',
          left: '1.5rem',
          zIndex: 4,
          textAlign: 'left',
          backgroundColor: 'rgba(250,249,246,0.92)',
          padding: '0.4rem 0.6rem',
          borderRadius: '8px',
          maxWidth: '8rem',
        }}>
          {breakdown}
        </div>
        <div style={{
          position: 'absolute',
          bottom: '2rem',
          right: '1.5rem',
          zIndex: 4,
          textAlign: 'left',
          backgroundColor: 'rgba(250,249,246,0.92)',
          padding: '0.4rem 0.6rem',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          maxWidth: '13rem',
        }}>
          {baselineStat}
          {isolationStat}
        </div>
      </>
    )
  }

  // No wrapping div here on purpose: desktop callers place NodeStats inside
  // their own tight-gap flex column (grouping breakdown, baselineStat, and
  // isolationStat close together) — since this returns a Fragment rather
  // than its own div, that parent's gap applies directly between the three
  // pieces as if they were declared inline there.
  return (
    <>
      {breakdown}
      {baselineStat}
      {isolationStat}
    </>
  )
}