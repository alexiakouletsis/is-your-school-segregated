import { useEffect, useState, useRef } from 'react'
import * as d3 from 'd3'
import { motion, AnimatePresence } from 'framer-motion'
import { useGraphSection } from '../hooks/useGraphSection'
import type { Mode } from '../App'
import type { Node, Edge, GraphData } from './graphTypes'
import {
  getEdgeColor, isProtagonist, getNodeColor, getFaceSrc, applyHoverHighlight, getTooltipHtml,
} from './graphUtils'

const FACE_SIZE = 20
const NOTICE_TEXT = "Notice how students transition into sharing classes, rather than being isolated in individual pods."

const STEPS = [
  { label: 'Picking up from all students in grade 3.' },
  { label: 'All students in grade 4.' },
  { label: 'All students in grade 5.' },
]

export default function GraphSection45({ mode, initialNodes, grade3Version, resetSignal }: {
  mode: Mode
  initialNodes: React.MutableRefObject<Node[]>
  // Bumped by ArticleSection the moment GraphSection's real grade-3-final
  // positions actually arrive (see the comment there). Included in the main
  // graph effect's deps below so step 0's layout — and its auto-zoom — get
  // recomputed against the real continuation positions once available,
  // instead of permanently keeping whatever it first rendered (possibly a
  // random-scatter fallback, if initialNodes.current was still empty the
  // first time this effect ran).
  grade3Version?: number
  resetSignal?: number
}) {
  const [allGraphData, setAllGraphData] = useState<(GraphData | null)[]>([null, null])
  const [grade3Data, setGrade3Data] = useState<GraphData | null>(null)
  const [noticeText, setNoticeText] = useState('')
  const noticeDoneRef = useRef(false)
  const noticeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const {
    currentStep, setCurrentStep, hoveredNode, setHoveredNode, graphSize,
    sectionRef, svgRef, graphPanelRef, simulationRef,
    activeNodesRef, activeEdgesRef, tooltipRef,
    isMobile, setupNodeInteractions, autoZoom,
  } = useGraphSection({
    steps: STEPS,
    // Desktop only (the hook itself no-ops this on mobile): the exit from
    // grade 5 into Section02 was too easy to blow past with a normal
    // scroll flick. Raised from the shared 500ms default to give more
    // resistance specifically on this transition, without changing the
    // buffer for GraphSection or GraphSection68's own last-step exits.
    endBufferMs: 1400,
  })

  // Only bumped by Conclusion's bottom-of-page toggle (a deliberate full
  // restart), never by a plain mode change — see the comment on
  // graphResetSignal in App.tsx.
  const isFirstResetRender = useRef(true)
  useEffect(() => {
    if (isFirstResetRender.current) { isFirstResetRender.current = false; return }
    setCurrentStep(0)
  }, [resetSignal, setCurrentStep])

  useEffect(() => {
    Promise.all([
      fetch('/data/graphs/3.json').then(r => r.json()),
      fetch('/data/graphs/4.json').then(r => r.json()),
      fetch('/data/graphs/5.json').then(r => r.json()),
    ]).then(([g3, g4, g5]) => { setGrade3Data(g3); setAllGraphData([g4, g5]) })
  }, [])

  // notice text typing
  useEffect(() => {
    if (currentStep === 1 && !noticeDoneRef.current) {
      noticeDoneRef.current = true
      setNoticeText('')
      let i = 0
      noticeIntervalRef.current = setInterval(() => {
        i++
        setNoticeText(NOTICE_TEXT.slice(0, i))
        if (i >= NOTICE_TEXT.length) clearInterval(noticeIntervalRef.current!)
      }, 22)
    }
    if (currentStep === 0) {
      noticeDoneRef.current = false
      clearInterval(noticeIntervalRef.current!)
      setNoticeText('')
    }
  }, [currentStep])

  // hoveredNode is shared across all three steps (grade 3/4/5) with no
  // reset between them — a hover/tap left highlighted on one step could
  // otherwise carry over and inappropriately apply to a different node in
  // a different step's dataset, if their real ids happen to coincide
  // (plausible, since these are separate real cohorts). Clearing it on
  // every step change guarantees each step starts clean.
  const justEnteredRef = useRef(0)
  useEffect(() => {
    setHoveredNode(null)
    tooltipRef.current?.style('opacity', 0)
    justEnteredRef.current = Date.now()
  }, [currentStep])

  // hover highlighting
  useEffect(() => {
    if (!svgRef.current) return
    // currentStep stays in the deps array below (so this still re-fires
    // and re-corrects edge opacity whenever the step changes — the actual
    // bug it was added for) but is deliberately NOT passed as an argument
    // here. applyHoverHighlight's shared radius logic hardcodes
    // `currentStep === 1 ? 10 : 6`, written for GraphSection.tsx's own
    // step numbering — passing currentStep through for this component
    // (where step 1 means grade 4, not whatever step 1 means there) was
    // what forced grade 4's circles to an unrelated, oversized radius.
    applyHoverHighlight(d3.select(svgRef.current), hoveredNode, activeEdgesRef.current)
  }, [hoveredNode, currentStep])

  // main graph effect
  useEffect(() => {
    if (!svgRef.current || graphSize.width === 0) return
    if (currentStep === 0 && !grade3Data) return
    if (currentStep > 0 && !allGraphData[currentStep - 1]) return

    const svg = d3.select(svgRef.current)
    const g = svg.select<SVGGElement>('g.root')
    const linkG = g.select<SVGGElement>('g.links')
    const nodeG = g.select<SVGGElement>('g.nodes')
    const { width, height } = graphSize
    const cx = width / 2, cy = height / 2
    const existingById = new Map(activeNodesRef.current.map(n => [n.id, n]))

    let newNodes: Node[] = [], newEdges: Edge[] = []

    if (currentStep === 0) {
      const data = grade3Data!
      const initialById = new Map(initialNodes.current.map(n => [n.id, n]))
      newNodes = data.nodes.map(n => {
        const fromG3 = initialById.get(n.id)
        if (fromG3?.x !== undefined) return { ...n, x: fromG3.x, y: fromG3.y }
        const existing = existingById.get(n.id)
        if (existing?.x !== undefined) return { ...n, x: existing.x, y: existing.y }
        // Last-resort fallback, when finalGrade3NodesRef hasn't arrived yet
        // (only fires once GraphSection's own onGrade3Complete reaches ITS
        // final step — e.g. never happens if this section is reached via a
        // nav-bar jump straight past GraphSection entirely) AND there's no
        // prior activeNodesRef position either (a true first-ever render).
        // Step 0 deliberately uses near-zero charge (-2) below, to preserve
        // the inherited K-3 pod layout without redoing that physics from
        // scratch — but that also means whatever THIS scatter starts at is
        // essentially the final layout too, since nothing meaningfully
        // expands it further. A small fixed +/-100px window here used to
        // leave every node clustered tightly near center regardless of the
        // panel's actual size, and autoZoom (correctly) measured that tiny
        // bounding box and zoomed way in to fill the panel with it —
        // mathematically right, visually "too zoomed in." Scaling this to
        // the real panel dimensions instead gives autoZoom a sane extent
        // to fit even in this fallback case. (autoZoom itself now
        // re-measures the panel's actual current size right when its zoom
        // timer fires, rather than trusting whatever graphSize was at the
        // moment this effect ran — see useGraphSection.ts — so this scatter
        // no longer needs to chase graphSize corrections itself; getBBox()
        // reads live rendered geometry regardless of what width this was
        // generated against.)
        return {
          ...n,
          x: cx + (Math.random() - 0.5) * width * 0.7,
          y: cy + (Math.random() - 0.5) * height * 0.7,
        }
      })
      newEdges = data.edges.map(e => ({ ...e }))
    } else {
      const data = allGraphData[currentStep - 1]!
      newNodes = data.nodes.map(n => {
        const existing = existingById.get(n.id)
        return existing
          ? { ...n, x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy, fx: null, fy: null }
          : { ...n, x: cx + (Math.random() - 0.5) * 80, y: cy + (Math.random() - 0.5) * 80 }
      })
      newEdges = data.edges.map(e => ({ ...e }))
    }

    activeNodesRef.current = newNodes
    activeEdgesRef.current = newEdges

    const isGrade45 = currentStep > 0
    if (simulationRef.current) simulationRef.current.stop()

    const simulation = d3.forceSimulation<Node>(newNodes)
      .force('link', d3.forceLink<Node, Edge>(newEdges).id(d => d.id)
        .distance(isGrade45 ? (d => Math.max(15, 80 - ((d as unknown as Edge).weight * 5))) : 40)
        .strength(isGrade45 ? (d => Math.min(1, (d as unknown as Edge).weight * 0.06)) : 0.3))
      .force('charge', d3.forceManyBody().strength(isGrade45 ? -80 : -2))
      .force('center', d3.forceCenter(cx, cy))
      .force('collision', d3.forceCollide().radius(isGrade45 ? 8 : 10))
      .alphaDecay(isMobile ? 0.05 : 0.0228)

    simulationRef.current = simulation

    const padding = isMobile ? 30 : 80
    // Reverted the zoom cap entirely — it was never the actual problem.
    // The real cause of grade 4's oversized/inconsistent circles was
    // applyHoverHighlight's shared radius branch (see the comment on that
    // call above); once that's fixed, autoZoom needs no special-casing
    // here at all, same as it never did before this whole detour.
    const zoomTimer = autoZoom(g, width, height, padding)

    simulation.on('tick', () => {
      linkG.selectAll<SVGLineElement, Edge>('line')
        .attr('x1', d => (d.source as Node).x ?? 0).attr('y1', d => (d.source as Node).y ?? 0)
        .attr('x2', d => (d.target as Node).x ?? 0).attr('y2', d => (d.target as Node).y ?? 0)
      nodeG.selectAll<SVGCircleElement, Node>('circle').attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0)
      nodeG.selectAll<SVGImageElement, Node>('image')
        .attr('x', d => (d.x ?? 0) - FACE_SIZE / 2).attr('y', d => (d.y ?? 0) - FACE_SIZE / 2)
    })

    const linkLines = linkG.selectAll<SVGLineElement, Edge>('line').data(newEdges)
    linkLines.exit().transition().duration(300).attr('stroke-opacity', 0).remove()
    linkLines.enter().append('line')
      // Colored by source node's group (shared getEdgeColor helper) instead
      // of flat grey — change graphUtils.getEdgeColor to affect this and
      // GraphSection/GraphSection68-step1 together.
      .attr('stroke', d => getEdgeColor(d, mode)).attr('stroke-width', 1).attr('stroke-opacity', 0)
      .transition().duration(600).attr('stroke-opacity', 0.2)
    linkLines.transition().duration(300).attr('stroke', d => getEdgeColor(d, mode))

    const nonProtags = newNodes.filter(n => !isProtagonist(n.id, mode))
    const protags = newNodes.filter(n => isProtagonist(n.id, mode))

    const circles = nodeG.selectAll<SVGCircleElement, Node>('circle').data(nonProtags, d => d.id)
    circles.exit().transition().duration(300).attr('opacity', 0).remove()
    circles.enter().append('circle')
      .attr('cx', d => d.x ?? cx).attr('cy', d => d.y ?? cy).attr('r', 6)
      .attr('fill', d => getNodeColor(d, mode)).attr('stroke', 'white').attr('stroke-width', 0.8)
      .attr('cursor', 'pointer').attr('opacity', 0).transition().duration(500).attr('opacity', 1)
    circles.transition().duration(300).attr('fill', d => getNodeColor(d, mode))

    const faceImages = nodeG.selectAll<SVGImageElement, Node>('image').data(protags, d => d.id)
    faceImages.exit().remove()
    faceImages.attr('href', d => getFaceSrc(d, mode, '45')).attr('width', FACE_SIZE).attr('height', FACE_SIZE)
    faceImages.enter().append('image')
      .attr('href', d => getFaceSrc(d, mode, '45')).attr('width', FACE_SIZE).attr('height', FACE_SIZE)
      .attr('x', d => (d.x ?? cx) - FACE_SIZE / 2).attr('y', d => (d.y ?? cy) - FACE_SIZE / 2)
      .attr('cursor', 'pointer').attr('opacity', 0).transition().duration(500).attr('opacity', 1)

    setupNodeInteractions(nodeG, simulation, mode)

    // Defensive reset — forces every circle back to full opacity and every
    // edge back to its correct color/opacity on every run of this effect,
    // including the very first mount. This existed in an earlier version
    // of this file and was accidentally dropped during a later rewrite
    // (the edge-coloring change) — without it, if hoveredNode was ever
    // non-null for any reason when this effect runs, the dimmed state from
    // applyHoverHighlight could survive into a fresh render instead of
    // being guaranteed to start clean.
    nodeG.selectAll<SVGCircleElement, Node>('circle').attr('opacity', 1)
    linkG.selectAll<SVGLineElement, Edge>('line').attr('stroke', d => getEdgeColor(d, mode)).attr('stroke-opacity', 0.2)

    return () => {
      simulation.stop()
      clearTimeout(zoomTimer)
      tooltipRef.current?.style('opacity', 0)
    }
  }, [currentStep, allGraphData, grade3Data, graphSize, mode, isMobile, grade3Version])

  return (
    <div id="graph-45" style={{ height: isMobile ? '100svh' : `${STEPS.length * 100}vh`, position: 'relative', marginTop: isMobile ? '7vh' : '15vh' }}>
      <div ref={sectionRef} style={{ position: isMobile ? 'relative' : 'sticky', top: 0, width: '100%', height: isMobile ? '100svh' : '100vh', backgroundColor: 'var(--color-bg)', display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden' }}>

        {/* left panel */}
        <div style={{ width: isMobile ? '100%' : '28%', height: isMobile ? 'auto' : '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'center' : 'flex-start', justifyContent: 'center', padding: isMobile ? '1.25rem 1.5rem 0.2rem 1.5rem' : '3rem 2rem 3rem 3rem', flexShrink: 0, gap: '1.5rem' }}>
          {!isMobile && noticeText && (
            <p style={{ position: 'absolute', top: '6rem', left: '3rem', right: '2rem', fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(1.1rem, 2vw, 1.6rem)', color: '#111', lineHeight: 1.6, margin: 0 }}>
              {noticeText}
              {noticeText.length < NOTICE_TEXT.length && <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />}
            </p>
          )}
          <AnimatePresence mode="wait">
            <motion.p key={currentStep} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4 }}
              style={{ fontFamily: "'Kiwi Maru', serif", fontSize: isMobile ? 'clamp(0.9rem, 3.5vw, 1.1rem)' : 'clamp(1rem, 2vw, 1.6rem)', color: '#111', lineHeight: 1.6, margin: 0, textAlign: isMobile ? 'center' : 'left' }}>
              {STEPS[currentStep].label}
            </motion.p>
          </AnimatePresence>
          {!isMobile && (
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {STEPS.map((_, i) => (
                <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: i === currentStep ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
              ))}
            </div>
          )}
        </div>

        {/* graph panel */}
        <div
          ref={graphPanelRef}
          onClick={(e) => {
            if (!isMobile) return
            const target = e.target as Element
            if (target.tagName === 'circle' || target.tagName === 'image') {
              // Ignore taps landing suspiciously soon after this step first
              // appeared — likely a stray touch from the scroll-in
              // transition landing on a node, not a real intentional tap.
              // Far more likely to be visible here than in the other graph
              // sections, since this step's first frame is a full, dense
              // 300+ node population rather than 1-2 sparse nodes.
              if (Date.now() - justEnteredRef.current < 500) return
              const datum = d3.select(target as SVGCircleElement | SVGImageElement).datum() as Node | undefined
              if (datum) {
                setHoveredNode(prev => {
                  const next = prev === datum.id ? null : datum.id
                  if (next === null) {
                    tooltipRef.current?.style('opacity', 0)
                  } else {
                    const nodeRect = target.getBoundingClientRect()
                    tooltipRef.current?.style('opacity', 1)
                      .style('left', (nodeRect.left + nodeRect.width / 2 + 12) + 'px')
                      .style('top', (nodeRect.top - 28) + 'px')
                      .html(getTooltipHtml(datum, mode))
                  }
                  return next
                })
              }
              return
            }
            // A background tap while a node is highlighted just dismisses
            // it — otherwise there was no way to tap out of a highlight.
            if (hoveredNode !== null) {
              setHoveredNode(null)
              tooltipRef.current?.style('opacity', 0)
              return
            }
            const rect = graphPanelRef.current?.getBoundingClientRect()
            if (!rect) return
            const isRightHalf = e.clientX - rect.left > rect.width / 2
            if (isRightHalf) {
              if (currentStep < STEPS.length - 1) setCurrentStep(s => Math.min(STEPS.length - 1, s + 1))
            } else {
              if (currentStep > 0) setCurrentStep(s => Math.max(0, s - 1))
            }
          }}
          style={{ flex: 1, minHeight: 0, height: isMobile ? undefined : '100%', position: 'relative', cursor: isMobile ? 'pointer' : 'default' }}
        >
          {isMobile && noticeText && (
            <div style={{ position: 'absolute', top: '2.2rem', left: '16%', right: '16%', zIndex: 5, padding: '0.6rem 1rem', backgroundColor: 'rgba(250,249,246,0.92)', borderRadius: '8px' }}>
              <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.6rem, 2.5vw, 0.75rem)', color: '#111', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
                {noticeText}
                {noticeText.length < NOTICE_TEXT.length && <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />}
              </p>
            </div>
          )}
          <svg ref={svgRef} width={graphSize.width} height={graphSize.height} style={{ display: 'block', width: '100%', height: '100%', touchAction: 'pan-y' }} />
          {isMobile && (
            <>
              {currentStep > 0 && (
                <div style={{
                  position: 'absolute', top: '0.6rem', left: '0.6rem', zIndex: 5, pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.55rem, 2.2vw, 0.68rem)', color: '#111',
                  backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.25rem 0.5rem', borderRadius: '999px',
                }}>
                  ← Tap to go back
                </div>
              )}
              {currentStep < STEPS.length - 1 && (
                <div style={{
                  position: 'absolute', top: '0.6rem', right: '0.6rem', zIndex: 5, pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.55rem, 2.2vw, 0.68rem)', color: '#111',
                  backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.25rem 0.5rem', borderRadius: '999px',
                }}>
                  Tap to go forward →
                </div>
              )}
              <div style={{ position: 'absolute', bottom: '0.8rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '0.4rem' }}>
                {STEPS.map((_, i) => (
                  <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: i === currentStep ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}