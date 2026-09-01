import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { motion, AnimatePresence, useScroll, useMotionValue } from 'framer-motion'
import { useGraphSection } from '../hooks/useGraphSection'
import NodeStats from './NodeStats'
import type { Mode } from '../App'
import type { Node, Edge, GraphData } from './graphTypes'
import { applyHoverHighlight, getTooltipHtml } from './graphUtils'

const FACE_SIZE = 25

// White faux-border behind protagonist face svgs, matching
// GraphSection68/GraphSectionElementary's convention — a solid circle
// rendered behind each protagonist's face image, since <image> elements
// can't take a stroke directly. Face sizes themselves are untouched.
const BORDER_RATIO = 0.51

// Step 0 is a new dialogue phase (mirrors GraphSection68's own pre-grade-6
// dialogue step) — four lines instead of three, alternating high/low.
const DIALOGUE = [
  { node: 'high', text: "I feel like I never see you anymore.", delay: 0 },
  { node: 'low', text: "I know, it's like we don't even go to the same school.", delay: 1150 },
  { node: 'high', text: "Yeah. Are you at least free after school?", delay: 2300 },
  { node: 'low', text: "Sorry, I'm too busy.", delay: 3450 },
]

// Steps 1-4 are grades 9-12 (shifted from their old 0-3 indices to make
// room for the dialogue phase at step 0).
const STEPS = [
  { label: '' },
  { label: 'All students in grade 9.' },
  { label: 'All students in grade 10.' },
  { label: 'All students in grade 11.' },
  { label: 'All students in grade 12.' },
]

// Only two of the four grade steps get a persistent explanatory sentence;
// the other two show whichever earlier step's sentence is nearest,
// walking backward — grade 10 (no sentence of its own) always resolves to
// grade 9's, grade 12 always resolves to grade 11's, regardless of
// whether the user scrolled there forward or backward. That's a pure
// function of currentStep alone, not of scroll history — a previous
// version instead left whatever notice was CURRENTLY DISPLAYED alone
// whenever the new step had no sentence of its own, which meant scrolling
// backward from grade 12 through grade 11 (own sentence) to grade 10
// incorrectly kept showing grade 11's sentence instead of falling back to
// grade 9's, since "leave it alone" only ever looked at what had just
// been on screen, not at which step actually precedes the current one.
// Keys shifted by +1 to match STEPS' new indices (grade 9 is now step 1,
// grade 11 is now step 3).
const STEP_NOTICES: Record<number, string> = {
  1: "This is what a high school with high levels of course tracking/segregation looks like.",
  3: "By senior year, upperclassmen take fewer, scattered classes. Networks may look thinner, but segregation isn't necessarily lessened.",
}
const getNoticeTarget = (step: number): string => {
  for (let s = step; s >= 1; s--) {
    if (STEP_NOTICES[s] !== undefined) return STEP_NOTICES[s]
  }
  return ''
}

// Real per-grade course-sharing data at this school doesn't preserve a
// single student id across all four years the way the original K-8 dataset
// does — each grade's export re-indexes students 0..N-1 independently
// (checked: of the ids numerically common to all four files, only a small
// handful have matching ses+race in every grade — consistent with random
// coincidence, not real continuity). So, same as GraphSection68's
// comparison-school steps, these are representative composite
// protagonists: a real specific student picked PER GRADE (not the same
// physical person year to year), chosen so (a) their ses/race attributes
// genuinely match "high"/"low" in both mode dimensions simultaneously, (b)
// they share zero classes with their counterpart that year — so the
// "two dots never share a class again" throughline from Section03Part2
// holds every year by construction, even though which real student sits in
// the "high"/"low" seat changes yearly — and (c) each has a comparatively
// high degree among eligible candidates, so they land somewhere visually
// central rather than as a stray dot at the graph's edge.
const PROTAGONIST_IDS: Record<number, { high: number; low: number }> = {
  1: { high: 349, low: 52 },  // grade 9
  2: { high: 214, low: 261 }, // grade 10
  3: { high: 57, low: 70 },   // grade 11
  4: { high: 22, low: 106 },  // grade 12
}

const isProtagonist912 = (id: number, highId: number, lowId: number) =>
  id === highId || id === lowId

