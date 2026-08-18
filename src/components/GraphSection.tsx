import { useEffect, useState, useRef } from 'react'
import * as d3 from 'd3'
import { motion, AnimatePresence } from 'framer-motion'
import { useGraphSection } from '../hooks/useGraphSection'
import type { Mode } from '../App'
import type { Node, Edge, GraphData } from './graphTypes'
import {
  PROTAGONIST_HIGH, getProtagonistLow, getEdgeColor,
  isProtagonist, getNodeColor, getFaceSrc, applyHoverHighlight, getTooltipHtml,
} from './graphUtils'

const FACE_SIZE = 25

const STEPS = [
  { label: 'Two students entering kindergarten.' },
  { label: 'Their shared kindergarten class.' },
  { label: 'All students in grade K.' },
  { label: 'All students in grade 1.' },
  { label: 'All students in grade 2.' },
  { label: 'All students in grade 3.' },
]

export default function GraphSection({ mode, onGrade3Complete, resetSignal }: {
  mode: Mode
  onGrade3Complete: (nodes: Node[]) => void
  resetSignal?: number
}) {
  const [allGraphData, setAllGraphData] = useState<(GraphData | null)[]>([null, null, null, null])

  const {
    currentStep, setCurrentStep, hoveredNode, setHoveredNode, graphSize,
    sectionRef, svgRef, graphPanelRef, simulationRef,
    activeNodesRef, activeEdgesRef, tooltipRef,
    isMobile, setupNodeInteractions, autoZoom,
  } = useGraphSection({ steps: STEPS })

  // Only bumped by Conclusion's bottom-of-page toggle (a deliberate full
  // restart), never by a plain mode change ('R' key or the future navbar
  // toggle) — see the comment on graphResetSignal in App.tsx for why those
  // two cases need to behave differently.
  const isFirstResetRender = useRef(true)
  useEffect(() => {
    if (isFirstResetRender.current) { isFirstResetRender.current = false; return }
    setCurrentStep(0)
  }, [resetSignal, setCurrentStep])

  useEffect(() => {
    Promise.all([0, 1, 2, 3].map(i => fetch(`/data/graphs/${i}.json`).then(r => r.json())))
      .then(results => setAllGraphData(results))
  }, [])

  // hover highlighting
  useEffect(() => {
    if (!svgRef.current) return
    applyHoverHighlight(
      d3.select(svgRef.current),
      hoveredNode,
      activeEdgesRef.current,
      currentStep
    )
  }, [hoveredNode, currentStep])

  // main graph effect
  useEffect(() => {
    if (!allGraphData[0] || !svgRef.current || graphSize.width === 0) return
    const svg = d3.select(svgRef.current)
    const g = svg.select<SVGGElement>('g.root')
    const linkG = g.select<SVGGElement>('g.links')
    const nodeG = g.select<SVGGElement>('g.nodes')
    const { width, height } = graphSize
    const cx = width / 2, cy = height / 2
    const gradeData = allGraphData[0]!
    const existingById = new Map(activeNodesRef.current.map(n => [n.id, n]))
    const protagonistLow = getProtagonistLow(mode)

    let newNodes: Node[] = [], newEdges: Edge[] = []

    if (currentStep === 0) {
      newNodes = gradeData.nodes
        .filter(n => isProtagonist(n.id, mode))
        .map(n => ({
          ...n,
          x: cx + (n.id === PROTAGONIST_HIGH ? -50 : 50), y: cy,
          fx: cx + (n.id === PROTAGONIST_HIGH ? -50 : 50), fy: cy,
        }))
      newEdges = []
    } else if (currentStep === 1) {
      const neighborIds = new Set<number>([PROTAGONIST_HIGH, protagonistLow])
      gradeData.edges.forEach(e => {
        const src = typeof e.source === 'number' ? e.source : (e.source as Node).id
        const tgt = typeof e.target === 'number' ? e.target : (e.target as Node).id
        if (src === PROTAGONIST_HIGH || tgt === PROTAGONIST_HIGH || src === protagonistLow || tgt === protagonistLow) {
          neighborIds.add(src); neighborIds.add(tgt)
        }
      })
      newNodes = gradeData.nodes.filter(n => neighborIds.has(n.id)).map(n => {
        const existing = existingById.get(n.id)
        return existing ? { ...existing, fx: null, fy: null } : { ...n, x: cx + (Math.random() - 0.5) * 30, y: cy + (Math.random() - 0.5) * 30 }
      })
      newEdges = gradeData.edges.filter(e => {
        const src = typeof e.source === 'number' ? e.source : (e.source as Node).id
        const tgt = typeof e.target === 'number' ? e.target : (e.target as Node).id
        return neighborIds.has(src) && neighborIds.has(tgt)
      }).map(e => ({ ...e }))
    } else {
      const data = allGraphData[currentStep - 2]
      if (!data) return
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

    if (currentStep === 5) onGrade3Complete(newNodes.map(n => ({ ...n })))

    const isSmall = newNodes.length <= 2
    const displayEdges = currentStep === 1
      ? newEdges.filter(e => {
          const src = typeof e.source === 'number' ? e.source : (e.source as Node).id
          const tgt = typeof e.target === 'number' ? e.target : (e.target as Node).id
          return src === PROTAGONIST_HIGH || src === protagonistLow || tgt === PROTAGONIST_HIGH || tgt === protagonistLow
        })
      : newEdges

    if (simulationRef.current) simulationRef.current.stop()

    const simulation = d3.forceSimulation<Node>(newNodes)
      .force('link', d3.forceLink<Node, Edge>(displayEdges).id(d => d.id)
        .distance(isSmall ? 80 : 40).strength(isSmall ? 0.1 : 0.3))
      .force('charge', d3.forceManyBody().strength(isSmall ? -500 : currentStep === 1 ? -60 : -2))
      .force('center', d3.forceCenter(cx, cy))
      .force('collision', d3.forceCollide().radius(isSmall ? FACE_SIZE + 5 : 10))
      .alphaDecay(isMobile ? 0.05 : 0.0228)

    simulationRef.current = simulation

    const padding = isSmall ? (isMobile ? 60 : 150) : (isMobile ? 30 : 80)
    const zoomTimer = autoZoom(g, width, height, padding)

    simulation.on('tick', () => {
      linkG.selectAll<SVGLineElement, Edge>('line')
        .attr('x1', d => (d.source as Node).x ?? 0).attr('y1', d => (d.source as Node).y ?? 0)
        .attr('x2', d => (d.target as Node).x ?? 0).attr('y2', d => (d.target as Node).y ?? 0)
      nodeG.selectAll<SVGCircleElement, Node>('circle').attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0)
      nodeG.selectAll<SVGImageElement, Node>('image')
        .attr('x', d => (d.x ?? 0) - FACE_SIZE / 2).attr('y', d => (d.y ?? 0) - FACE_SIZE / 2)
    })

    const linkLines = linkG.selectAll<SVGLineElement, Edge>('line').data(displayEdges)
    linkLines.exit().transition().duration(300).attr('stroke-opacity', 0).remove()
    linkLines.enter().append('line')
      // Colored by source node's group (shared getEdgeColor helper) instead
      // of flat grey — change graphUtils.getEdgeColor to affect this and
      // GraphSection45/GraphSection68-step1 together.
      .attr('stroke', d => getEdgeColor(d, mode)).attr('stroke-width', 1).attr('stroke-opacity', 0)
      .transition().duration(600).attr('stroke-opacity', 0.2)
    linkLines.transition().duration(300).attr('stroke', d => getEdgeColor(d, mode))

    const nonProtags = newNodes.filter(n => !isProtagonist(n.id, mode))
    const protags = newNodes.filter(n => isProtagonist(n.id, mode))

    const circles = nodeG.selectAll<SVGCircleElement, Node>('circle').data(nonProtags, d => d.id)
    circles.exit().transition().duration(300).attr('opacity', 0).remove()
    circles.enter().append('circle')
      .attr('cx', d => d.x ?? cx).attr('cy', d => d.y ?? cy)
      .attr('r', currentStep === 1 ? 10 : 6).attr('fill', d => getNodeColor(d, mode))
      .attr('stroke', 'white').attr('stroke-width', 0.8).attr('cursor', 'pointer').attr('opacity', 0)
      .transition().duration(500).attr('opacity', 1)
    circles.transition().duration(300).attr('r', currentStep === 1 ? 10 : 6).attr('fill', d => getNodeColor(d, mode))

    const faceImages = nodeG.selectAll<SVGImageElement, Node>('image').data(protags, d => d.id)
    faceImages.exit().remove()
    faceImages.attr('href', d => getFaceSrc(d, mode, 'K3')).attr('width', FACE_SIZE).attr('height', FACE_SIZE)
    faceImages.enter().append('image')
      .attr('href', d => getFaceSrc(d, mode, 'K3')).attr('width', FACE_SIZE).attr('height', FACE_SIZE)
      .attr('x', d => (d.x ?? cx) - FACE_SIZE / 2).attr('y', d => (d.y ?? cy) - FACE_SIZE / 2)
      .attr('cursor', 'pointer').attr('opacity', 0).transition().duration(500).attr('opacity', 1)

    setupNodeInteractions(nodeG, simulation, mode)

    return () => {
      simulation.stop()
      clearTimeout(zoomTimer)
      tooltipRef.current?.style('opacity', 0)
    }
  }, [currentStep, allGraphData, graphSize, mode, isMobile])

  const hintBar = (mobile: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: '#EADDDD', borderRadius: '999px', padding: mobile ? '0.4rem 0.8rem' : '0.5rem 1rem', opacity: 0.85 }}>
      <img src="/assets/i-icon.svg" style={{ width: mobile ? '14px' : '16px', height: mobile ? '14px' : '16px', flexShrink: 0 }} />
      <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: mobile ? 'clamp(0.55rem, 2.5vw, 0.7rem)' : 'clamp(0.55rem, 0.9vw, 0.75rem)', color: '#111', margin: 0, lineHeight: 1.4 }}>
        {isMobile ? 'Tap and drag on the dots to explore connections!' : 'Hover over and drag on the dots to explore connections!'}
      </p>
    </div>
  )

  return (
    <div id="graph-k3" style={{ height: isMobile ? '100svh' : `${STEPS.length * 100}vh`, position: 'relative' }}>
      <div ref={sectionRef} style={{ position: isMobile ? 'relative' : 'sticky', top: 0, width: '100%', height: isMobile ? '100svh' : '100vh', backgroundColor: 'var(--color-bg)', display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden' }}>

        {/* left panel */}
        <div style={{ width: isMobile ? '100%' : '28%', height: isMobile ? 'auto' : '100%', display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'center' : 'flex-start', justifyContent: 'center', padding: isMobile ? '1.25rem 1.5rem 0.2rem 1.5rem' : '3rem 2rem 3rem 3rem', flexShrink: 0, gap: '1.5rem' }}>
          {!isMobile && hintBar(false)}
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
              // Tapped an actual node — show/toggle its tooltip instead of
              // navigating. Reuses the same hoveredNode state the existing
              // highlight effect already reacts to, so this gets the same
              // dim/highlight treatment as desktop's hover for free.
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

              <div style={{ position: 'absolute', bottom: '2.4rem', left: '50%', transform: 'translateX(-50%)', zIndex: 5, pointerEvents: 'none' }}>
                {hintBar(true)}
              </div>

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