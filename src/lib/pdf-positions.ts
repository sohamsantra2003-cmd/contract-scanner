export interface PositionedTextItem {
  str: string
  x: number
  y: number
  width: number
  height: number
}

export interface HighlightRect {
  page: number
  x: number
  y: number
  width: number
  height: number
}

// Call once per page using the PDFPageProxy from pdfjs.
// pdfjs-dist types not cleanly exported here; runtime shape is verified.
export async function extractPositionedItems(page: any): Promise<PositionedTextItem[]> {
  const viewport = page.getViewport({ scale: 1 })
  const textContent = await page.getTextContent()
  const items: PositionedTextItem[] = []

  for (const item of textContent.items) {
    if (!('str' in item) || !item.str || !item.str.trim()) continue

    const tx = item.transform[4]
    const ty = item.transform[5]
    // item.height is not always populated — fall back to the font scale component
    const itemHeight = item.height || Math.abs(item.transform[3]) || 10
    const itemWidth = item.width || 0

    // Use pdfjs's own conversion to handle page rotation and origin flip correctly
    const rect = viewport.convertToViewportRectangle([
      tx, ty, tx + itemWidth, ty + itemHeight,
    ])

    // convertToViewportRectangle can return corners in any order depending on rotation
    const x = Math.min(rect[0], rect[2])
    const y = Math.min(rect[1], rect[3])
    const width = Math.abs(rect[2] - rect[0])
    const height = Math.abs(rect[3] - rect[1])

    items.push({ str: item.str, x, y, width, height })
  }

  return items
}

// Mirrors the findClausePage in RiskPanel — used by ContractViewer for highlight mapping.
export function findClausePage(clauseText: string, pageTexts: string[]): number {
  if (!pageTexts.length) return 1
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const needle = norm(clauseText).slice(0, 120)
  for (let i = 0; i < pageTexts.length; i++) {
    if (norm(pageTexts[i]).includes(needle)) return i + 1
  }
  const needleWords = new Set(needle.split(' ').filter((w) => w.length > 4))
  let bestPage = 1, bestScore = 0
  pageTexts.forEach((text, i) => {
    const matches = norm(text).split(' ').filter((w) => needleWords.has(w)).length
    if (matches > bestScore) { bestScore = matches; bestPage = i + 1 }
  })
  return bestPage
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

export function matchClauseToRects(
  clauseText: string,
  pageItems: PositionedTextItem[],
  pageNumber: number,
): HighlightRect[] {
  if (!pageItems.length) return []

  const needleWords = normalise(clauseText).split(' ').filter((w) => w.length > 2)
  if (needleWords.length < 3) return []

  const needleWordSet = new Set(needleWords)
  // Safety cap for very long pages
  const cappedItems = pageItems.length > 2000
    ? (console.warn('[PDFHighlight] Page item count capped at 2000'), pageItems.slice(0, 2000))
    : pageItems

  let bestStart = -1
  let bestEnd = -1
  let bestScore = 0

  for (let start = 0; start < cappedItems.length; start++) {
    let wordCount = 0
    let matchCount = 0
    let end = start

    while (end < cappedItems.length && wordCount < needleWords.length * 1.4) {
      const itemWords = normalise(cappedItems[end].str).split(' ').filter((w) => w.length > 2)
      for (const w of itemWords) {
        wordCount++
        if (needleWordSet.has(w)) matchCount++
      }
      end++
    }

    const score = wordCount > 0 ? matchCount / needleWords.length : 0
    if (score > bestScore) {
      bestScore = score
      bestStart = start
      bestEnd = end
    }
  }

  const CONFIDENCE_THRESHOLD = 0.55
  if (bestScore < CONFIDENCE_THRESHOLD || bestStart === -1) return []

  const matchedItems = cappedItems.slice(bestStart, bestEnd)

  // Group into lines by similar y position (within 4px at scale 1)
  const lineGroups: PositionedTextItem[][] = []
  const Y_TOLERANCE = 4

  for (const item of matchedItems) {
    const existing = lineGroups.find((g) => Math.abs(g[0].y - item.y) < Y_TOLERANCE)
    if (existing) {
      existing.push(item)
    } else {
      lineGroups.push([item])
    }
  }

  return lineGroups.map((group) => ({
    page: pageNumber,
    x: Math.min(...group.map((i) => i.x)),
    y: Math.min(...group.map((i) => i.y)),
    width: Math.max(...group.map((i) => i.x + i.width)) - Math.min(...group.map((i) => i.x)),
    height: Math.max(...group.map((i) => i.height)),
  }))
}

// Try target page first; if no match, accept the miss (Clause Jump handles it).
export function findBestRectsAcrossPages(
  clauseText: string,
  allPageItems: PositionedTextItem[][],
  targetPage: number,
): HighlightRect[] {
  const onTarget = matchClauseToRects(clauseText, allPageItems[targetPage - 1] ?? [], targetPage)
  if (onTarget.length > 0) return onTarget
  return []
}
