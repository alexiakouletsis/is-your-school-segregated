import type { Mode } from '../App'
import type { Node, Edge } from './graphTypes'

export const PROTAGONIST_HIGH = 0
export const getProtagonistLow = (mode: Mode) => mode === 'race' ? 14 : 1
export const EDGE_COLOR = '#ccc'
export const HIGHLIGHTED_EDGE_COLOR = '#888'

export const isProtagonist = (id: number, mode: Mode) =>
  id === PROTAGONIST_HIGH || id === getProtagonistLow(mode)

export const getNodeColor = (d: Node, mode: Mode): string => {
  if (d.id === PROTAGONIST_HIGH) return mode === 'race' ? '#FF954D' : '#F17091'
  if (d.id === getProtagonistLow(mode)) return mode === 'race' ? '#6897FF' : '#00B178'
  if (mode === 'race') return d.race_ethnicity === 'white_asian' ? '#FF954D' : '#6897FF'
  return d.ses === 'higher' ? '#F17091' : '#00B178'
}

// Colors an edge by its source node's group instead of a flat grey — shared
// by GraphSection, GraphSection45, and GraphSection68's step 1 (all three
// use the same original PROTAGONIST_HIGH/getProtagonistLow scheme). Change
// this one place to affect all three at once.
//
// NOT used by GraphSection68's alt-school steps — those are a genuinely
// different dataset with their own protagonist ids that happen to also be
// 0/1, and reusing this function there would be coincidentally correct
// today but fragile (see the ALT_PROTAGONIST_HIGH/LOW comment in
// GraphSection68.tsx for why that file deliberately keeps its own
// getAltEdgeColor separate).
export const getEdgeColor = (d: Edge, mode: Mode): string => {
  const source = typeof d.source === 'object' ? (d.source as Node) : null
  if (!source) return EDGE_COLOR // source not yet resolved to a Node object — fall back rather than guess
  return getNodeColor(source, mode)
}

export const getTooltipLabel = (d: Node, mode: Mode): string => {
  if (d.id === PROTAGONIST_HIGH) return mode === 'race' ? 'White/Asian student' : 'Above median SES'
  if (d.id === getProtagonistLow(mode)) return mode === 'race' ? 'Student of color' : 'Below median SES'
  if (mode === 'race') return d.race_ethnicity === 'white_asian' ? 'White/Asian student' : 'Student of color'
  return d.ses === 'higher' ? 'Above median SES' : 'Below median SES'
}

export const formatCourses = (courses: string): string => {
  const list = courses.split(', ').map(c => c.toLowerCase().replace(/\b\w/g, l => l.toUpperCase()))
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1]
}

export const getTooltipHtml = (d: Node, mode: Mode): string => `
  <div style="font-weight:600;margin-bottom:4px;color:${getNodeColor(d, mode)}">${getTooltipLabel(d, mode)}</div>
  <div style="color:#666;font-size:11px"><span style="font-weight:600;color:#111">Classes: </span>${formatCourses(d.courses)}</div>
`

export const getFaceSrc = (d: Node, mode: Mode, size: 'K3' | '45' | '68'): string => {
  if (mode === 'race') {
    return d.id === PROTAGONIST_HIGH
      ? `/assets/whiteasian-dot-${size}.svg`
      : `/assets/poc-dot-${size}.svg`
  }
  return d.id === PROTAGONIST_HIGH
    ? `/assets/high-SES-dot-${size}.svg`
    : `/assets/low-SES-dot-${size}.svg`
}

export const applyHoverHighlight = (
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  hoveredNode: number | null,
  activeEdges: Edge[],
  currentStep?: number
) => {
  if (hoveredNode === null) {
    svg.selectAll<SVGCircleElement, Node>('circle').attr('opacity', 1).attr('r', currentStep === 1 ? 10 : 6)
    svg.selectAll<SVGLineElement, Edge>('line').attr('stroke-opacity', 0.4)
    return
  }
  const connectedIds = new Set<number>([hoveredNode])
  activeEdges.forEach(e => {
    const src = typeof e.source === 'object' ? (e.source as Node).id : e.source as number
    const tgt = typeof e.target === 'object' ? (e.target as Node).id : e.target as number
    if (src === hoveredNode) connectedIds.add(tgt)
    if (tgt === hoveredNode) connectedIds.add(src)
  })
  svg.selectAll<SVGCircleElement, Node>('circle')
    .attr('opacity', d => connectedIds.has(d.id) ? 1 : 0.15)
    .attr('r', d => d.id === hoveredNode ? 9 : (currentStep === 1 ? 10 : 6))
  svg.selectAll<SVGLineElement, Edge>('line')
    .attr('stroke-opacity', d => {
      const src = typeof d.source === 'object' ? (d.source as Node).id : d.source as number
      const tgt = typeof d.target === 'object' ? (d.target as Node).id : d.target as number
      return (src === hoveredNode || tgt === hoveredNode) ? 0.8 : 0.05
    })
}