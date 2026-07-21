export interface Node {
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

export interface Edge {
  source: number | Node
  target: number | Node
  weight: number
}

export interface GraphData {
  nodes: Node[]
  edges: Edge[]
}