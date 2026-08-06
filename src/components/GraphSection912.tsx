import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { motion, AnimatePresence } from 'framer-motion'
import { useGraphSection } from '../hooks/useGraphSection'
import NodeStats from './NodeStats'
import type { Mode } from '../App'
import type { Node, Edge, GraphData } from './graphTypes'
import { applyHoverHighlight, getTooltipHtml } from './graphUtils'

const FACE_SIZE = 25

const STEPS = [
  { label: 'All students in grade 9.' },
  { label: 'All students in grade 10.' },
  { label: 'All students in grade 11.' },
  { label: 'All students in grade 12.' },
]

// Only two of the four steps get a persistent explanatory sentence; the
// other two show just the graph + title. Typed once on arriving at a step
// that has one, cleared when moving to a step that doesn't — same
// mechanism as GraphSection68's step-1 "notice text", generalized to any
// step with a defined sentence instead of hardcoding step 1 specifically.
const STEP_NOTICES: Record<number, string> = {
  0: "This is what a high school with high levels of course tracking/segregation looks like.",
  2: "The two groups keep drifting apart as pipelines solidify — graphs thin out later because seniors take fewer, scattered classes.",
}
const getNoticeTarget = (step: number) => STEP_NOTICES[step] ?? ''

// Real per-grade course-sharing data at this school doesn't preserve a
// single student id across all four years the way the original K-8 dataset
// does — each grade's export re-indexes students 0..N-1 independently
// (checked: of the ids numerically common to all four files, only a small
// handful have matching ses+race in every grade — consistent with random
// coincidence, not real continuity). So, same as GraphSection68's
// comparison-school steps, these are representative composite
// protagonists: a real specific student picked PER GRADE (not the same
// physical person year to year), chosen so (a) their ses/race attributes
// genuinely match "high"/"low" in both mode dimensions simultaneously, and
// (b) they share zero classes with their counterpart that year — so the
// "two dots never share a class again" throughline from Section03Part2
// holds every year by construction, even though which real student sits in
// the "high"/"low" seat changes yearly.
const PROTAGONIST_IDS: Record<number, { high: number; low: number }> = {
  0: { high: 244, low: 16 },  // grade 9
  1: { high: 87, low: 224 },  // grade 10
  2: { high: 197, low: 227 }, // grade 11
  3: { high: 43, low: 25 },   // grade 12
}

const isProtagonist912 = (id: number, highId: number, lowId: number) =>
  id === highId || id === lowId

const getNodeColor912 = (d: Node, mode: Mode, highId: number, lowId: number): string => {
  if (d.id === highId) return mode === 'race' ? '#FF954D' : '#F17091'
  if (d.id === lowId) return mode === 'race' ? '#6897FF' : '#00B178'
  if (mode === 'race') return d.race_ethnicity === 'white_asian' ? '#FF954D' : '#6897FF'
  return d.ses === 'higher' ? '#F17091' : '#00B178'
}

// Same grouping getNodeColor912 uses for the non-protagonist coloring
// branch, reused to bias a brand-new node's STARTING position toward its
// eventual side rather than dropping it at a random spot near center. See
// the comment on the cold-start branch below for why this matters.
const isHighGroup912 = (d: Node, mode: Mode): boolean =>
  mode === 'race' ? d.race_ethnicity === 'white_asian' : d.ses === 'higher'

const getFaceSrc912 = (d: Node, mode: Mode, highId: number): string => {
  if (mode === 'race') {
    return d.id === highId ? '/assets/whiteasian-dot-912.svg' : '/assets/poc-dot-912.svg'
  }
  return d.id === highId ? '/assets/high-SES-dot-912.svg' : '/assets/low-SES-dot-912.svg'
}

// Same reasoning as GraphSection68's getAltEdgeColor: colors each edge by
// its source node's group so the pink/green (or orange/blue) boundary
// reads clearly, rather than a flat grey.
const getEdgeColor912 = (d: Edge, mode: Mode): string => {
  const src = d.source as unknown as Node
  if (mode === 'race') return src.race_ethnicity === 'white_asian' ? '#FF954D' : '#6897FF'
  return src.ses === 'higher' ? '#F17091' : '#00B178'
}

