'use client'

import type { HighlightRect } from '@/lib/pdf-positions'

// Severity colors match the existing palette in RiskPanel.tsx
const SEVERITY_COLORS: Record<string, string> = {
  high: '#F05252',
  medium: '#F6A609',
  low: '#22C97B',
}

interface PDFHighlightOverlayProps {
  rects: HighlightRect[]
  scale: number
  activeClauseId: string | null
  rectClauseIds: string[]
  rectSeverities: string[]
  onRectClick?: (clauseId: string) => void
}

export function PDFHighlightOverlay({
  rects,
  scale,
  activeClauseId,
  rectClauseIds,
  rectSeverities,
  onRectClick,
}: PDFHighlightOverlayProps) {
  if (!rects.length) return null

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 3 }}>
      {rects.map((rect, i) => {
        const clauseId = rectClauseIds[i]
        const color = SEVERITY_COLORS[rectSeverities[i]] ?? '#888888'
        const isActive = clauseId === activeClauseId

        return (
          <div
            key={`${clauseId}-${i}`}
            onClick={() => onRectClick?.(clauseId)}
            style={{
              position: 'absolute',
              left: rect.x * scale,
              top: rect.y * scale,
              width: rect.width * scale,
              height: rect.height * scale,
              background: isActive ? `${color}40` : `${color}22`,
              border: isActive ? `1.5px solid ${color}` : `1px solid ${color}88`,
              borderRadius: 2,
              pointerEvents: 'auto',
              cursor: 'pointer',
              transition: 'background 0.15s, border 0.15s',
            }}
          />
        )
      })}
    </div>
  )
}
