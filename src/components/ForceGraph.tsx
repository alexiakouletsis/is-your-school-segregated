import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { Mode } from '../App'

interface Node {
  id: number
  ses: string
  race_ethnicity: string
  courses: string
  grade_level: number
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

interface Edge {
  source: number | Node
  target: number | Node
  weight: number
}

interface GraphData {
  nodes: Node[]
  edges: Edge[]
}

interface Props {
  data: GraphData
  width: number
  height: number
  forceMult?: number
  minEdgeWeight?: number
  mode?: Mode
}

const SES_HIGH_COLOR = '#F17091'
const SES_LOW_COLOR = '#00B178'
const RACE_1_COLOR = '#FF954D'
const RACE_2_COLOR = '#6897FF'
const EDGE_COLOR = '#ccc'
const HIGHLIGHTED_EDGE_COLOR = '#888'

export default function ForceGraph({ data, width, height, forceMult = 1, minEdgeWeight = 5, mode = 'ses' }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const gRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null)
  const tooltipRef = useRef<d3.Selection<HTMLDivElement, unknown, HTMLElement, unknown> | null>(null)
  const [hoveredNode, setHoveredNode] = useState<number | null>(null)

  const getNodeColor = (d: Node) => {
    if (mode === 'race') {
      return d.race_ethnicity === 'white_asian' ? RACE_1_COLOR : RACE_2_COLOR
    }
    return d.ses === 'higher' ? SES_HIGH_COLOR : SES_LOW_COLOR
  }

  const getTooltipColor = (d: Node) => {
    if (mode === 'race') {
      return d.race_ethnicity === 'white_asian' ? RACE_1_COLOR : RACE_2_COLOR
    }
    return d.ses === 'higher' ? SES_HIGH_COLOR : SES_LOW_COLOR
  }

  const getTooltipLabel = (d: Node) => {
    if (mode === 'race') {
      return d.race_ethnicity === 'white_asian' ? 'White/Asian student' : 'Student of color'
    }
    return d.ses === 'higher' ? 'Above median SES' : 'Below median SES'
  }