// Node counts here (239-327 per grade) sit in the same range that made
// grade 6's comparison-school graph glitchy in GraphSection68 (343 nodes
// uncapped was the problem there), so all four grades stay capped. These
// caps were previously much smaller for grades 10-12 (160/160/180) to keep
// total edge count down given the old (incorrectly low) >=1 weight
// threshold — see MIN_EDGE_WEIGHT below. Now that threshold is back to >=2
// for all grades, those small caps left 10-12 far too thin (~4-5 edges/node
// vs 6-8's ~8-8.7). Raised here to bring density back in line: grade 10's
// 280 lands its final rendered density (~8.5 edges/node, ~2300 edges) right
// in GraphSection68's range; grades 11 (270) and 12 (245) are set just
// above their real filtered population (266 and 239 respectively), i.e.
// effectively "no sampling" for those two, letting their genuinely thinner
// data (course pathways diverging further each year) show through rather
// than being artificially padded or over-thinned.
const NODE_SAMPLE_CAP: Record<number, number> = {
  0: 240, // grade 9
  1: 280, // grade 10
  2: 270, // grade 11 (full population; no sampling)
  3: 245, // grade 12 (full population; no sampling)
}

// All four grades use the same >=2 threshold. An earlier version dropped
// grades 10-12 to >=1 on the theory that they "naturally thin out" and
// needed a lower bar to stay visually comparable to grade 9 — but measured
// against the real data, that was backwards: >=1 pulls in every weak,
// single-shared-class edge, which made grades 10-12 come out at ~18-20
// edges/node after sampling — roughly *double* grade 9's own density (~10)
// and 2-2.5x GraphSection68's 6-8 density (~8-8.7). A force layout at that
// edge density collapses into a uniformly tightly-packed mass with no real
// distance differentiation between nodes, which is what was actually
// producing the "gridded" look — not a force-parameter problem. At >=2
// uniformly, grades 10-12 do come out thinner than grade 9 (~4-5 edges/node
// vs ~10) — that's the real "pathways diverge further each year" trend the
// original comment predicted, just true at >=2 rather than >=1. If that
// ends up reading as too sparse visually, compensate via NODE_SAMPLE_CAP
// (more nodes) rather than lowering this threshold again.
const MIN_EDGE_WEIGHT: Record<number, number> = {
  0: 2,
  1: 2,
  2: 2,
  3: 2,
}

// The old -75/-115 split was compensating for the link-strength floor
// (removed above) — grade 9 needed weak charge to stay "spaced out," 10-12
// needed strong charge to avoid the same uniform-spring mesh visibly
// crystallizing. Now that real per-edge strength variation is restored,
// that split isn't the right lever anymore: a single moderate charge
// behaves consistently across all four grades, since it's the springs
// doing the cluster-differentiation work, not the charge fighting a
// uniform mesh. -90 sits between the old extremes.
const CHARGE_STRENGTH: Record<number, number> = {
  0: -90,
  1: -90,
  2: -90,
  3: -90,
}

function sampleNodes(nodes: Node[], cap: number, highId: number, lowId: number): Node[] {
  if (nodes.length <= cap) return nodes
  const protagonists = nodes.filter(n => n.id === highId || n.id === lowId)
  const rest = nodes.filter(n => n.id !== highId && n.id !== lowId)
  const groups = new Map<string, Node[]>()
  rest.forEach(n => {
    const key = n.ses
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(n)
  })
  const remainingCap = Math.max(0, cap - protagonists.length)
  const ratio = rest.length > 0 ? remainingCap / rest.length : 0
  const sampled: Node[] = [...protagonists]
  groups.forEach(group => {
    const shuffled = [...group].sort(() => Math.random() - 0.5)
    const take = Math.round(group.length * ratio)
    sampled.push(...shuffled.slice(0, take))
  })
  return sampled
}

// Removes not just fully-isolated nodes but also single-edge "stray" nodes
// — a lone student whose only connection is one classmate reads as visual
// noise, not a real cluster. Iterative because dropping a stray node can
// knock its one neighbor down to degree 1 too, so this repeats until
// nothing left has degree < 2. Protagonists are always exempt.
function pruneLowDegree(
  nodes: Node[], edges: Edge[], highId: number, lowId: number, minDegree = 2
): { nodes: Node[]; edges: Edge[] } {
  let ids = new Set(nodes.map(n => n.id))
  let remaining = edges
  let changed = true
  while (changed) {
    changed = false
    const degree = new Map<number, number>()
    remaining.forEach(e => {
      const s = e.source as number, t = e.target as number
      degree.set(s, (degree.get(s) ?? 0) + 1)
      degree.set(t, (degree.get(t) ?? 0) + 1)
    })
    const toRemove = new Set<number>()
    ids.forEach(id => {
      if (id === highId || id === lowId) return
      if ((degree.get(id) ?? 0) < minDegree) toRemove.add(id)
    })
    if (toRemove.size > 0) {
      changed = true
      toRemove.forEach(id => ids.delete(id))
      remaining = remaining.filter(e => ids.has(e.source as number) && ids.has(e.target as number))
    }
  }
  return {
    nodes: nodes.filter(n => ids.has(n.id)),
    edges: remaining,
  }
}