const getNodeColor912 = (d: Node, mode: Mode, highId: number, lowId: number): string => {
  if (d.id === highId) return mode === 'race' ? '#FF9260' : '#FF8BDE'
  if (d.id === lowId) return mode === 'race' ? '#8BA4FF' : '#22D880'
  if (mode === 'race') return d.race_ethnicity === 'white_asian' ? '#FF9260' : '#8BA4FF'
  return d.ses === 'higher' ? '#FF8BDE' : '#22D880'
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

// Fixed placeholder ids for the dialogue phase's two dummy protagonist
// nodes — there's no real grade data at step 0, so these don't correspond
// to any actual student, just a "high"/"low" role for coloring purposes.
// getFaceSrc912(d, mode, highId) already resolves correctly for these once
// highId is set to DIALOGUE_HIGH_ID in the dialogue branch below, since
// these dummy nodes' own ids match it — no separate face-src helper needed.
const DIALOGUE_HIGH_ID = -1
const DIALOGUE_LOW_ID = -2

// Same reasoning as GraphSection68's getAltEdgeColor: colors each edge by
// its source node's group so the pink/green (or orange/blue) boundary
// reads clearly, rather than a flat grey.
const getEdgeColor912 = (d: Edge, mode: Mode): string => {
  const src = d.source as unknown as Node
  if (mode === 'race') return src.race_ethnicity === 'white_asian' ? '#FF9260' : '#8BA4FF'
  return src.ses === 'higher' ? '#FF8BDE' : '#22D880'
}

// This school's filteredFullNodes population (378/334/365/284 across
// grades 9-12) runs noticeably denser than the original school's — at the
// same >=2 weight threshold below, its raw per-node density comes out to
// roughly 25/17.5/12/8 edges/node for grades 9-12 respectively, versus this
// section's previous ~8-8.7 target range. Deliberately NOT forcing that
// match here: density scales close to linearly with sampling fraction, so
// hitting ~8.5 for grade 9 would mean sampling down to roughly a third of
// its population (378 -> ~125) — a much bigger cut than trimming for
// render performance, and it would erase what's actually a cleaner, more
// dramatic version of this section's own "pathways diverge, density drops
// each year" story than the original school showed. So MIN_EDGE_WEIGHT
// stays untouched below (still >=2 uniformly).
//
// A small, deliberately modest trim off the full filtered population above
// — enough to meaningfully shrink the synchronous pipeline cost (every
// stage after sampling scales with however many nodes come out of it),
// without visibly thinning out the graph the way a bigger cut would. This
// exists specifically to build in more margin against grade 9's
// scroll-lock window, on the theory that occasional desktop skipping
// wasn't fully solved by lock-duration tuning alone — some of it may
// simply be the pipeline itself occasionally running long on a loaded or
// lower-power desktop machine.
const DESKTOP_NODE_SAMPLE_CAP: Record<number, number> = {
  1: 310,
  2: 325,
  3: 350,
  4: 284,
}

// Mobile CPUs are meaningfully weaker than desktop, and the full pipeline
// (filter, sample, pruneLowDegree's iterative cascade, keepLargestComponent's
// BFS, rescueDroppedNodes, then creating a DOM element per surviving node)
// all runs synchronously in one block on whichever grade is being built.
// On desktop that's fast enough not to matter much; on mobile, at the
// full desktop node counts, it was blocking the main thread long enough
// that no touch input — including the page's own scroll — could be
// processed at all, reading as a total freeze rather than just jank.
// Pulled back up from an earlier, more aggressive cut that read as
// visibly sparse — this is a lighter trim, trading off some of that
// safety margin for a denser-looking graph, on the assumption phones can
// handle more than that first pass assumed. sampleNodes' own stratified-
// by-group sampling still preserves the same relative cluster proportions
// at any of these sizes — this only changes how many dots are on screen,
// not the story the clusters tell.
const MOBILE_NODE_SAMPLE_CAP: Record<number, number> = {
  1: 225,
  2: 235,
  3: 250,
  4: 240,
}
const getNodeSampleCap = (step: number, isMobile: boolean) =>
  (isMobile ? MOBILE_NODE_SAMPLE_CAP : DESKTOP_NODE_SAMPLE_CAP)[step] ?? (isMobile ? 175 : 280)

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
// ends up reading as too sparse visually, compensate via
// DESKTOP_NODE_SAMPLE_CAP/MOBILE_NODE_SAMPLE_CAP (more nodes) rather than
// lowering this threshold again.
//
// Re-checked against this school's data specifically: >=1 would pull raw
// per-node density up to ~45-105 (see the sample-cap comments above) —
// >=2's own ~8-25 range is already the thinnest usable threshold here, so
// the same >=2-not->=1 call still holds, if anything more strongly than it
// did for the original school.
const MIN_EDGE_WEIGHT: Record<number, number> = {
  1: 2,
  2: 2,
  3: 2,
  4: 2,
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
  1: -90,
  2: -90,
  3: -90,
  4: -90,
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
  // Build a per-node adjacency index once (O(edges)) instead of the
  // previous approach, which re-scanned the ENTIRE anyWeightPool array for
  // every single dropped node (O(droppedNodes * edges) — for grade 9's
  // raw edge pool, easily hundreds of thousands of comparisons on every
  // render of this step, all synchronous/blocking). Same output either
  // way — this only changes how it's computed, not what gets rescued.
  const tiesByNode = new Map<number, Edge[]>()
  for (const e of anyWeightPool) {
    const s = e.source as number, t = e.target as number
    if (!tiesByNode.has(s)) tiesByNode.set(s, [])
    if (!tiesByNode.has(t)) tiesByNode.set(t, [])
    tiesByNode.get(s)!.push(e)
    tiesByNode.get(t)!.push(e)
  }

  const rescuedNodes: Node[] = []
  const rescuedEdges: Edge[] = []
  for (const n of sampledNodes) {
    if (survivingIds.has(n.id)) continue
    const candidates = tiesByNode.get(n.id) ?? []
    const ties = candidates.filter(e => {
      const s = e.source as number, t = e.target as number
      const other = s === n.id ? t : s
      return survivingIds.has(other)
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
  // The full population's own real edges (weight-filtered, but never
  // restricted by sampling) — separate from activeEdgesRef, which only
  // ever reflects whichever subset actually got sampled/rendered. Passed
  // to NodeStats alongside fullPopulationRef below so its % stats are
  // computed from real, matching node/edge data regardless of how many
  // nodes actually made it onto screen — see that prop's own comment for
  // why pairing the full population with only the sampled subset's edges
  // was producing wildly inflated isolation percentages.
  const fullEdgesRef = useRef<Edge[]>([])

  // Holds grade 9's ENTIRE finished node/edge set (post sample, prune,
  // largest-component, rescue — with converged x/y baked in) once the
  // background pre-warm below completes. Previously this only cached a
  // position lookup by node id, and the main render effect independently
  // re-ran sampleNodes for its own actual render — since sampleNodes uses
  // unseeded Math.random(), those two independent samples of 378 nodes
  // down to a 320 cap almost never matched, especially after each one
  // then went through its own independent degree-prune/largest-component
  // pass on top of already-divergent inputs. That mismatch meant most
  // position lookups missed, "well warmed" rarely triggered, and the
  // whole pre-warm effort was wasted more often than not — the actual
  // cause of grade 9 intermittently taking a genuinely long cold-start
  // convergence and then having the fixed-duration scroll-lock (see
  // blockScrollForward above) expire before it finished, letting
  // already-queued scroll input jump straight to grade 10. Caching the
  // whole finished set and having the main effect reuse it directly
  // (see the step-1 branch below) guarantees an exact match whenever the
  // pre-warm finished in time, instead of a partial, further-degraded
  // overlap.
  const preWarmedGrade9Ref = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null)
  // True once grade 9 has actually rendered at least once this session —
  // the cached pre-warm data above should only ever be used for the
  // genuine first visit; a revisit already has its own real converged
  // positions available via activeNodesRef/existingById, which is a
  // better source than a pre-warm snapshot from earlier.
  const hasRenderedGrade9Ref = useRef(false)

  // Bumped on click to skip whatever typing animation is currently
  // running — the notice text (handled directly in the click handler
  // below) and NodeStats' own entrance sequence (via its skipSignal prop).
  // Harmless to bump even when nothing is typing.
  const [skipTypingSignal, setSkipTypingSignal] = useState(0)

  // Guards against scrolling straight past a step before its render has
  // actually painted, same purpose as GraphSection68's altStepEnteredAtRef
  // — every step here is comparably heavy (real per-grade data), so the
  // buffer applies to all of them rather than just specific ones.
  const stepEnteredAtRef = useRef(0)

  // Unlike GraphSection68 (where step 0 is a dialogue phase that only ever
  // plays once actually scrolled into view, via IntersectionObserver/
  // scroll-position checks), this section has no such gate on its own step
  // 0 — currentStep starts at 0 from the moment the whole page mounts
  // (every section mounts up front, not on-demand), so without this, the
  // notice-typing effect below fires immediately at page load and finishes
  // typing in the background long before the user actually scrolls this
  // far down — by the time they arrive, everything already looks "done."
  // This mirrors GraphSection68's own entry-detection exactly, just
  // generalized to fire once regardless of which step is current.
  const hasEnteredSectionRef = useRef(false)
  const [hasEnteredSection, setHasEnteredSection] = useState(false)

  // Step 0 dialogue state — see DIALOGUE above. No separate scroll freeze
  // for it (per feedback on GraphSection68/GraphSectionElementary's own
  // dialogue steps) — it just plays once hasEnteredSection fires below,
  // and can be skipped via click/tap same as everything else here.
  const [visibleBubbles, setVisibleBubbles] = useState<boolean[]>([false, false, false, false])
  const [bubbleTexts, setBubbleTexts] = useState<string[]>(['', '', '', ''])
  const [dialogueDone, setDialogueDone] = useState(false)
  const dialogueTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const hasPlayedDialogue = useRef(false)

  const {
    currentStep, setCurrentStep, hoveredNode, setHoveredNode, graphSize,
    sectionRef, svgRef, graphPanelRef, simulationRef,
    activeNodesRef, activeEdgesRef, tooltipRef,
    isMobile, setupNodeInteractions, autoZoom,
  } = useGraphSection({
    steps: STEPS,
    // Grade 9 gets a plain, generous, unconditional duration — not tied
    // to simulation alpha or cache-hit status. An alpha-based "wait for
    // actual convergence" version was tried here, but d3's alpha decays
    // on a fixed tick-count schedule (governed by alphaDecay) regardless
    // of how close positions already are to equilibrium — so even a
    // perfectly pre-warmed simulation still takes the same ~70-100+ ticks
    // to cross a low alpha threshold as a genuine cold start. That means
    // the alpha check wasn't actually unblocking any faster in the
    // common case, just adding a ref that has to be correctly reset and
    // flipped inside a tick closure — more that could go quietly wrong
    // for no real benefit. A flat, generous duration is blunter but far
    // more predictable, which matters more here than shaving off
    // milliseconds: this is the one thing that must not fail. Bumped
    // from 2800 to 3300 — that alone wasn't enough margin on its own, so
    // this is paired with DESKTOP_NODE_SAMPLE_CAP's modest pipeline-cost
    // trim above, rather than trying to fix it with duration alone.
    blockScrollForward: () => {
      if (currentStep === 1) {
        return Date.now() - stepEnteredAtRef.current < 3300
      }
      return Date.now() - stepEnteredAtRef.current < 900
    },
  })

  // Mobile-only: the main graph effect below waits for this to catch up
  // to currentStep before actually building anything. Grade 9-12's build
  // (filter/sample/prune/largest-component/rescue, then creating a DOM
  // element per surviving node) runs synchronously in one block — on
  // mobile's much weaker CPUs that can be long enough to block the main
  // thread, which also blocks touch/scroll input processing entirely,
  // reading as the page being totally unresponsive rather than just
  // janky. Deferring the actual build by one animation frame means
  // whatever gesture (a tap to navigate, or the scroll that landed here)
  // triggered this at least gets acknowledged and painted first, instead
  // of being swallowed by a block that starts in the very same tick.
  // Desktop skips this entirely — its own pipeline is fast enough that
  // this hasn't been a problem there, and this doesn't touch how many
  // nodes get sampled/rendered, only when the (mobile-only) build starts.
  const [deferredStep, setDeferredStep] = useState(currentStep)
  useEffect(() => {
    if (!isMobile) {
      setDeferredStep(currentStep)
      return
    }
    const rafId = requestAnimationFrame(() => setDeferredStep(currentStep))
    return () => cancelAnimationFrame(rafId)
  }, [currentStep, isMobile])

  // Graph-paper background — same convention as GraphSection68/
  // GraphSectionElementary: fades in as the user approaches (entry), fades
  // out approaching the end of the section (exit). This section didn't
  // have this background at all before this pass.
  const outerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress: entryProgress } = useScroll({
    target: outerRef,
    offset: ["start end", "start start"],
  })
  const { scrollYProgress: exitProgress } = useScroll({
    target: outerRef,
    offset: ["end end", "end start"],
  })
  const bgOpacity = useMotionValue(0)
  const [isVisuallyActive, setIsVisuallyActive] = useState(false)

  useEffect(() => {
    return entryProgress.on('change', (v) => {
      const amt = Math.min(1, Math.max(0, (v - 0.15) / 0.85))
      bgOpacity.set(amt)
      setIsVisuallyActive(amt > 0.3)
    })
  }, [entryProgress])

  useEffect(() => {
    return exitProgress.on('change', (v) => {
      if (v <= 0) return
      const fadeOutAmount = Math.min(1, v / 0.5)
      bgOpacity.set(1 - fadeOutAmount)
      setIsVisuallyActive(fadeOutAmount < 0.3)
    })
  }, [exitProgress])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('graphSectionActive', { detail: { id: 'graph-912', active: isVisuallyActive } }))
    return () => {
      window.dispatchEvent(new CustomEvent('graphSectionActive', { detail: { id: 'graph-912', active: false } }))
    }
  }, [isVisuallyActive])

  useEffect(() => {
    if (hasEnteredSectionRef.current || !sectionRef.current) return
    const markEntered = () => {
      if (hasEnteredSectionRef.current) return
      hasEnteredSectionRef.current = true
      setHasEnteredSection(true)
    }
    if (isMobile) {
      const observer = new IntersectionObserver((entries) => {
        if (entries[0]?.isIntersecting) {
          observer.disconnect()
          markEntered()
        }
      }, { threshold: 0.5 })
      observer.observe(sectionRef.current)
      return () => observer.disconnect()
    } else {
      const tryMark = () => {
        if (hasEnteredSectionRef.current || !sectionRef.current) return
        const rect = sectionRef.current.getBoundingClientRect()
        if (rect.top <= 10 && rect.top >= -10) {
          window.removeEventListener('scroll', tryMark)
          markEntered()
        }
      }
      tryMark()
      window.addEventListener('scroll', tryMark, { passive: true })
      return () => window.removeEventListener('scroll', tryMark)
    }
  }, [isMobile])

  // Step 0 dialogue playback — resets whenever the user navigates away
  // from step 0, replays whenever they return to it, same as
  // GraphSection68's own dialogue step. hasEnteredSection (already used
  // below for the notice text) gates the very first play so it doesn't
  // fire before the section has actually been scrolled into view.
  useEffect(() => {
    if (currentStep !== 0) {
      hasPlayedDialogue.current = false
      setVisibleBubbles([false, false, false, false])
      setBubbleTexts(['', '', '', ''])
      setDialogueDone(false)
      dialogueTimers.current.forEach(t => clearTimeout(t))
      return
    }
    if (!hasEnteredSection || hasPlayedDialogue.current) return
    hasPlayedDialogue.current = true
    DIALOGUE.forEach((d, i) => {
      const t = setTimeout(() => {
        setVisibleBubbles(prev => { const next = [...prev]; next[i] = true; return next })
        setBubbleTexts(prev => { const next = [...prev]; next[i] = d.text; return next })
        if (i === DIALOGUE.length - 1) setDialogueDone(true)
      }, d.delay + 300)
      dialogueTimers.current.push(t)
    })
    return () => {
      dialogueTimers.current.forEach(t => clearTimeout(t))
    }
  }, [currentStep, hasEnteredSection])


  // Only bumped by Conclusion's bottom-of-page toggle (a deliberate full
  // restart), never by a plain mode change — see the comment on
  // graphResetSignal in App.tsx.
  const isFirstResetRender = useRef(true)
  useEffect(() => {
    if (isFirstResetRender.current) { isFirstResetRender.current = false; return }
    setCurrentStep(0)
  }, [resetSignal, setCurrentStep])

  // Nav-jumping here should always start at step 0, not resume wherever
  // this section was last left off — see App.tsx's skipAnimationsUpTo,
  // which dispatches this scoped to whichever section id was actually
  // clicked (not graphResetSignal, which would reset every graph section
  // at once regardless of destination).
  useEffect(() => {
    const handler = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail
      if (id === 'graph-912') setCurrentStep(0)
    }
    window.addEventListener('navResetGraphStep', handler)
    return () => window.removeEventListener('navResetGraphStep', handler)
  }, [setCurrentStep])

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

  // Background pre-warm for grade 9 specifically — the step right after
  // the dialogue, so unlike grades 10-12 (which always benefit from
  // whatever positions the PREVIOUS grade converged to, carried over via
  // existingById), grade 9's very first visit has nothing to carry over
  // from and must start completely cold. That's the actual cause of "fine
  // on revisit, glitchy only the first time" — revisits reuse an
  // already-converged layout, so they need very few ticks; the first
  // visit needs the full run, starting from scratch, right at the moment
  // the user is scrolling in.
  //
  // This runs the exact same data pipeline (sampleNodes, pruneLowDegree,
  // keepLargestComponent, rescueDroppedNodes — all shared, pure functions,
  // not reimplemented here) and an identical-force simulation, but
  // headless: stopped immediately after creation and ticked manually in a
  // synchronous loop instead of via the DOM/animation-frame loop the real
  // one uses, so nothing is rendered and no SVG elements exist for it.
  // Scheduled with a short, fixed setTimeout rather than
  // requestIdleCallback — this app has a NavBar that can jump straight to
  // this section, reaching grade 9 within a couple seconds of page load,
  // well before an idle callback (which only fires once the browser
  // genuinely has spare cycles, or after its own timeout) can be relied on
  // to have completed. A fixed short defer runs shortly after the initial
  // render commits, finishing well within a second on realistic node
  // counts — reliably before any plausible path to grade 9, whether via
  // scrolling or a direct nav jump.
  const hasPreWarmedRef = useRef(false)
  useEffect(() => {
    if (hasPreWarmedRef.current) return
    if (!allGraphData[0] || graphSize.width === 0) return
    // Mobile skips the pre-warm entirely — this is the one mechanism this
    // section has that GraphSection68 (which behaves reliably on mobile)
    // simply never needed at all. Even chunked across frames, it's still
    // real background CPU work 68 never has to spend. Mobile's actual
    // build already has its own separate protections (a smaller
    // MOBILE_NODE_SAMPLE_CAP and the one-frame deferredStep defer below),
    // which reduce how much a head-start cache is even needed here in the
    // first place — skipping this extra background load on mobile brings
    // this section structurally closer to how 68 behaves there, rather
    // than just matching its touch-handling CSS.
    if (isMobile) return
    hasPreWarmedRef.current = true

    const run = () => {
      const { width, height } = graphSize
      const cx = width / 2, cy = height / 2
      const highId = PROTAGONIST_IDS[1].high
      const lowId = PROTAGONIST_IDS[1].low

      const data = allGraphData[0]!
      const filteredFullNodes = data.nodes
        .filter(n => n.courses && !n.courses.toLowerCase().includes('non-reporting'))
        .filter(n => n.courses.split(',').map(c => c.trim()).filter(Boolean).length > 1)

      const nodesToUse = sampleNodes(filteredFullNodes, getNodeSampleCap(1, isMobile), highId, lowId)
      let warmNodes: Node[] = nodesToUse.map(n => {
        const groupOffset = isHighGroup912(n, mode) ? -140 : 140
        return { ...n, x: cx + groupOffset + (Math.random() - 0.5) * 70, y: cy + (Math.random() - 0.5) * 70 }
      })
      const allSampledPositioned = warmNodes
      const filteredNodeIds = new Set(warmNodes.map(n => n.id))
      const minWeight = MIN_EDGE_WEIGHT[1] ?? 2
      const rawEdgesAnyWeight: Edge[] = data.edges.map(e => ({ ...e }))
      const rawEdges: Edge[] = rawEdgesAnyWeight
        .filter(e => e.weight >= minWeight)
        .filter(e => filteredNodeIds.has(e.source as number) && filteredNodeIds.has(e.target as number))

      const pruned = pruneLowDegree(warmNodes, rawEdges, highId, lowId, 4)
      warmNodes = pruned.nodes
      let warmEdges: Edge[] = pruned.edges

      const largestComponent = keepLargestComponent(warmNodes, warmEdges, highId, lowId)
      warmNodes = largestComponent.nodes
      warmEdges = largestComponent.edges

      const survivingIds = new Set(warmNodes.map(n => n.id))
      const anyWeightPool: Edge[] = rawEdgesAnyWeight.filter(
        e => filteredNodeIds.has(e.source as number) && filteredNodeIds.has(e.target as number)
      )
      const rescued = rescueDroppedNodes(allSampledPositioned, survivingIds, anyWeightPool)
      warmNodes = [...warmNodes, ...rescued.nodes]
      warmEdges = [...warmEdges, ...rescued.edges]

      const nodeById = new Map(warmNodes.map(n => [n.id, n]))
      warmEdges = warmEdges.map(e => ({
        ...e,
        source: nodeById.get(typeof e.source === 'number' ? e.source : (e.source as Node).id) ?? e.source,
        target: nodeById.get(typeof e.target === 'number' ? e.target : (e.target as Node).id) ?? e.target,
      }))

      const simulation = d3.forceSimulation<Node>(warmNodes)
        .force('link', d3.forceLink<Node, Edge>(warmEdges).id(d => d.id)
          .distance(d => Math.max(15, 80 - ((d as unknown as Edge).weight * 5)))
          .strength(d => Math.min(1, (d as unknown as Edge).weight * 0.06)))
        .force('charge', d3.forceManyBody().strength(CHARGE_STRENGTH[1] ?? -75).distanceMax(340))
        .force('center', d3.forceCenter(cx, cy))
        .force('x', d3.forceX((d: Node) => cx + (isHighGroup912(d, mode) ? -140 : 140)).strength(0.06))
        .force('y', d3.forceY(cy).strength(0.028))
        .force('protagonistX', d3.forceX((d: Node) => d.id === highId ? cx - width * 0.32 : cx + width * 0.32)
          .strength((d: Node) => (d.id === highId || d.id === lowId) ? 0.4 : 0))
        .force('protagonistY', d3.forceY((d: Node) => d.id === highId ? cy - height * 0.28 : cy + height * 0.28)
          .strength((d: Node) => (d.id === highId || d.id === lowId) ? 0.4 : 0))
        .force('collision', d3.forceCollide().radius(13))
        .alphaDecay(isMobile ? 0.07 : 0.04)
        .stop()

      // Manually tick in small chunks spread across animation frames,
      // instead of one large blocking loop — 300 ticks in a single
      // synchronous pass is real, non-trivial computation (this school's
      // grade 9 has the densest raw edge count of any grade here), and
      // running it all at once risked colliding with a nav-jump landing
      // directly on this section moments after page load, which could
      // make the very problem this is meant to fix worse instead of
      // better. 15 ticks/frame x 20 frames reaches the same total while
      // yielding back to the browser between each chunk.
      let ticksRun = 0
      const TICKS_PER_FRAME = 15
      const TOTAL_TICKS = 300
      const tickChunk = () => {
        for (let i = 0; i < TICKS_PER_FRAME && ticksRun < TOTAL_TICKS; i++, ticksRun++) {
          simulation.tick()
        }
        if (ticksRun < TOTAL_TICKS) {
          requestAnimationFrame(tickChunk)
          return
        }
        // d3.forceLink mutates edges in place, replacing numeric
        // source/target ids with direct references to this pre-warm run's
        // OWN node objects — normalize back to plain ids here so the main
        // effect's own nodeById-based resolution step (which runs
        // regardless of whether it took this cached path or the fresh
        // path) works the same way either way.
        const cachedEdges = warmEdges.map(e => ({
          ...e,
          source: typeof e.source === 'number' ? e.source : (e.source as Node).id,
          target: typeof e.target === 'number' ? e.target : (e.target as Node).id,
        }))
        preWarmedGrade9Ref.current = {
          nodes: warmNodes.map(n => ({ ...n, vx: 0, vy: 0, fx: null, fy: null })),
          edges: cachedEdges,
        }
      }
      tickChunk()
    }

    setTimeout(run, 50)
  }, [allGraphData, graphSize, mode, isMobile])

  const getFaceSize = () => currentStep === 0 ? 40 : FACE_SIZE

  // hover highlighting
  useEffect(() => {
    if (!svgRef.current) return
    // Same reasoning as GraphSection45's identical comment — step 1 here
    // means grade 10, not whatever GraphSection.tsx's own step 1 means.
    applyHoverHighlight(d3.select(svgRef.current), hoveredNode, activeEdgesRef.current)
    // applyHoverHighlight's broad 'circle' selector also matches the
    // protagonist-border circles — reset their radius back to the correct
    // border-ratio value right after, same fix GraphSection68 needed for
    // the same shared-selector issue.
    d3.select(svgRef.current).selectAll<SVGCircleElement, Node>('circle.protagonist-border')
      .attr('r', getFaceSize() * BORDER_RATIO)
  }, [hoveredNode, currentStep])

  // notice text
  useEffect(() => {
    if (!hasEnteredSection) return
    if (currentStep === 0) {
      // The dialogue step should never show leftover notice text from
      // grade 9 — unlike grades 10/12 (which intentionally keep the
      // previous grade's sentence on screen, see below), returning to the
      // dialogue should always clear it.
      clearInterval(noticeIntervalRef.current!)
      noticeTargetRef.current = ''
      setNoticeText('')
      return
    }
    const target = getNoticeTarget(currentStep)
    // getNoticeTarget always resolves to a non-empty sentence for any
    // step >= 1 now (it walks backward to the nearest defined one), so
    // there's no more "leave whatever's currently displayed alone" case
    // to handle here — every step >= 1 has a real target to compare
    // against and type out if it's actually different from what's showing.
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
  }, [currentStep, hasEnteredSection])

  // main graph effect
  useEffect(() => {
    if (!svgRef.current || graphSize.width === 0) return
    if (currentStep > 0 && !allGraphData[currentStep - 1]) return
    // Mobile-only: wait for the one-frame defer above to catch up before
    // doing any real work — see deferredStep's own comment for why. This
    // effect will naturally re-run once setDeferredStep fires.
    if (isMobile && deferredStep !== currentStep) return

    const svg = d3.select(svgRef.current)
    const g = svg.select<SVGGElement>('g.root')
    const linkG = g.select<SVGGElement>('g.links')
    const nodeG = g.select<SVGGElement>('g.nodes')
    const { width, height } = graphSize
    const cx = width / 2, cy = height / 2
    const existingById = new Map(activeNodesRef.current.map(n => [n.id, n]))

    let newNodes: Node[] = []
    let newEdges: Edge[] = []
    let highId = DIALOGUE_HIGH_ID
    let lowId = DIALOGUE_LOW_ID
    const isDialogueStep = currentStep === 0
    let usedPreWarmedCache = false

    if (isDialogueStep) {
      const dummyNode = (id: number, xOffset: number): Node => ({
        id,
        ses: id === DIALOGUE_HIGH_ID ? 'higher' : 'lower',
        race_ethnicity: id === DIALOGUE_HIGH_ID ? 'white_asian' : 'student_of_color',
        courses: '',
        grade_level: 9,
        x: cx + xOffset, y: cy,
        fx: cx + xOffset, fy: cy,
      })
      newNodes = [dummyNode(DIALOGUE_HIGH_ID, -70), dummyNode(DIALOGUE_LOW_ID, 70)]
      newEdges = []
    } else {
    const ids = PROTAGONIST_IDS[currentStep]
    highId = ids.high
    lowId = ids.low

    const data = allGraphData[currentStep - 1]!
    const filteredFullNodes = data.nodes
      .filter(n => n.courses && !n.courses.toLowerCase().includes('non-reporting'))
      // Students with only a single listed course (e.g. just "Seminar" —
      // common among some grade 12 students on reduced schedules) only
      // ever tie to others through that one class, which is exactly the
      // kind of thin, single-course connection that reads as noise rather
      // than a real course-pathway relationship.
      .filter(n => n.courses.split(',').map(c => c.trim()).filter(Boolean).length > 1)
    fullPopulationRef.current = filteredFullNodes.map(n => ({ ...n }))
    {
      const fullIds = new Set(filteredFullNodes.map(n => n.id))
      const minWeightForStats = MIN_EDGE_WEIGHT[currentStep] ?? 2
      fullEdgesRef.current = data.edges.filter(e =>
        e.weight >= minWeightForStats && fullIds.has(e.source as number) && fullIds.has(e.target as number)
      )
    }

    // Grade 9's genuine first-ever visit (no existing converged positions
    // to carry over at all) reuses the background pre-warm's ENTIRE
    // finished set directly, rather than independently re-running
    // sampleNodes/pruneLowDegree/keepLargestComponent/rescueDroppedNodes —
    // see preWarmedGrade9Ref's own comment for why re-sampling
    // independently defeated the whole point of pre-warming. A revisit
    // (hasRenderedGrade9Ref already true) always uses its own real
    // converged positions via existingById below instead, since that's a
    // better source than a pre-warm snapshot from earlier in the session.
    if (currentStep === 1 && !hasRenderedGrade9Ref.current && preWarmedGrade9Ref.current) {
      usedPreWarmedCache = true
      newNodes = preWarmedGrade9Ref.current.nodes.map(n => ({ ...n }))
      newEdges = preWarmedGrade9Ref.current.edges.map(e => ({ ...e }))
    } else {
    // Sample down for the simulation/render, but keep the FULL filtered
    // list around for NodeStats — the % breakdown should reflect the true
    // population, not just whichever subset got rendered.
    const nodesToUse = sampleNodes(filteredFullNodes, getNodeSampleCap(currentStep, isMobile), highId, lowId)

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
    // revisits. (Grade 9 specifically takes the cached-reuse branch above
    // instead, whenever the pre-warm finished in time — this random
    // fallback below is grade 9's own backstop for the rare case a
    // nav-jump lands here before pre-warming has had a chance to finish,
    // and the normal path for grades 10-12, which don't pre-warm at all
    // since they always inherit the previous grade's layout instead.)
    newNodes = nodesToUse.map(n => {
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
    newEdges = pruned.edges

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
    }
    if (currentStep === 1) hasRenderedGrade9Ref.current = true
    }

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
    const faceSize = isDialogueStep ? 40 : FACE_SIZE

    const simulation = isDialogueStep
      ? d3.forceSimulation<Node>(newNodes)
          .force('link', d3.forceLink<Node, Edge>(newEdges).id(d => d.id).distance(120).strength(0.1))
          .force('charge', d3.forceManyBody().strength(-600))
          .force('center', d3.forceCenter(cx, cy))
          .force('collision', d3.forceCollide().radius(faceSize + 5))
          .alphaDecay(isMobile ? 0.05 : 0.0228)
      : d3.forceSimulation<Node>(newNodes)
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
      // Dedicated to JUST the two protagonists, separate from the
      // group-level x/y nudges above. Those apply the same soft pull to
      // every node in a side, which keeps the two groups broadly apart in
      // aggregate but doesn't guarantee any TWO SPECIFIC nodes end up far
      // apart — the protagonists' own individual link/charge forces could
      // still pull them close to each other or to the group boundary
      // (visually reading as "close together" despite genuinely sharing
      // zero classes). Strength 0 for every non-protagonist node means
      // these two forces have literally no effect on the rest of the
      // simulation or its existing tuning — proportional offsets (not
      // fixed px) so this scales correctly across the four grades' panel
      // sizes. Strength 0.4 is a strong pull but not a hard pin (unlike
      // fx/fy) — the two still participate in the physics and can wobble
      // with it, just anchored toward opposite corners strongly enough to
      // reliably win out over local link pull.
      .force('protagonistX', d3.forceX((d: Node) => d.id === highId ? cx - width * 0.32 : cx + width * 0.32)
        .strength((d: Node) => (d.id === highId || d.id === lowId) ? 0.4 : 0))
      .force('protagonistY', d3.forceY((d: Node) => d.id === highId ? cy - height * 0.28 : cy + height * 0.28)
        .strength((d: Node) => (d.id === highId || d.id === lowId) ? 0.4 : 0))
      .force('collision', d3.forceCollide().radius(13))
      // Faster than GraphSection/GraphSection45/68's shared 0.0228 default —
      // this only changes how many ticks it takes to cool down to the same
      // equilibrium layout the forces above define, not the layout itself,
      // so it settles noticeably quicker without changing the final shape
      // or requiring any other visual/aesthetic tradeoff.
      .alphaDecay(isMobile ? 0.07 : 0.04)

    simulationRef.current = simulation

    const padding = isDialogueStep ? (isMobile ? 60 : 150) : (isMobile ? 30 : 80)
    // Reverted the zoom cap — see the identical comment in GraphSection45.
    // Grade 9 gets a longer delay only when it fell through to a genuine
    // cold start (pre-warm cache wasn't ready yet — e.g. a very fast
    // nav-jump landing before the background pre-warm finished, or a
    // revisit after the pre-warm's one-shot cache was already consumed
    // and cleared) — see usedPreWarmedCache above. When the cache WAS
    // used, positions are already exactly the converged set the pre-warm
    // computed, so the camera can fit almost immediately instead of
    // waiting out the same delay a genuine cold start needs.
    const zoomDelay = currentStep === 1 ? (usedPreWarmedCache ? 300 : 2200) : 800
    const zoomTimer = autoZoom(g, width, height, padding, zoomDelay)

    simulation.on('tick', () => {
      linkG.selectAll<SVGLineElement, Edge>('line')
        .attr('x1', d => (d.source as Node).x ?? 0).attr('y1', d => (d.source as Node).y ?? 0)
        .attr('x2', d => (d.target as Node).x ?? 0).attr('y2', d => (d.target as Node).y ?? 0)
      nodeG.selectAll<SVGCircleElement, Node>('circle').attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0)
      nodeG.selectAll<SVGImageElement, Node>('image')
        .attr('x', d => (d.x ?? 0) - faceSize / 2).attr('y', d => (d.y ?? 0) - faceSize / 2)
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

    nodeG.selectAll<SVGCircleElement, Node>('circle.regular-node').data(nonProtags, d => d.id)
      .join(
        enter => enter.append('circle')
          .attr('class', 'regular-node')
          .attr('cx', d => d.x ?? cx).attr('cy', d => d.y ?? cy).attr('r', 6)
          .attr('fill', d => getNodeColor912(d, mode, highId, lowId))
          .attr('stroke', 'white').attr('stroke-width', 0.8)
          .attr('cursor', 'pointer').attr('opacity', 0)
          .transition().duration(500).attr('opacity', 1),
        update => update.attr('fill', d => getNodeColor912(d, mode, highId, lowId)),
        exit => exit.transition().duration(300).attr('opacity', 0).remove()
      )

    const protagBorders = nodeG.selectAll<SVGCircleElement, Node>('circle.protagonist-border').data(protags, d => d.id)
    protagBorders.exit().remove()
    protagBorders.attr('r', faceSize * BORDER_RATIO)
    protagBorders.enter().insert('circle', ':first-child')
      .attr('class', 'protagonist-border')
      .attr('cx', d => d.x ?? cx).attr('cy', d => d.y ?? cy)
      .attr('r', faceSize * BORDER_RATIO).attr('fill', 'white')
      .attr('pointer-events', 'none')

    nodeG.selectAll<SVGImageElement, Node>('image').data(protags, d => d.id)
      .join(
        enter => enter.append('image')
          .attr('href', d => getFaceSrc912(d, mode, highId))
          .attr('width', faceSize).attr('height', faceSize)
          .attr('x', d => (d.x ?? cx) - faceSize / 2)
          .attr('y', d => (d.y ?? cy) - faceSize / 2)
          .attr('cursor', 'pointer').attr('opacity', 0)
          .transition().duration(500).attr('opacity', 1),
        update => update.attr('href', d => getFaceSrc912(d, mode, highId)),
        exit => exit.remove()
      )

    // Hover/tap highlighting and drag are unnecessary during the dialogue
    // step — its two nodes are placeholder dummies, not real data, so
    // there's nothing meaningful to highlight/dim toward or show stats
    // about.
    if (currentStep !== 0) setupNodeInteractions(nodeG, simulation, mode)
    return () => {
      simulation.stop()
      clearTimeout(zoomTimer)
      tooltipRef.current?.style('opacity', 0)
    }
  }, [currentStep, deferredStep, allGraphData, graphSize, mode, isMobile])

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

  // Click-to-skip for whatever's currently typing: the current step's
  // notice sentence, and NodeStats' own entrance sequence (via
  // skipTypingSignal, consumed as its skipSignal prop). Safe to call even
  // when nothing is actively typing.
  const skipTyping = () => {
    const target = getNoticeTarget(currentStep)
    if (target !== '' && noticeText.length < target.length) {
      clearInterval(noticeIntervalRef.current!)
      setNoticeText(target)
    }
    setSkipTypingSignal(s => s + 1)
  }

  const skipDialogue = () => {
    if (currentStep !== 0 || dialogueDone) return
    dialogueTimers.current.forEach(t => clearTimeout(t))
    setVisibleBubbles([true, true, true, true])
    setBubbleTexts(DIALOGUE.map(d => d.text))
    setDialogueDone(true)
  }

  const bubbleColorHigh = mode === 'race' ? '#FF9260' : '#FF8BDE'
  const bubbleColorLow = mode === 'race' ? '#8BA4FF' : '#22D880'

  const bubbleStyle = (isRight: boolean, color: string) => ({
    backgroundColor: 'white',
    border: `2px solid ${color}`,
    borderRadius: '12px',
    padding: '0.5rem 0.75rem',
    fontFamily: "'Kiwi Maru', serif",
    fontSize: isMobile ? 'clamp(0.65rem, 2.8vw, 0.85rem)' : 'clamp(0.8rem, 1.2vw, 1rem)',
    color: '#111',
    lineHeight: 1.4,
    boxShadow: '0 9px 22px rgba(0,0,0,0.3)',
    position: 'relative' as const,
    textAlign: isRight ? 'right' as const : 'left' as const,
  })

  return (
    <div ref={outerRef} id="graph-912" style={{ height: isMobile ? '100vh' : `${STEPS.length * 100}vh`, position: 'relative', flexShrink: 0, width: '100%' }}>
      <div
        ref={sectionRef}
        style={{
          position: isMobile ? 'relative' : 'sticky',
          top: 0,
          width: '100%',
          height: '100vh',
          backgroundColor: 'var(--color-bg)',
          overflow: 'hidden',
          ...(isMobile ? { overflowAnchor: 'none' as const } : {}),
        }}
      >

        {/* Graph-paper background — direct child of sectionRef (not the
            content wrapper below) so it always spans the section's full
            height regardless of how much shorter the actual content is
            on mobile. */}
        <motion.div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: 'url(/assets/graph-paper-bg.png)',
          backgroundRepeat: 'repeat',
          opacity: bgOpacity,
          pointerEvents: 'none',
        }} />

        {/* Content wrapper — capped shorter than the section's own 100vh
            on mobile (matching GraphSection68/GraphSectionElementary's
            convention) so there's edge padding at the bottom; only the
            wallpaper above extends into that extra space. */}
        <div style={{ height: isMobile ? '94vh' : '100%', width: '100%', display: 'flex', flexDirection: isMobile ? 'column' : 'row', position: 'relative' }}>

        {/* left panel */}
        <div style={{ width: isMobile ? '100%' : '28%', height: isMobile ? 'auto' : '100%', display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'center' : 'flex-start', justifyContent: 'flex-start', padding: isMobile ? '4.5rem 1.5rem 0.5rem 1.5rem' : '6rem 2rem 6rem 3rem', flexShrink: 0, gap: isMobile ? '1.5rem' : 0, position: 'relative' }}>
          {/* Semi-opaque rounded panel behind the left column's content —
              same convention as GraphSection68/GraphSectionElementary. */}
          {!isMobile && (
            <div style={{ position: 'absolute', top: '3%', bottom: '3%', left: '1rem', right: '1rem', backgroundColor: 'rgba(250, 249, 246, 0.82)', borderRadius: '32px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 0 }} />
          )}
          {/* Desktop: full 1in top margin (the wrapper's own 6rem padding
              above). Notice text and the title keep the same (flexible,
              equal) gaps between them as before; the three stat pieces
              (breakdown, baseline, isolation) are now grouped tightly
              together right under the title instead of also being spread
              out. */}
          {!isMobile && (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
              {/* Fixed, uniform height across every step — NOT
                  per-step-measured. Ghost-text sizing (the previous
                  approach here) guaranteed no clipping, but let this box's
                  real height vary step to step, which moved the flex:1
                  spacer's split and therefore the title's vertical
                  position along with it (a taller notice pushes the title
                  DOWN, not up, since the notice itself takes more of the
                  fixed total height even after the spacer partially
                  compensates) — visible as the title drifting up/down
                  between steps depending on whether that step's notice is
                  empty, short, or long. Locking this to one height (sized
                  to comfortably fit step 2's sentence, the longest one,
                  which is also why that sentence's font is smaller below)
                  keeps the title's position identical on every step. */}
              <div style={{ height: '11.5rem', display: 'flex', alignItems: 'flex-start', overflow: 'visible' }}>
                {noticeText && (
                  <p style={{
                    fontFamily: "'Kiwi Maru', serif",
                    // Tracks noticeTargetRef (what's actually being
                    // displayed) rather than currentStep === 2. Steps
                    // without their own notice (1 and 3) intentionally
                    // leave the previous step's text on screen rather
                    // than clearing it (see the notice-text effect
                    // above) — so at grade 12, noticeText is still grade
                    // 11's long sentence even though currentStep is 3.
                    // Checking currentStep here mismatched exactly that
                    // case: long text, but the font meant for short
                    // sentences, since currentStep no longer equaled 2 —
                    // which is what read as "the font enlarges and
                    // overlaps again" when scrolling onward past grade 11.
                    fontSize: noticeTargetRef.current === STEP_NOTICES[3] ? 'clamp(0.94rem, 1.55vw, 1.2rem)' : 'clamp(1rem, 1.8vw, 1.4rem)',
                    color: '#111', lineHeight: 1.6, margin: 0,
                  }}>
                    {renderNoticeContent()}
                  </p>
                )}
              </div>
              <div style={{ flex: 1 }} />
              <div>
                <AnimatePresence mode="wait">
                  <motion.p key={currentStep}
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.4 }}
                    style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(1rem, 2vw, 1.6rem)', color: '#111', lineHeight: 1.6, margin: 0 }}
                  >
                    {STEPS[currentStep].label}
                  </motion.p>
                </AnimatePresence>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
                  {STEPS.map((_, i) => (
                    <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: i === currentStep ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                  ))}
                </div>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2.25rem' }}>
                <NodeStats nodes={fullPopulationRef.current} edges={fullEdgesRef.current} mode={mode} visible={currentStep >= 1} mobile={false} startTyping={currentStep >= 1} skipSignal={skipTypingSignal} />
              </div>
            </div>
          )}
          {isMobile && (
            <div style={{
              backgroundColor: 'rgba(250, 249, 246, 0.82)',
              borderRadius: '18px',
              padding: '1rem 1.5rem',
            }}>
              <AnimatePresence mode="wait">
                <motion.p key={currentStep}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                  style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.9rem, 3.5vw, 1.1rem)', color: '#111', lineHeight: 1.6, margin: 0, textAlign: 'center' }}
                >
                  {STEPS[currentStep].label}
                </motion.p>
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* graph panel */}
        <div
          ref={graphPanelRef}
          onClick={(e) => {
            // Skip the dialogue on tap/click, same on every platform.
            if (currentStep === 0 && !dialogueDone) {
              skipDialogue()
              return
            }
            // Skip whichever notice/stats typing is currently running —
            // also works on desktop, where clicks otherwise fall through
            // to nothing until the isMobile check below.
            // Finish whatever notice typing is running, WITHOUT blocking
            // the rest of this tap — was `if (isNoticeTyping) { skipTyping(); return }`,
            // which meant any tap landing while noticeText hadn't exactly
            // caught up to its target (a timing race, not something the
            // user did) got swallowed entirely, never reaching the
            // advance-step logic below. That gate used to only matter on
            // grades 9/11 (the only steps with their own STEP_NOTICES
            // entry — every other step's target was '', so isNoticeTyping
            // was always false there). Since getNoticeTarget started
            // walking backward to always resolve non-empty for any step
            // >= 1 (fixing notice text disappearing on grades 10/12),
            // EVERY grade step's tap now runs through this check — and
            // any tap that raced ahead of typing on ANY of them silently
            // ate the whole gesture instead of just finishing the text.
            // skipTyping() is already safe to call unconditionally (same
            // as setSkipTypingSignal right below), so just do that.
            skipTyping()
            // Notice text (if any) is already done, but NodeStats' own
            // entrance sequence might still be typing — bump its skip
            // signal too (a harmless no-op if it's already finished)
            // without consuming the click, so normal tap/navigation below
            // still runs in the same gesture.
            setSkipTypingSignal(s => s + 1)
            if (!isMobile) return
            // By this point dialogueDone is guaranteed true (the check
            // above already returned for the not-done case) — this used
            // to just `return` unconditionally, which on mobile was a
            // dead end: the wheel/touch-swipe handlers that would
            // normally advance currentStep are skipped entirely on
            // mobile (see useGraphSection.ts), so tap is the ONLY
            // mechanism mobile has to move forward at all, and this line
            // blocked the very first tap needed to leave the dialogue.
            if (currentStep === 0) { setCurrentStep(1); return }
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
          style={{ flex: 1, minHeight: 0, height: isMobile ? undefined : '100%', position: 'relative', cursor: (isMobile || (currentStep === 0 && !dialogueDone)) ? 'pointer' : 'default' }}
        >
          {isMobile && noticeText && (
            <div style={{ position: 'absolute', top: '2.2rem', left: '10%', right: '10%', zIndex: 5, padding: '0.6rem 1rem', backgroundColor: 'rgba(250,249,246,0.92)', borderRadius: '8px' }}>
              <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.6rem, 2.5vw, 0.75rem)', color: '#111', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
                {renderNoticeContent()}
              </p>
            </div>
          )}

          <svg ref={svgRef} width={graphSize.width} height={graphSize.height} style={{ display: 'block', width: '100%', height: '100%', touchAction: 'pan-y' }} />

          {/* comic strip dialogue bubbles — four independently-positioned
              bubbles, alternating left(high)/right(low), same convention
              as GraphSection68's dialogue. One extra line than 68's own
              three, so the vertical gaps below just continue the same
              per-line spacing one step further rather than compressing
              to fit the same total range. */}
          {currentStep === 0 && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
              {/* "I feel like I never see you anymore." — highest */}
              <div style={{ position: 'absolute', left: isMobile ? '15%' : '19%', top: isMobile ? '13%' : '6%', maxWidth: isMobile ? '160px' : '240px' }}>
                {visibleBubbles[0] && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={bubbleStyle(false, bubbleColorHigh)}
                  >
                    {bubbleTexts[0]}
                    <div style={{ position: 'absolute', bottom: '-10px', left: '20px', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid white' }} />
                    <div style={{ position: 'absolute', bottom: '-13px', left: '18px', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `12px solid ${bubbleColorHigh}` }} />
                  </motion.div>
                )}
              </div>
              {/* "I know, it's like we don't even go to the same school." */}
              <div style={{ position: 'absolute', right: isMobile ? '15%' : '19%', top: isMobile ? '21%' : '15%', maxWidth: isMobile ? '184px' : '255px' }}>
                {visibleBubbles[1] && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={bubbleStyle(true, bubbleColorLow)}
                  >
                    {bubbleTexts[1]}
                    <div style={{ position: 'absolute', bottom: '-10px', right: '20px', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid white' }} />
                    <div style={{ position: 'absolute', bottom: '-13px', right: '18px', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `12px solid ${bubbleColorLow}` }} />
                  </motion.div>
                )}
              </div>
              {/* "Yeah. Are you at least free after school?" */}
              <div style={{ position: 'absolute', left: isMobile ? '15%' : '19%', top: isMobile ? '29%' : '24%', maxWidth: isMobile ? '160px' : '240px' }}>
                {visibleBubbles[2] && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={bubbleStyle(false, bubbleColorHigh)}
                  >
                    {bubbleTexts[2]}
                    <div style={{ position: 'absolute', bottom: '-10px', left: '20px', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid white' }} />
                    <div style={{ position: 'absolute', bottom: '-13px', left: '18px', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `12px solid ${bubbleColorHigh}` }} />
                  </motion.div>
                )}
              </div>
              {/* "Sorry, I'm too busy." — lowest */}
              <div style={{ position: 'absolute', right: isMobile ? '15%' : '19%', top: isMobile ? '37%' : '33%', maxWidth: isMobile ? '172px' : '240px' }}>
                {visibleBubbles[3] && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    style={bubbleStyle(true, bubbleColorLow)}
                  >
                    {bubbleTexts[3]}
                    <div style={{ position: 'absolute', bottom: '-10px', right: '20px', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '10px solid white' }} />
                    <div style={{ position: 'absolute', bottom: '-13px', right: '18px', width: 0, height: 0, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: `12px solid ${bubbleColorLow}` }} />
                  </motion.div>
                )}
              </div>
            </div>
          )}

          {isMobile && (
            <>
              {!(currentStep === 0 && !dialogueDone) && currentStep > 0 && (
                <div style={{
                  position: 'absolute', top: '0.6rem', left: '0.6rem', zIndex: 5, pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.55rem, 2.2vw, 0.68rem)', color: '#111',
                  backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.25rem 0.5rem', borderRadius: '999px',
                }}>
                  ← Tap to go back
                </div>
              )}
              {!(currentStep === 0 && !dialogueDone) && currentStep < STEPS.length - 1 && (
                <div style={{
                  position: 'absolute', top: '0.6rem', right: '0.6rem', zIndex: 5, pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  fontFamily: "'Kiwi Maru', serif", fontSize: 'clamp(0.55rem, 2.2vw, 0.68rem)', color: '#111',
                  backgroundColor: 'rgba(250,249,246,0.85)', padding: '0.25rem 0.5rem', borderRadius: '999px',
                }}>
                  Tap to go forward →
                </div>
              )}
              {currentStep >= 1 && (
                <NodeStats nodes={fullPopulationRef.current} edges={fullEdgesRef.current} mode={mode} visible={currentStep >= 1} mobile={true} startTyping={currentStep >= 1} skipSignal={skipTypingSignal} mobileBottomOffset="2.1rem" />
              )}
              <div style={{ position: 'absolute', bottom: '2.6rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '0.4rem' }}>
                {STEPS.map((_, i) => (
                  <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: i === currentStep ? '#111' : '#ccc', transition: 'background-color 0.3s ease' }} />
                ))}
              </div>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}