import { motion } from 'framer-motion'
import type { Mode } from '../App'
import type { Node } from './graphTypes'

interface Props {
  nodes: Node[]
  mode: Mode
  visible: boolean
  mobile: boolean
}

export default function NodeStats({ nodes, mode, visible, mobile }: Props) {
  const filtered = nodes.filter(n => n.ses || n.race_ethnicity)
  if (filtered.length === 0) return null

  const total = filtered.length
  const highCount = mode === 'race'
    ? filtered.filter(n => n.race_ethnicity === 'white_asian').length
    : filtered.filter(n => n.ses === 'higher').length
  const highPct = Math.round((highCount / total) * 100)
  const lowPct = 100 - highPct

  const highLabel = mode === 'race' ? 'White/Asian' : 'Above SES Line'
  const lowLabel = mode === 'race' ? 'Student of Color' : 'Below SES Line'
  const highColor = mode === 'race' ? '#FF954D' : '#F17091'
  const lowColor = mode === 'race' ? '#6897FF' : '#00B178'

  const fontSize = mobile
    ? 'clamp(0.7rem, 2.5vw, 0.9rem)'
    : 'clamp(0.8rem, 1.1vw, 1rem)'

  const content = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.6 }}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', pointerEvents: 'none' }}
    >
      <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize, color: highColor, margin: 0, lineHeight: 1.3, fontWeight: 500 }}>
        {highPct}% {highLabel}
      </p>
      <p style={{ fontFamily: "'Kiwi Maru', serif", fontSize, color: lowColor, margin: 0, lineHeight: 1.3, fontWeight: 500 }}>
        {lowPct}% {lowLabel}
      </p>
    </motion.div>
  )

  if (mobile) {
    return (
        <div style={{
        position: 'absolute',
        bottom: '2rem',
        right: '1.5rem',
        zIndex: 4,
        textAlign: 'right',
        backgroundColor: 'rgba(250,249,246,0.92)',
        padding: '0.4rem 0.6rem',
        borderRadius: '8px',
        }}>
        {content}
        </div>
    )
  }

  return content
}