// A local degree threshold (pruneLowDegree above) can't catch this: a small
// clique of students who only share one odd elective TOGETHER, and nothing
// else, can each individually have degree >= 3 within that clique while the
// clique as a whole is disconnected (or only very thinly bridged) from
// everyone else. The force simulation naturally flings a disconnected or
// weakly-connected little cluster like that away from the main mass — the
// "random floaters" reported. A degree threshold has no way to see that,
// since it only looks at each node's own edge count, never at what the rest
// of its component looks like. Keeping only the single largest connected
// component is a global check that catches it regardless of local degree.
function keepLargestComponent(
  nodes: Node[], edges: Edge[], highId: number, lowId: number
): { nodes: Node[]; edges: Edge[] } {
  const adjacency = new Map<number, number[]>()
  nodes.forEach(n => adjacency.set(n.id, []))
  edges.forEach(e => {
    const s = e.source as number, t = e.target as number
    adjacency.get(s)?.push(t)
    adjacency.get(t)?.push(s)
  })

  const visited = new Set<number>()
  let largest: Set<number> = new Set()

  nodes.forEach(n => {
    if (visited.has(n.id)) return
    const component = new Set<number>([n.id])
    const queue = [n.id]
    visited.add(n.id)
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          component.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
    if (component.size > largest.size) largest = component
  })

  // Always keep both protagonists even in the (very unlikely, given both
  // were vetted against the real data) case one somehow lands outside the
  // giant component — silently dropping a protagonist would break "the two
  // never share a class again," which depends on both being on screen.
  const keepIds = new Set(largest)
  keepIds.add(highId)
  keepIds.add(lowId)

  return {
    nodes: nodes.filter(n => keepIds.has(n.id)),
    edges: edges.filter(e => keepIds.has(e.source as number) && keepIds.has(e.target as number)),
  }
}

// The weight>=2 threshold + degree-4 prune + largest-component filtering
// above (all needed to avoid noise/floaters — see their own comments) ends
// up dropping a lot of REAL students who simply don't share 2+ classes
// with any ONE person: grade 12's ~239 real students shrinks well below
// grade 9's ~240 this way, reading as far less node/edge-dense even though
// both datasets have a similar number of real students. Rather than lower
// the weight threshold again (which reintroduces the grid/lattice problem
// from over-uniform edge strength — see MIN_EDGE_WEIGHT/CHARGE_STRENGTH
// comments), each dropped-but-real student who has at least FOUR real ties
// (even weight 1 each) into the surviving graph gets pulled back in, with
// ALL of those ties included — not just the strongest one. A lower bar (2)
// was tried first and fixed the "floats off the graph" problem, but still
// let through the occasional student with only 2-3 total connections,
// which reads as unrealistically thin for a real course-sharing pattern.
// Matching the structural prune's own threshold (see pruneLowDegree call
// above) means no rendered node, structural or rescued, ever has fewer
// than 4 real connections. This is different from a "floater" (gotcha
// #12): a floater is a small clique disconnected from the main mass;
// these are 4+ real ties INTO the main mass, so the node gets held in
// place by it from multiple directions, not flung away from it. Brings
// grade 12 up to ~233 nodes / ~2243 edges and grade 11 to ~266 nodes /
// ~2597 edges — both now in the same density range as grade 9 and
// GraphSection68's 6-8, not flooding.
function rescueDroppedNodes(
  sampledNodes: Node[], survivingIds: Set<number>, anyWeightPool: Edge[]
): { nodes: Node[]; edges: Edge[] } {
  const rescuedNodes: Node[] = []
  const rescuedEdges: Edge[] = []
  for (const n of sampledNodes) {
    if (survivingIds.has(n.id)) continue
    const ties = anyWeightPool.filter(e => {
      const s = e.source as number, t = e.target as number
      const other = s === n.id ? t : (t === n.id ? s : null)
      return other !== null && survivingIds.has(other)
    })
    if (ties.length >= 4) {
      rescuedNodes.push(n)
      rescuedEdges.push(...ties)
    }
  }
  return { nodes: rescuedNodes, edges: rescuedEdges }
}

