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

// For each low-group student (below SES line / student of color), look at
// their own edges and work out what fraction of THEIR neighbors are
// high-group (above SES line / white-asian) — then average that per-student
// ratio across all low-group students. Per-student average (every student
// counts equally regardless of degree), not a pooled edge count. This is
// the "actual" half of the random-mixing comparison rendered in NodeStats —
// the "expected if classes were random" half is just the population's own
// high-group share, which NodeStats already computes for the "Of this
// given network" breakdown, so it doesn't need its own helper here.
// Low-group students with zero qualifying edges are excluded (an undefined
// ratio, not a 0%) — same reasoning as computeLowGroupFullIsolationPct
// below, just applied to averaging instead of a threshold.
// Returns null (not 0) when there's no low-group student with any
// qualifying edge to average at all — a real 0% ("every low-group
// student's classmates are entirely low-group") and "nothing valid to
// compute this from" are different situations and shouldn't render as the
// same number. Callers (NodeStats) should skip the corresponding sentence
// entirely on null rather than treating it as a real statistic.
export const computeLowGroupAvgHighNeighborPct = (nodes: Node[], edges: Edge[], mode: Mode): number | null => {
  const hasGroup = (n: Node) => !!(n.ses || n.race_ethnicity)
  const isHigh = (n: Node) => mode === 'race' ? n.race_ethnicity === 'white_asian' : n.ses === 'higher'
  const byId = new Map(nodes.map(n => [n.id, n]))
  const idOf = (end: number | Node): number => (typeof end === 'object' ? end.id : end)

  const neighborsOf = new Map<number, number[]>()
  edges.forEach(e => {
    const srcId = idOf(e.source)
    const tgtId = idOf(e.target)
    const srcNode = byId.get(srcId)
    const tgtNode = byId.get(tgtId)
    if (!srcNode || !tgtNode || !hasGroup(srcNode) || !hasGroup(tgtNode)) return
    if (!neighborsOf.has(srcId)) neighborsOf.set(srcId, [])
    if (!neighborsOf.has(tgtId)) neighborsOf.set(tgtId, [])
    neighborsOf.get(srcId)!.push(tgtId)
    neighborsOf.get(tgtId)!.push(srcId)
  })

  const lowNodes = nodes.filter(n => hasGroup(n) && !isHigh(n))
  let sumHighRatio = 0, counted = 0

  lowNodes.forEach(n => {
    const neighborIds = neighborsOf.get(n.id)
    if (!neighborIds || neighborIds.length === 0) return
    const highNeighborCount = neighborIds.filter(nid => {
      const neighbor = byId.get(nid)
      return neighbor && isHigh(neighbor)
    }).length
    sumHighRatio += highNeighborCount / neighborIds.length
    counted++
  })

  if (counted === 0) return null
  return Math.round((sumHighRatio / counted) * 100)
}

// Of all low-group students, what fraction share ZERO classes with any
// high-group student — i.e. every one of their edges (if they have any at
// all) stays within their own group. Deliberately includes students with no
// edges at all (they trivially share zero classes with anyone, high-group
// included) — unlike the averaging helper above, there's no "undefined
// ratio" here to exclude; a student with no cross-group contact is exactly
// what this is measuring, degree zero or not.
// Returns null (not 0) when there are no low-group students in this
// network at all — same reasoning as above: a real 0% ("nobody in the
// low group is isolated") and "there's no low group to measure" are
// different situations, and only the former should render as a stat.
export const computeLowGroupFullIsolationPct = (nodes: Node[], edges: Edge[], mode: Mode): number | null => {
  const hasGroup = (n: Node) => !!(n.ses || n.race_ethnicity)
  const isHigh = (n: Node) => mode === 'race' ? n.race_ethnicity === 'white_asian' : n.ses === 'higher'
  const byId = new Map(nodes.map(n => [n.id, n]))
  const idOf = (end: number | Node): number => (typeof end === 'object' ? end.id : end)

  const lowNodes = nodes.filter(n => hasGroup(n) && !isHigh(n))
  if (lowNodes.length === 0) return null

  const hasHighNeighbor = new Set<number>()
  edges.forEach(e => {
    const srcId = idOf(e.source)
    const tgtId = idOf(e.target)
    const srcNode = byId.get(srcId)
    const tgtNode = byId.get(tgtId)
    if (!srcNode || !tgtNode || !hasGroup(srcNode) || !hasGroup(tgtNode)) return
    const srcHigh = isHigh(srcNode)
    const tgtHigh = isHigh(tgtNode)
    if (srcHigh === tgtHigh) return // not a cross-group edge
    if (!srcHigh) hasHighNeighbor.add(srcId)
    if (!tgtHigh) hasHighNeighbor.add(tgtId)
  })

  const isolatedCount = lowNodes.filter(n => !hasHighNeighbor.has(n.id)).length
  return Math.round((isolatedCount / lowNodes.length) * 100)
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