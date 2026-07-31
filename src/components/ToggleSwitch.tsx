import { useState } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'
import type { Mode } from '../App'

// Renders each character of a word in an alternating color pair — used for
// the "SES"/"Race" labels, which always alternate their OWN fixed pair
// regardless of mode, since they're naming the toggle options themselves.
function renderAlternating(text: string, colorA: string, colorB: string) {
  return text.split('').map((ch, i) => (
    <span key={i} style={{ color: i % 2 === 0 ? colorA : colorB }}>{ch}</span>
  ))
}

// True aspect ratios from the source artwork (oval.svg: 151x78, circle.svg:
// 73x70) — used to derive track height and knob size from a single width,
// so nothing gets stretched out of proportion.
const OVAL_ASPECT = 151 / 78
const CIRCLE_HEIGHT_RATIO = 70 / 78 // circle height relative to oval height
const CIRCLE_ASPECT = 73 / 70 // circle's own width/height

interface Props {
  mode: Mode
  onToggle: () => void
  // Conclusion's ceremonial reveal wants the pink/green/orange/blue label
  // colors; the nav bar wants plain black labels instead — defaults keep
  // Conclusion's existing look unchanged.
  sesLabelColor?: string
  raceLabelColor?: string
  // Lets a caller (the nav bar) render a smaller instance without
  // affecting Conclusion's own full-size usage, which omits this entirely.
  scale?: number
}

export default function ToggleSwitch({
  mode,
  onToggle,
  sesLabelColor,
  raceLabelColor,
  scale = 1,
}: Props) {
  const isRace = mode === 'race'
  const [hovered, setHovered] = useState(false)
  const isMobile = useIsMobile()
  // trackWidth is the only size chosen directly (matching the toggle's
  // original on-screen scale, times the optional scale override);
  // everything else is derived from the real artwork proportions above.
  const trackWidth = (isMobile ? 74 : 96) * scale
  const trackHeight = trackWidth / OVAL_ASPECT
  const knobHeight = trackHeight * CIRCLE_HEIGHT_RATIO
  const knobWidth = knobHeight * CIRCLE_ASPECT
  const insetY = (trackHeight - knobHeight) / 2

  const sesColorA = sesLabelColor ?? 'var(--color-high-ses)'
  const sesColorB = sesLabelColor ?? 'var(--color-low-ses)'
  const raceColorA = raceLabelColor ?? 'var(--color-race-1)'
  const raceColorB = raceLabelColor ?? 'var(--color-race-2)'

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? '1.1rem' : `${1.4 * scale}rem`, justifyContent: 'center',
        transform: hovered ? 'scale(1.08)' : 'scale(1)',
        transition: 'transform 0.2s ease',
      }}
    >
      <span style={{ fontFamily: "'Kiwi Maru', serif", fontSize: isMobile ? 'clamp(1rem, 2.2vw, 1.35rem)' : `${1.3 * scale}rem` }}>
        {renderAlternating('SES', sesColorA, sesColorB)}
      </span>
      <div style={{ position: 'relative', width: `${trackWidth}px`, height: `${trackHeight}px`, flexShrink: 0 }}>
        <img
          src="/assets/oval.svg"
          style={{ position: 'absolute', top: 0, left: 0, width: `${trackWidth}px`, height: `${trackHeight}px`, display: 'block' }}
        />
        <img
          src="/assets/circle.svg"
          style={{
            position: 'absolute',
            top: `${insetY}px`,
            left: isRace ? `calc(100% - ${knobWidth + insetY}px)` : `${insetY}px`,
            width: `${knobWidth}px`, height: `${knobHeight}px`,
            transition: 'left 0.3s ease',
          }}
        />
      </div>
      <span style={{ fontFamily: "'Kiwi Maru', serif", fontSize: isMobile ? 'clamp(1rem, 2.2vw, 1.35rem)' : `${1.3 * scale}rem` }}>
        {renderAlternating('Race', raceColorA, raceColorB)}
      </span>
    </div>
  )
}