export default function GraphSection912({ mode, resetSignal }: { mode: Mode; resetSignal?: number }) {
  // [9th, 10th, 11th, 12th] — converted from the real GML course-sharing
  // data via scripts/convert_gml_to_json.py, dropped into public/data/graphs/
  // alongside the existing per-grade files.
  const [allGraphData, setAllGraphData] = useState<(GraphData | null)[]>([null, null, null, null])
  const [noticeText, setNoticeText] = useState('')
  const noticeTargetRef = useRef('')
  const noticeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // The TRUE full-population node list per step (pre-sampling) — NodeStats
  // always reports real percentages regardless of how many nodes actually
  // got rendered/simulated.
  const fullPopulationRef = useRef<Node[]>([])

  // Guards against scrolling straight past a step before its render has
  // actually painted, same purpose as GraphSection68's altStepEnteredAtRef
  // — every step here is comparably heavy (real per-grade data), so the
  // buffer applies to all of them rather than just specific ones.
  const stepEnteredAtRef = useRef(0)

  const {
    currentStep, setCurrentStep, hoveredNode, setHoveredNode, graphSize,
    sectionRef, svgRef, graphPanelRef, simulationRef,
    activeNodesRef, activeEdgesRef, tooltipRef,
    isMobile, setupNodeInteractions, autoZoom,
  } = useGraphSection({
    steps: STEPS,
    blockScrollForward: () => Date.now() - stepEnteredAtRef.current < 900,
  })

  // Only bumped by Conclusion's bottom-of-page toggle (a deliberate full
  // restart), never by a plain mode change — see the comment on
  // graphResetSignal in App.tsx.
  const isFirstResetRender = useRef(true)
  useEffect(() => {
    if (isFirstResetRender.current) { isFirstResetRender.current = false; return }
    setCurrentStep(0)
  }, [resetSignal, setCurrentStep])

  useEffect(() => { stepEnteredAtRef.current = Date.now() }, [currentStep])

  // load data
  useEffect(() => {
    Promise.all([
      fetch('/data/graphs/9.json').then(r => r.json()),
      fetch('/data/graphs/10.json').then(r => r.json()),
      fetch('/data/graphs/11.json').then(r => r.json()),
      fetch('/data/graphs/12.json').then(r => r.json()),
    ]).then(setAllGraphData)
      .catch(err => console.error('data load error:', err))
  }, [])

  // hover highlighting
  useEffect(() => {
    if (!svgRef.current) return
    // Same reasoning as GraphSection45's identical comment — step 1 here
    // means grade 10, not whatever GraphSection.tsx's own step 1 means.
    applyHoverHighlight(d3.select(svgRef.current), hoveredNode, activeEdgesRef.current)
  }, [hoveredNode, currentStep])

  // notice text
  useEffect(() => {
    const target = getNoticeTarget(currentStep)
    if (target === '') {
      // No sentence defined for this step — leave whatever's currently
      // displayed alone (per feedback, the previous step's sentence should
      // persist through steps that don't have their own) instead of
      // clearing it.
      return
    }
    if (target === noticeTargetRef.current) return
    noticeTargetRef.current = target
    clearInterval(noticeIntervalRef.current!)
    setNoticeText('')
    let i = 0
    noticeIntervalRef.current = setInterval(() => {
      i++
      setNoticeText(target.slice(0, i))
      if (i >= target.length) clearInterval(noticeIntervalRef.current!)
    }, 22)
  }, [currentStep])

  // main graph effect
  useEffect(() => {
    if (!svgRef.current || graphSize.width === 0) return
    if (!allGraphData[currentStep]) return

    const svg = d3.select(svgRef.current)
    const g = svg.select<SVGGElement>('g.root')
    const linkG = g.select<SVGGElement>('g.links')
    const nodeG = g.select<SVGGElement>('g.nodes')
    const { width, height } = graphSize
    const cx = width / 2, cy = height / 2
    const existingById = new Map(activeNodesRef.current.map(n => [n.id, n]))
    const { high: highId, low: lowId } = PROTAGONIST_IDS[currentStep]

    const data = allGraphData[currentStep]!
    const filteredFullNodes = data.nodes
      .filter(n => n.courses && !n.courses.toLowerCase().includes('non-reporting'))
      // Students with only a single listed course (e.g. just "Seminar" —
      // common among some grade 12 students on reduced schedules) only
      // ever tie to others through that one class, which is exactly the
      // kind of thin, single-course connection that reads as noise rather
      // than a real course-pathway relationship.
      .filter(n => n.courses.split(',').map(c => c.trim()).filter(Boolean).length > 1)

    // Sample down for the simulation/render, but keep the FULL filtered
    // list around for NodeStats — the % breakdown should reflect the true
    // population, not just whichever subset got rendered.
    const nodesToUse = sampleNodes(filteredFullNodes, NODE_SAMPLE_CAP[currentStep] ?? 300, highId, lowId)
    fullPopulationRef.current = filteredFullNodes.map(n => ({ ...n }))

    // A brand-new node (no `existing` — i.e. this grade has never been
    // simulated yet this session) previously started at a purely random
    // spot within 80px of dead center for every node regardless of group,
    // meaning "looking segregated" depended entirely on the simulation
    // having enough time to fully converge from a scrambled starting
    // point before anyone looked at it. On a true first-ever load that
    // convergence hadn't finished (alphaDecay cools the sim down before
    // full reorganization from a total scramble), so it visibly read as
    // unsegregated — then looked right on a later revisit because
    // `existing` positions from the previous (by-then-converged) visit
    // carried over instead of restarting from scratch. Biasing the
    // cold-start x-position by group (same grouping as getNodeColor912)
    // means the simulation starts from an already-roughly-separated
    // arrangement, so clusters read correctly from the first frame
    // regardless of how far the simulation gets to run — not just on
    // revisits.
    let newNodes: Node[] = nodesToUse.map(n => {
      const existing = existingById.get(n.id)
      if (existing) {
        return { ...n, x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy, fx: null, fy: null }
      }
      const groupOffset = isHighGroup912(n, mode) ? -140 : 140
      return { ...n, x: cx + groupOffset + (Math.random() - 0.5) * 70, y: cy + (Math.random() - 0.5) * 70 }
    })
    // Saved before pruning reassigns newNodes below — the rescue pass
    // needs the full positioned sampled set, not just whoever survives
    // pruning, to know who's eligible to be rescued.
    const allSampledPositioned = newNodes
    const filteredNodeIds = new Set(newNodes.map(n => n.id))
    const minWeight = MIN_EDGE_WEIGHT[currentStep] ?? 2
    // Kept separately, unfiltered by minWeight, for the rescue pass below
    // (rescueDroppedNodes) — that pass deliberately needs access to
    // weight-1 ties, which the structural graph itself excludes.
    const rawEdgesAnyWeight: Edge[] = data.edges.map(e => ({ ...e }))
    const rawEdges: Edge[] = rawEdgesAnyWeight
      .filter(e => e.weight >= minWeight)
      .filter(e => filteredNodeIds.has(e.source as number) && filteredNodeIds.has(e.target as number))

    // Prune stray low-degree nodes (isolated or single-edge) — common for
    // students whose only shared classes are a single large elective
    // (JROTC, PE, etc.), leaving them floating with barely any real
    // connections. Protagonists are always kept regardless of their own
    // degree.
    // minDegree raised from 3 to 4 — a student who shares classes with
    // only 2-3 people is realistic-but-uncommon at this granularity and
    // read as noticeably thin/unrealistic on screen. See the matching
    // rescue-threshold bump below for why this doesn't just thin the
    // graph out further.
    const pruned = pruneLowDegree(newNodes, rawEdges, highId, lowId, 4)
    newNodes = pruned.nodes
    let newEdges: Edge[] = pruned.edges

    // The degree prune above catches lone/single-edge stragglers, but not
    // small disconnected (or barely-bridged) cliques where every member
    // individually clears the degree threshold — that's the "3 edges,
    // 2-3 classes, floats away from the blobs" pattern. Keeping only the
    // largest connected component removes those regardless of their local
    // degree. See the comment on keepLargestComponent above for why a
    // degree-only check can't catch this on its own.
    const largestComponent = keepLargestComponent(newNodes, newEdges, highId, lowId)
    newNodes = largestComponent.nodes
    newEdges = largestComponent.edges

    // Bring back real students dropped above purely for being thinly
    // connected (single weight-1 tie), anchored to their one real
    // connection — see rescueDroppedNodes comment above for why this is
    // different from a floater.
    const survivingIds = new Set(newNodes.map(n => n.id))
    const anyWeightPool: Edge[] = rawEdgesAnyWeight.filter(
      e => filteredNodeIds.has(e.source as number) && filteredNodeIds.has(e.target as number)
    )
    const rescued = rescueDroppedNodes(allSampledPositioned, survivingIds, anyWeightPool)
    newNodes = [...newNodes, ...rescued.nodes]
    newEdges = [...newEdges, ...rescued.edges]

    activeNodesRef.current = newNodes
    activeEdgesRef.current = newEdges

    const nodeById = new Map(newNodes.map(n => [n.id, n]))
    newEdges = newEdges.map(e => ({
      ...e,
      source: nodeById.get(typeof e.source === 'number' ? e.source : (e.source as Node).id) ?? e.source,
      target: nodeById.get(typeof e.target === 'number' ? e.target : (e.target as Node).id) ?? e.target,
    }))

    if (simulationRef.current) simulationRef.current.stop()

    // History: this started as a copy of GraphSection68's physics, then
    // went through several rounds of compensating distanceMax/charge/a
    // link-strength floor for what looked like sparser 9-12 data. That
    // diagnosis was wrong — see the MIN_EDGE_WEIGHT and CHARGE_STRENGTH
    // comments above for what the real issue was (a link-strength floor
    // uniforming 94-98% of edges to identical stiffness, not data
    // sparsity) and why those two are now fixed rather than compensated
    // around. distanceMax stays at 340 (between 68's 300 and this
    // section's earlier pushed-further value) and forceX/forceY/collision
    // below are unchanged from before that fix.
    // The link-strength floor here (Math.max(0.22, ...)) was added when
    // grades 10-12 used MIN_EDGE_WEIGHT=1, to rescue weight-1 ties from a
    // weak 0.06 raw strength. Now that MIN_EDGE_WEIGHT=2 everywhere, every
    // included edge's raw strength is already >=0.12, so that floor no
    // longer rescues anything — measured against the real data, it was
    // instead forcing 94-98% of edges in EVERY grade (9 through 12) to the
    // exact same strength regardless of their actual weight. A spring
    // network where nearly every spring has identical stiffness is what
    // was producing the grid/lattice look: grade 9's weaker charge (-75)
    // let that uniform mesh snap into a visible lattice, while 10-12's
    // stronger charge (-115) just spread the same rigid, undifferentiated
    // mesh into diffuse, evenly-spaced sparseness instead — neither was
    // forming real organic clusters, the springs just couldn't
    // differentiate. Removing the floor (matching GraphSection68's
    // uncapped `weight * 0.06`) lets genuine multi-class ties pull
    // tighter into visible, denser clusters while single-class ties stay
    // loose, for all four grades at once — no data or edge-count change,
    // so no load-time impact.
    const simulation = d3.forceSimulation<Node>(newNodes)
      .force('link', d3.forceLink<Node, Edge>(newEdges).id(d => d.id)
        .distance(d => Math.max(15, 80 - ((d as unknown as Edge).weight * 5)))
        .strength(d => Math.min(1, (d as unknown as Edge).weight * 0.06)))
      .force('charge', d3.forceManyBody().strength(CHARGE_STRENGTH[currentStep] ?? -75).distanceMax(340))
      .force('center', d3.forceCenter(cx, cy))
      // Was a single shared target (cx) for every node — pure confinement,
      // no clustering effect of its own; all the actual cluster-forming
      // work was left to the link forces. That's fine for grade 9, whose
      // edges are 100% real weight>=2 structural ties, but grades 11/12
      // now lean heavily on rescueDroppedNodes (see that comment) to reach
      // comparable node/edge density — 37% of grade 11's edges and 65% of
      // grade 12's are real-but-weak weight~1 rescue ties, pulling at
      // roughly half the strength (~0.06) of a structural edge (~0.13).
      // Similar edge COUNT, much weaker average pull, so the same-group
      // clustering the link forces alone can maintain is measurably weaker
      // for those two grades even though the underlying group signal in
      // the real data is comparable across all four grades (checked via
      // modularity on the raw, unsampled network: 0.014-0.036 across
      // grades 9-12, all a similar order of magnitude — grade 9 isn't
      // actually a stronger data signal, it just doesn't need help
      // expressing it). Splitting the x-target by group gives a
      // continuous, gentle nudge toward the correct side that doesn't
      // depend on how many of a node's edges are weak — same mechanism as
      // the cold-start position seed above, just sustained through the
      // whole simulation instead of only the first frame.
      // offset/strength raised from 70/0.028 to 140/0.06 after running the
      // actual force math headlessly (can't render a browser here, but
      // this replicates d3-force's algorithm against the real per-grade
      // data) to check how separated the two groups actually end up, not
      // just whether they're biased in the right direction. 70/0.028 gave
      // a separation-to-within-group-spread ratio of only ~0.9-1.1 for all
      // four grades — the two group centers were measurably apart, but at
      // that ratio the two clouds still mostly overlap visually (roughly
      // one std of spread vs one std of separation). 140/0.06 gets that
      // ratio to ~3.1-3.7 across grades 9-12 uniformly, which is where two
      // groups actually stop reading as one blurry cloud. Checked this
      // doesn't overpower the organic link-driven substructure into two
      // rigid balls: it only pulls the x-target, nodes still have full
      // freedom on y and within their own side, so real link topology
      // still determines sub-clustering — this just makes the two
      // top-level groups unambiguous.
      .force('x', d3.forceX((d: Node) => cx + (isHighGroup912(d, mode) ? -140 : 140)).strength(0.06))
      .force('y', d3.forceY(cy).strength(0.028))
      .force('collision', d3.forceCollide().radius(13))
      // Faster than GraphSection/GraphSection45/68's shared 0.0228 default —
      // this only changes how many ticks it takes to cool down to the same
      // equilibrium layout the forces above define, not the layout itself,
      // so it settles noticeably quicker without changing the final shape
      // or requiring any other visual/aesthetic tradeoff.
      .alphaDecay(isMobile ? 0.07 : 0.04)

    simulationRef.current = simulation

    const padding = isMobile ? 30 : 80
    // Reverted the zoom cap — see the identical comment in GraphSection45.
    const zoomTimer = autoZoom(g, width, height, padding)

    simulation.on('tick', () => {
      linkG.selectAll<SVGLineElement, Edge>('line')
        .attr('x1', d => (d.source as Node).x ?? 0).attr('y1', d => (d.source as Node).y ?? 0)
        .attr('x2', d => (d.target as Node).x ?? 0).attr('y2', d => (d.target as Node).y ?? 0)
      nodeG.selectAll<SVGCircleElement, Node>('circle').attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0)
      nodeG.selectAll<SVGImageElement, Node>('image')
        .attr('x', d => (d.x ?? 0) - FACE_SIZE / 2).attr('y', d => (d.y ?? 0) - FACE_SIZE / 2)
    })

    linkG.selectAll<SVGLineElement, Edge>('line').data(newEdges)
      .join(
        enter => enter.append('line')
          .attr('stroke', d => getEdgeColor912(d, mode))
          .attr('stroke-width', 1)
          .attr('stroke-opacity', 0)
          // Matches applyHoverHighlight's own resting (no-hover) value of
          // 0.4 directly, rather than fading in to a different value (0.2)
          // and relying on the separate hover-highlight effect to correct
          // it afterward. That correction effect only re-runs when
          // hoveredNode or currentStep actually change — for the very
          // first step's initial load (grade 9), the async data fetch
          // finishing doesn't trigger either, so edges were staying stuck
          // at the mismatched 0.2 until an actual hover forced a re-run.
          // Matching the values here removes the mismatch regardless of
          // effect timing.
          .transition().duration(600).attr('stroke-opacity', 0.4),
        update => update
          .transition().duration(300).attr('stroke', d => getEdgeColor912(d, mode)),
        exit => exit.transition().duration(300).attr('stroke-opacity', 0).remove()
      )

    const nonProtags = newNodes.filter(n => !isProtagonist912(n.id, highId, lowId))
    const protags = newNodes.filter(n => isProtagonist912(n.id, highId, lowId))

    nodeG.selectAll<SVGCircleElement, Node>('circle').data(nonProtags, d => d.id)
      .join(
        enter => enter.append('circle')
          .attr('cx', d => d.x ?? cx).attr('cy', d => d.y ?? cy).attr('r', 6)
          .attr('fill', d => getNodeColor912(d, mode, highId, lowId))
          .attr('stroke', 'white').attr('stroke-width', 0.8)
          .attr('cursor', 'pointer').attr('opacity', 0)
          .transition().duration(500).attr('opacity', 1),
        update => update.attr('fill', d => getNodeColor912(d, mode, highId, lowId)),
        exit => exit.transition().duration(300).attr('opacity', 0).remove()
      )

    nodeG.selectAll<SVGImageElement, Node>('image').data(protags, d => d.id)
      .join(
        enter => enter.append('image')
          .attr('href', d => getFaceSrc912(d, mode, highId))
          .attr('width', FACE_SIZE).attr('height', FACE_SIZE)
          .attr('x', d => (d.x ?? cx) - FACE_SIZE / 2)
          .attr('y', d => (d.y ?? cy) - FACE_SIZE / 2)
          .attr('cursor', 'pointer').attr('opacity', 0)
          .transition().duration(500).attr('opacity', 1),
        update => update.attr('href', d => getFaceSrc912(d, mode, highId)),
        exit => exit.remove()
      )

    setupNodeInteractions(nodeG, simulation, mode)
    return () => {
      simulation.stop()
      clearTimeout(zoomTimer)
      tooltipRef.current?.style('opacity', 0)
    }
  }, [currentStep, allGraphData, graphSize, mode, isMobile])

  const renderNoticeContent = () => {
    const target = getNoticeTarget(currentStep)
    if (!noticeText) return null
    return (
      <>
        {noticeText}
        {noticeText.length < target.length && (
          <span style={{ borderRight: '2px solid #111', marginLeft: '1px' }} />
        )}
      </>
    )
  }

  return (
    <div id="graph-912" style={{ height: isMobile ? '100svh' : `${STEPS.length * 100}vh`, position: 'relative', flexShrink: 0, width: '100%', marginTop: isMobile ? '2vh' : 0 }}>
      <div
        ref={sectionRef}
        style={{
          position: isMobile ? 'relative' : 'sticky',
          top: 0,
          width: '100%',
          height: isMobile ? '100svh' : '100vh',
          backgroundColor: 'var(--color-bg)',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          overflow: 'hidden',
          ...(isMobile ? { overflowAnchor: 'none' as const } : {}),
        }}
      >

        {/* left panel */}
        <div style={{ width: isMobile ? '100%' : '28%', height: isMobile ? 'auto' : '100%', display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'center' : 'flex-start', justifyContent: 'flex-start', padding: isMobile ? '2.75rem 1.5rem 0.5rem 1.5rem' : '7.5rem 2rem 3rem 3rem', flexShrink: 0, gap: '1.5rem', position: 'relative' }}>
          {!isMobile && (
            <div style={{ height: '9rem', display: 'flex', alignItems: 'flex-start', position: 'absolute', top: '7.5rem', left: '3rem', right: '2rem', overflow: 'visible' }}>
              {noticeText && (
                <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(1rem, 1.8vw, 1.4rem)', color: '#111', lineHeight: 1.6, margin: 0 }}>
                  {renderNoticeContent()}
                </p>
              )}
            </div>
          )}
          {/* Label + dots + NodeStats: bottom-anchored as their own group,
              fully decoupled from the notice text above. */}
          {!isMobile && (
            <div style={{ position: 'absolute', top: '28rem', left: '3rem', right: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <AnimatePresence mode="wait">
                <motion.p key={currentStep}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                  style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(1rem, 2vw, 1.6rem)', color: '#111', lineHeight: 1.6, margin: 0 }}
                >
                  {STEPS[currentStep].label}
                </motion.p>
              </AnimatePresence>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {STEPS.map((_, i) => (
                  <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: i === currentStep ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                ))}
              </div>
              <NodeStats nodes={fullPopulationRef.current} mode={mode} visible={true} mobile={false} />
            </div>
          )}
          {isMobile && (
            <AnimatePresence mode="wait">
              <motion.p key={currentStep}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
                style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.9rem, 3.5vw, 1.1rem)', color: '#111', lineHeight: 1.6, margin: 0, textAlign: 'center' }}
              >
                {STEPS[currentStep].label}
              </motion.p>
            </AnimatePresence>
          )}
        </div>

        {/* graph panel */}
        <div
          ref={graphPanelRef}
          onClick={(e) => {
            if (!isMobile) return
            const target = e.target as Element
            if (target.tagName === 'circle' || target.tagName === 'image') {
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
            <div style={{ position: 'absolute', top: '2.2rem', left: '10%', right: '10%', zIndex: 5, padding: '0.6rem 1rem', backgroundColor: 'rgba(250,249,246,0.92)', borderRadius: '8px' }}>
              <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.6rem, 2.5vw, 0.75rem)', color: '#111', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
                {renderNoticeContent()}
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
              <NodeStats nodes={fullPopulationRef.current} mode={mode} visible={true} mobile={true} />
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