import type { Mode } from '../App'

export interface CourseRaw {
  higher: number
  lower: number
  white_asian: number
  poc: number
  total: number
}

export type CoursesRaw = Record<string, CourseRaw>

export interface CourseStat {
  name: string
  total: number
  higherPct: number
  whiteAsianPct: number
}

// Same threshold the handoff doc's own aggregation used ("142 courses with
// 50+ combined enrollments") — below this, a single class's makeup is too
// small a sample to read as a real pattern rather than noise.
export const MIN_ENROLLMENT = 50

// Rows shown on each side of the ranked list (most-skewed-toward-high-group
// at the top, most-skewed-toward-low-group at the bottom). 10+10 keeps the
// chart readable in one scroll on both mobile and desktop.
export const TOP_N_PER_SIDE = 10

// Course names come in ALL CAPS from the source records (e.g. "NC MATH 2
// HN", "PLTW INTRO TO ENGINEERING DESIGN AP"). Title-casing everything
// verbatim would turn real acronyms into "Hn", "Ap", "Nc" etc, so short
// known abbreviations are kept upper-case and course-code tokens (e.g.
// "ENG231") are left alone; everything else gets title-cased.
const KEEP_UPPER = new Set([
  'AP', 'HN', 'SC', 'NC', 'US', 'JROTC', 'PLTW', 'ESL', 'AVID', 'PE',
  'STEM', 'AI', 'CTE', 'DFT',
])

export function formatCourseName(raw: string): string {
  return raw
    .split(' ')
    .map(word => {
      const bare = word.replace(/[^A-Za-z0-9]/g, '')
      if (KEEP_UPPER.has(bare.toUpperCase())) return word
      if (/^[A-Z]{2,4}\d{2,3}$/.test(bare)) return word // course codes like ENG231, MAT272
      if (bare.length === 0) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

export function computeCourseStats(raw: CoursesRaw): CourseStat[] {
  return Object.entries(raw)
    .filter(([, c]) => c.total >= MIN_ENROLLMENT)
    .map(([name, c]) => ({
      name,
      total: c.total,
      higherPct: (c.higher / c.total) * 100,
      whiteAsianPct: (c.white_asian / c.total) * 100,
    }))
}

// Returns courses sorted from most-skewed-toward-the-"high"-group (pink /
// white-asian) down to most-skewed-toward-the-"low"-group (green / student
// of color), trimmed to the top/bottom N. Re-sorts on mode change since SES
// skew and race skew don't always rank the same courses the same way.
export function getRankedCourses(stats: CourseStat[], mode: Mode): CourseStat[] {
  const key: keyof CourseStat = mode === 'race' ? 'whiteAsianPct' : 'higherPct'
  const sorted = [...stats].sort((a, b) => (b[key] as number) - (a[key] as number))
  if (sorted.length <= TOP_N_PER_SIDE * 2) return sorted
  return [...sorted.slice(0, TOP_N_PER_SIDE), ...sorted.slice(-TOP_N_PER_SIDE)]
}