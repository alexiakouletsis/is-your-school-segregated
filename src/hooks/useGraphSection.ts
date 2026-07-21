import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useIsMobile } from './useIsMobile'
import type { Mode } from '../App'
import type { Node, Edge } from '../components/graphTypes'
import { getTooltipHtml } from '../components/graphUtils'

interface UseGraphSectionOptions {
  steps: { label: string }[]
  onStepChange?: (step: number) => void
  blockScrollForward?: () => boolean
  // How long, after landing on the last step, forward wheel scroll is eaten
  // instead of released straight to the browser. Defaults to 500ms (the
  // original value, unchanged for GraphSection/GraphSection68). Raised for
  // GraphSection45 specifically, where the exit into Section02 was too easy
  // to blow past accidentally with a normal scroll flick.
  endBufferMs?: number
}

export function useGraphSection({ steps, blockScrollForward, endBufferMs = 500 }: UseGraphSectionOptions) {
  const [currentStep, setCurrentStep] = useState(0)
  const [hoveredNode, setHoveredNode] = useState<number | null>(null)
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 })
  const sectionRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const graphPanelRef = useRef<HTMLDivElement>(null)
  const currentStepRef = useRef(0)
  const accumulatedDeltaRef = useRef(0)
  const lastScrollTime = useRef(0)
  const sectionEnteredTime = useRef(0)
  const reachedEndTime = useRef(0)
  const simulationRef = useRef<d3.Simulation<Node, Edge> | null>(null)
  const activeNodesRef = useRef<Node[]>([])
  const activeEdgesRef = useRef<Edge[]>([])
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const tooltipRef = useRef<d3.Selection<HTMLDivElement, unknown, HTMLElement, unknown> | null>(null)
  const isMobile = useIsMobile()

  useEffect(() => { currentStepRef.current = currentStep }, [currentStep])
  useEffect(() => {
    if (currentStep === steps.length - 1) reachedEndTime.current = Date.now()
  }, [currentStep, steps.length])

  // track when section becomes sticky
  useEffect(() => {
    const checkStuck = () => {
      if (!sectionRef.current) return
      const rect = sectionRef.current.getBoundingClientRect()
      if (rect.top <= 10 && rect.top >= -10 && sectionEnteredTime.current === 0) {
        sectionEnteredTime.current = Date.now()
      }
    }
    window.addEventListener('scroll', checkStuck, { passive: true })
    return () => window.removeEventListener('scroll', checkStuck)
  }, [])

  // measure graph panel
  useLayoutEffect(() => {
    const measure = () => {
      if (graphPanelRef.current) {
        const { clientWidth, clientHeight } = graphPanelRef.current
        if (clientWidth > 0 && clientHeight > 0) setGraphSize({ width: clientWidth, height: clientHeight })
      }
    }
    const t = setTimeout(measure, 100)
    const observer = new ResizeObserver(measure)
    if (graphPanelRef.current) observer.observe(graphPanelRef.current)
    return () => { clearTimeout(t); observer.disconnect() }
  }, [])

  // init SVG + tooltip
  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const g = svg.append('g').attr('class', 'root')
    g.append('g').attr('class', 'links')
    g.append('g').attr('class', 'nodes')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 8])
      .filter(event => {
          if (event.type === 'wheel') return event.ctrlKey
          if (event.type === 'mousedown') return true
          // Allow pinch (2+ finger touch) to zoom, but not single-finger
          // touch — that's left free for tap-to-navigate and drag-to-
          // reposition nodes, which would otherwise conflict with D3
          // trying to interpret the same single-finger gesture as a pan.
          if (event.type === 'touchstart') return event.touches && event.touches.length > 1
          return false
      })
      .on('zoom', event => g.attr('transform', event.transform))
    svg.call(zoom)
    zoomRef.current = zoom
    const tooltip = d3.select('body').append('div')
      .style('position', 'fixed').style('background', 'rgba(255,255,255,0.97)')
      .style('border', '1px solid #ddd').style('border-radius', '8px')
      .style('padding', '8px 12px').style('font-family', "'Kiwi Maru', serif")
      .style('font-size', '12px').style('pointer-events', 'none')
      .style('opacity', 0).style('max-width', '220px').style('z-index', '9999').style('line-height', '1.5')
    tooltipRef.current = tooltip
    return () => { tooltip.remove() }
  }, [])

  // wheel scroll (desktop only — mobile navigates via explicit taps, and
  // this handler running on mobile too could intercept touch-originated
  // wheel-like events on some devices, triggering blockScrollForward's
  // preventDefault and producing a stuck, need-to-keep-scrolling feeling)
  useEffect(() => {
    if (isMobile) return
    const handleWheel = (e: WheelEvent) => {
      if (!sectionRef.current || e.ctrlKey) return
      const rect = sectionRef.current.getBoundingClientRect()
      if (rect.top > 50 || rect.top < -50) return
      const step = currentStepRef.current
      if (e.deltaY > 0 && step >= steps.length - 1) {
        // Soft speed bump: right after landing on the last step, eat a brief
        // window of forward scroll input instead of releasing control
        // straight to the browser. Without this, a single fast flick right
        // as the last step becomes current carries straight through into
        // whatever comes next (e.g. blowing through Graph 4-5's last step
        // into Section 02) with no resistance at all.
        if (Date.now() - reachedEndTime.current < endBufferMs) {
          e.preventDefault()
        }
        return
      }
      if (e.deltaY > 0 && blockScrollForward?.()) { e.preventDefault(); return }
      if (e.deltaY < 0 && step <= 0) return
      e.preventDefault()
      const now = Date.now()
      if (now - lastScrollTime.current < 1000) return
      accumulatedDeltaRef.current += e.deltaY
      if (accumulatedDeltaRef.current > 400) {
        if (step === 0 && Date.now() - sectionEnteredTime.current < 1200) {
          accumulatedDeltaRef.current = 0; return
        }
        accumulatedDeltaRef.current = 0; lastScrollTime.current = now
        setCurrentStep(prev => Math.min(steps.length - 1, prev + 1))
      } else if (accumulatedDeltaRef.current < -400) {
        accumulatedDeltaRef.current = 0; lastScrollTime.current = now
        setCurrentStep(prev => Math.max(0, prev - 1))
      }
    }
    window.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    return () => window.removeEventListener('wheel', handleWheel, { capture: true })
  }, [steps.length, blockScrollForward, isMobile, endBufferMs])

  // touch scroll (desktop/tablet touchscreens only — mobile uses explicit
  // tap zones instead, since trying to distinguish "swipe to change step"
  // from "swipe to scroll the page" with heuristics was unreliable and
  // fighting with normal page scroll)
  useEffect(() => {
    if (isMobile) return
    let touchStartY = 0, touchStartX = 0
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) { touchStartY = e.touches[0].clientY; touchStartX = e.touches[0].clientX }
    }
    const handleTouchEnd = (e: TouchEvent) => {
      if (!sectionRef.current || e.changedTouches.length !== 1) return
      const rect = sectionRef.current.getBoundingClientRect()
      if (rect.top > 50 || rect.top < -50) return
      const deltaY = touchStartY - e.changedTouches[0].clientY
      const deltaX = Math.abs(touchStartX - e.changedTouches[0].clientX)
      if (Math.abs(deltaY) < 60 || deltaX > Math.abs(deltaY)) return
      const step = currentStepRef.current
      if (deltaY > 0 && step < steps.length - 1) {
        if (blockScrollForward?.()) return
        if (step === 0 && Date.now() - sectionEnteredTime.current < 1200) return
        e.preventDefault()
        setCurrentStep(prev => Math.min(steps.length - 1, prev + 1))
      } else if (deltaY < 0 && step > 0) {
        e.preventDefault()
        setCurrentStep(prev => Math.max(0, prev - 1))
      }
    }
    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: false })
    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [steps.length, blockScrollForward, isMobile])

  const setupNodeInteractions = (
    nodeG: d3.Selection<SVGGElement, unknown, null, undefined>,
    simulation: d3.Simulation<Node, Edge>,
    currentMode: Mode
  ) => {
    const drag = d3.drag<SVGCircleElement, Node>()
      .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
      .on('end', (_event, d) => { if (!_event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null })

    const imageDrag = d3.drag<SVGImageElement, Node>()
      .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
      .on('end', (_event, d) => { if (!_event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null })

    if (!isMobile) {
      nodeG.selectAll<SVGCircleElement, Node>('circle')
        .on('mouseenter', (event, d) => {
          setHoveredNode(d.id)
          tooltipRef.current?.style('opacity', 1)
            .style('left', (event.clientX + 12) + 'px').style('top', (event.clientY - 28) + 'px')
            .html(getTooltipHtml(d, currentMode))
        })
        .on('mousemove', event => { tooltipRef.current?.style('left', (event.clientX + 12) + 'px').style('top', (event.clientY - 28) + 'px') })
        .on('mouseleave', () => { setHoveredNode(null); tooltipRef.current?.style('opacity', 0) })
        .call(drag)
      nodeG.selectAll<SVGImageElement, Node>('image')
        .on('mouseenter', (event, d) => {
          setHoveredNode(d.id)
          tooltipRef.current?.style('opacity', 1)
            .style('left', (event.clientX + 12) + 'px').style('top', (event.clientY - 28) + 'px')
            .html(getTooltipHtml(d, currentMode))
        })
        .on('mousemove', event => { tooltipRef.current?.style('left', (event.clientX + 12) + 'px').style('top', (event.clientY - 28) + 'px') })
        .on('mouseleave', () => { setHoveredNode(null); tooltipRef.current?.style('opacity', 0) })
        .call(imageDrag)
    } else {
      nodeG.selectAll<SVGCircleElement, Node>('circle').call(drag)
      nodeG.selectAll<SVGImageElement, Node>('image').call(imageDrag)
    }
  }

  const autoZoom = (
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    width: number,
    height: number,
    padding: number,
    delay: number = 800
  ) => {
    return setTimeout(() => {
      if (!svgRef.current || !zoomRef.current) return
      try {
        const bounds = (g.node() as SVGGElement).getBBox()
        if (bounds.width === 0) return
        const scaleX = (width - padding * 2) / bounds.width
        const scaleY = (height - padding * 2) / bounds.height
        const scale = Math.min(scaleX, scaleY)
        const tx = (width - bounds.width * scale) / 2 - bounds.x * scale
        const ty = (height - bounds.height * scale) / 2 - bounds.y * scale
        d3.select(svgRef.current).transition().duration(600)
          .call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
      } catch (_) {}
    }, delay)
  }

  return {
    currentStep,
    setCurrentStep,
    hoveredNode,
    setHoveredNode,
    graphSize,
    sectionRef,
    svgRef,
    graphPanelRef,
    simulationRef,
    activeNodesRef,
    activeEdgesRef,
    zoomRef,
    tooltipRef,
    isMobile,
    setupNodeInteractions,
    autoZoom,
  }
}