  const formatCourses = (courses: string) => {
    const list = courses.split(', ').map(c =>
      c.toLowerCase().replace(/\b\w/g, l => l.toUpperCase())
    )
    if (list.length === 0) return ''
    if (list.length === 1) return list[0]
    return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1]
  }

  const getTooltipHtml = (d: Node) => `
    <div style="font-weight:600;margin-bottom:4px;color:${getTooltipColor(d)}">
      ${getTooltipLabel(d)}
    </div>
    <div style="color:#666;font-size:11px"><span style="font-weight:600;color:#111">Classes: </span>${formatCourses(d.courses)}</div>
  `

  useEffect(() => {
    if (!svgRef.current || !data || width === 0 || height === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const filteredEdges = data.edges.filter(e => e.weight >= minEdgeWeight)
    const nodes: Node[] = data.nodes.map(n => ({ ...n }))
    const edges = filteredEdges.map(e => ({ ...e }))

    const simulation = d3.forceSimulation<Node>(nodes)
      .force('link', d3.forceLink<Node, Edge>(edges)
        .id(d => d.id)
        .distance(d => Math.max(10, 80 - (d.weight * 4)) * forceMult)
        .strength(d => Math.min(1, d.weight * 0.08) / forceMult)
      )
      .force('charge', d3.forceManyBody().strength(-55 * forceMult))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(8))

    const g = svg.append('g')
    gRef.current = g

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .filter(event => {
        if (event.type === 'wheel') return event.ctrlKey
        if (event.type === 'mousedown') return true
        if (event.type === 'touchstart') return true
        return false
      })
      .on('zoom', event => g.attr('transform', event.transform))
    svg.call(zoom)
    zoomRef.current = zoom

    const link = g.append('g')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', EDGE_COLOR)
      .attr('stroke-width', d => Math.sqrt(d.weight) * 0.5)
      .attr('stroke-opacity', 0.4)

    const node = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', 6)
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5)
      .attr('cursor', 'pointer')
      .call(
        d3.drag<any, Node>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (_event, d) => {
            if (!_event.active) simulation.alphaTarget(0)
            d.fx = null; d.fy = null
          })
      )

    const tooltip = d3.select('body')
      .append('div')
      .style('position', 'fixed')
      .style('background', 'rgba(255,255,255,0.97)')
      .style('border', '1px solid #ddd')
      .style('border-radius', '8px')
      .style('padding', '8px 12px')
      .style('font-family', "'Kiwi Maru', serif")
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('max-width', '220px')
      .style('z-index', '9999')
      .style('line-height', '1.5')
    tooltipRef.current = tooltip

    node
      .on('mouseenter', (event, d) => {
        setHoveredNode(d.id)
        tooltip
          .style('opacity', 1)
          .style('left', (event.clientX + 12) + 'px')
          .style('top', (event.clientY - 28) + 'px')
          .html(getTooltipHtml(d))
      })
      .on('mousemove', event => {
        tooltip
          .style('left', (event.clientX + 12) + 'px')
          .style('top', (event.clientY - 28) + 'px')
      })
      .on('mouseleave', () => {
        setHoveredNode(null)
        tooltip.style('opacity', 0)
      })
      .on('click', (event, d) => {
        const isAlreadyHovered = hoveredNode === d.id
        setHoveredNode(isAlreadyHovered ? null : d.id)
        if (isAlreadyHovered) {
          tooltip.style('opacity', 0)
        } else {
          tooltip
            .style('opacity', 1)
            .style('left', (event.clientX + 12) + 'px')
            .style('top', (event.clientY - 28) + 'px')
            .html(getTooltipHtml(d))
        }
      })

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as Node).x ?? 0)
        .attr('y1', d => (d.source as Node).y ?? 0)
        .attr('x2', d => (d.target as Node).x ?? 0)
        .attr('y2', d => (d.target as Node).y ?? 0)
      node
        .attr('cx', d => d.x ?? 0)
        .attr('cy', d => d.y ?? 0)
    })

    simulation.on('end', () => {
      if (!svgRef.current || !zoomRef.current || !gRef.current) return
      const gNode = gRef.current.node()
      if (!gNode) return
      try {
        const bounds = gNode.getBBox()
        if (bounds.width === 0 || bounds.height === 0) return
        const padding = 40
        const scaleX = (width - padding * 2) / bounds.width
        const scaleY = (height - padding * 2) / bounds.height
        const scale = Math.min(scaleX, scaleY, 1)
        const tx = (width - bounds.width * scale) / 2 - bounds.x * scale
        const ty = (height - bounds.height * scale) / 2 - bounds.y * scale
        d3.select(svgRef.current)
          .call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
      } catch (_) {}
    })

    return () => {
      simulation.stop()
      tooltip.remove()
    }
  }, [data, width, height, forceMult, minEdgeWeight, mode])

  useEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)

    if (hoveredNode === null) {
      svg.selectAll('circle').attr('opacity', 1).attr('r', 6)
      svg.selectAll('line').attr('stroke', EDGE_COLOR).attr('stroke-opacity', 0.4)
      return
    }

    const connectedIds = new Set<number>()
    connectedIds.add(hoveredNode)
    data.edges.filter(e => e.weight >= minEdgeWeight).forEach(e => {
      const src = typeof e.source === 'object' ? (e.source as Node).id : e.source
      const tgt = typeof e.target === 'object' ? (e.target as Node).id : e.target
      if (src === hoveredNode) connectedIds.add(tgt)
      if (tgt === hoveredNode) connectedIds.add(src)
    })

    svg.selectAll<SVGCircleElement, Node>('circle')
      .attr('opacity', d => connectedIds.has(d.id) ? 1 : 0.15)
      .attr('r', d => d.id === hoveredNode ? 9 : 6)

    svg.selectAll<SVGLineElement, Edge>('line')
      .attr('stroke', d => {
        const src = typeof d.source === 'object' ? (d.source as Node).id : d.source
        const tgt = typeof d.target === 'object' ? (d.target as Node).id : d.target
        return (src === hoveredNode || tgt === hoveredNode) ? HIGHLIGHTED_EDGE_COLOR : EDGE_COLOR
      })
      .attr('stroke-opacity', d => {
        const src = typeof d.source === 'object' ? (d.source as Node).id : d.source
        const tgt = typeof d.target === 'object' ? (d.target as Node).id : d.target
        return (src === hoveredNode || tgt === hoveredNode) ? 0.8 : 0.05
      })
  }, [hoveredNode, data, minEdgeWeight])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{ display: 'block' }}
    />
  )
}