# Day 4 Log — Risk Display UI + Clause Jump

**Date:** 2026-06-13
**Sprint day:** 4 of 7
**Goal:** Risk display UI — clause navigation (highlight deferred to post-MVP)

---

## Summary

Day 4 shipped the full two-panel contract viewer. The left side shows a live PDF; the right side shows the risk panel with filtering and clause cards. Clicking any clause card jumps the PDF to the page where that clause lives. Highlights were evaluated and deferred after detecting a hard version conflict. Four bugs were fixed across the day. Score consistency was also hardened as a follow-up.

---

## Pre-Day 4 RiskPanel Polish (carried in from Day 3 spec)

Three UX improvements shipped before Day 4 began:

**1. Filter counts on pills**
Category and severity pills now show `(n)` counts. Category pills use all-clause counts. Severity pills use counts scoped to the currently active category, so clicking "Liability (3)" then seeing "High (1) Medium (2)" is always accurate.

**2. Combinable filters**
Category and severity filters are independent and stack. `activeCategory` and `activeSeverity` are separate state variables. The filtered list is `categoryFiltered` (category applied) → `filtered` (severity applied on top). Severity counts recompute from `categoryFiltered`, not from `scan.clauses`.

**3. Empty state with clear-filters button**
When a filter combination matches zero clauses, a centered message reads "No clauses match this filter combination." with a "Clear filters" link that resets both filters to `"all"`.

Severity pills show category-scoped counts and are reset whenever the active category changes (via a `useEffect` on `activeCategory`).

---

## Bug: `scan.clauses is not iterable` on contract revisit

**Symptom:** Runtime `TypeError` thrown at `RiskPanel.tsx:401` when navigating to a contract that had already been scanned.

**Root cause:** `page.tsx` was passing the raw Supabase row object (`existingScan`) to `ContractViewer`/`RiskPanel`. The DB row has a `risk_json` column, not `clauses`. On a fresh scan (same session), RiskPanel had the correct object from the API response. On revisit, it received the raw row, and `(null).map(...)` or `undefined[Symbol.iterator]` threw.

**Fix:** Added an explicit mapping block in `src/app/dashboard/contracts/[id]/page.tsx` before `initialScan` is passed down:

```ts
const initialScan = existingScan ? {
  id: existingScan.id as string,
  risk_score: existingScan.risk_score as number,
  summary: existingScan.summary as string,
  clauses: (existingScan.risk_json ?? []) as Clause[],
  tokens_used: existingScan.tokens_used as number,
  scanned_at: existingScan.scanned_at as string,
} : null;
```

---

## Feature: ContractViewer — shared state lift

Created `src/components/ContractViewer.tsx` as a `"use client"` wrapper that owns the state shared between the PDF viewer and the risk panel:

- `currentPage: number` — controlled page sent to PDFViewer, updated when user navigates manually or clicks a clause card
- `pageTexts: string[]` — extracted text per page, sent to RiskPanel for clause-to-page matching

Layout: flex row, `height: calc(100vh - 60px)`. PDF panel is `flex: 0 0 60%` with `overflow: hidden`. Risk panel is `flex: 0 0 40%` with `overflowY: auto`. Danger zone (DeleteContractButton) lives inside the scrollable right column below RiskPanel.

`page.tsx` was simplified — the two-panel layout was replaced with a single `<ContractViewer>` import. This also fixed the Turbopack build error from an earlier attempt to use `dynamic(..., { ssr: false })` inside a Server Component (which is forbidden).

---

## Feature: PDFViewer — controlled page + text extraction

`src/components/PDFViewer.tsx` gained three new props:

| Prop | Type | Purpose |
|---|---|---|
| `currentPage` | `number \| undefined` | External controlled page — synced into internal state |
| `onPageChange` | `(page: number) => void` | Called on every manual page change |
| `onTextExtracted` | `(texts: string[]) => void` | Called once after document load with all page texts |

**Controlled sync:** Internal state renamed `internalPage`. A `useEffect` on `currentPage` copies it into `internalPage` when they diverge. The dependency on `internalPage` is intentionally omitted (eslint-disable) to avoid an infinite update loop.

**Stable callback ref:** `onTextExtracted` is wrapped in a `useRef` kept current via a separate `useEffect`. The `onDocumentLoadSuccess` callback uses an empty dep array (stable reference) but reads `onTextExtractedRef.current` at call time — avoids stale closures without adding `onTextExtracted` to the dep array.

**Text extraction:** `extractPageTexts()` is defined outside the component. It iterates every page via `pdf.getPage(i)`, calls `page.getTextContent()`, and joins `item.str` values. Per-page failures push `""` silently. Overall failures are swallowed — the viewer is fully functional without text extraction.

---

## Feature: RiskPanel — Clause Jump

`src/components/RiskPanel.tsx` gained two new props:

| Prop | Type | Purpose |
|---|---|---|
| `pageTexts` | `string[] \| undefined` | Page texts from PDFViewer for clause-to-page matching |
| `onClauseClick` | `(page: number) => void` | Fires when a clause card is clicked, with the target page |

**`findClausePage(clauseText, pageTexts)`** — two-tier matcher:
1. Exact substring: normalises both strings (lowercase, collapsed whitespace), takes first 120 chars of the clause, checks if any page contains it as a substring. Returns 1-indexed page on first match.
2. Word overlap fallback: splits needle into words longer than 4 chars, scores each page by how many of those words appear, returns the highest-scoring page (or page 1 as default).

**`activeClauseIndex`** state tracks which clause card is highlighted. Reset to `null` whenever the active category changes.

**`targetPages`** array — pre-computed before the card render loop. Each entry is a page number or `null` (if no page texts loaded yet). Passed directly into each `ClauseCard` so the card doesn't recompute per-render.

**ClauseCard changes:**
- Accepts `isActive`, `targetPage`, `onClick` props
- Active state: indigo background tint (`rgba(99,102,241,0.06)`), indigo border on three sides
- `borderLeft` stays as the severity colour stripe (3px)
- Shows `→ p.X` label in the top row when `targetPage !== null`, highlighted indigo when active
- `CopyButton.handleCopy` and "Show more" button both call `e.stopPropagation()` to prevent bubbling to the card click handler

**Navigation hint:** "Click any clause below to jump to it in the PDF" rendered above the clause list when `pageTexts.length > 0`.

---

## Highlights Deferred — Version Conflict

**Package evaluated:** `react-pdf-highlighter-plus@1.1.4`

**Conflict detected pre-install:** requires `pdfjs-dist ^4.4.168`; project uses `pdfjs-dist@5.4.296`.

Installing would have downgraded pdfjs-dist and broken the existing PDFViewer (react-pdf@10.4.1 requires pdfjs-dist v5). Per the War Room highlight fallback rule, the sidebar approach was activated immediately without attempting the install. Highlights remain deferred to post-MVP.

---

## Bug Fix: CSS Shorthand Conflict in ClauseCard

**Symptom:** Console warning "Updating a style property during rerender (border) when a conflicting property is set (borderLeft)".

**Root cause:** `ClauseCard` used the `border` shorthand alongside `borderLeft` in the same inline style object. React's style reconciler cannot merge a shorthand and a longhand on the same element during re-renders.

**Fix:** Replaced `border` with explicit `borderTop`, `borderRight`, `borderBottom`. `borderLeft` kept as the severity colour stripe:

```tsx
borderTop: isActive ? "0.5px solid rgba(99,102,241,0.5)" : "0.5px solid rgba(255,255,255,0.06)",
borderRight: isActive ? "0.5px solid rgba(99,102,241,0.5)" : "0.5px solid rgba(255,255,255,0.06)",
borderBottom: isActive ? "0.5px solid rgba(99,102,241,0.5)" : "0.5px solid rgba(255,255,255,0.06)",
borderLeft: `3px solid ${severityColor(clause.severity)}`,
```

---

## Bug Fix: Delete Contract Hanging After Analysis

**Symptom:** After clicking "Analyse contract" then "Delete", the delete appeared to hang. The contract was actually deleted — navigating to the dashboard manually confirmed this.

**Root cause:** `DeleteContractButton.handleDelete()` called `router.push(redirectTo)` followed by `router.refresh()`. The refresh re-triggered the server component fetch for the now-deleted contract page. The server component found no contract and issued its own `redirect("/dashboard")`, racing with the already-in-flight push navigation.

**Fix:** Removed `router.refresh()`. `router.push("/dashboard")` is sufficient — the dashboard is a server component and fetches fresh data on every navigation.

---

## Score Consistency Fix (Post-Day 4)

**Symptom:** Same PDF uploaded three times produced scores of 60 and 92.

**Root causes:**
1. `temperature: 0.1` in the Gemini call — non-zero temperature means LLM output is sampled, not deterministic. Small clause classification differences (one clause switching from "medium" to "high") cascade into large score changes via the multiplier formula.
2. Hybrid score logic — final score was either Gemini's self-reported `risk_score` or a formula result, depending on whether they were within 20 of each other. This introduced a second source of variance.

**Fixes:**

`src/lib/gemini.ts` — temperature set to 0:
```ts
generationConfig: {
  temperature: 0,
  maxOutputTokens: 8192,
}
```

`src/app/api/scan/route.ts` — score computed entirely from clause severities, Gemini's self-reported score ignored:
```ts
const finalScore = Math.min(100, high * 20 + medium * 8 + low * 2);
```

Score formula: `min(100, high×20 + medium×8 + low×2)`. 5 high clauses = 100. Score is now a pure function of clause severities — identical clause sets always produce identical scores.

---

## Files Changed

| File | Change |
|---|---|
| `src/components/ContractViewer.tsx` | New — shared state wrapper for PDFViewer + RiskPanel |
| `src/components/PDFViewer.tsx` | Added controlled `currentPage`, `onPageChange`, `onTextExtracted` props; `extractPageTexts` helper |
| `src/components/RiskPanel.tsx` | Pre-Day 4 polish (counts, combinable filters, empty state); Clause Jump (`findClausePage`, `activeClauseIndex`, `targetPages`, `ClauseCard` active state); CSS shorthand fix |
| `src/components/DeleteContractButton.tsx` | Removed `router.refresh()` after `router.push()` |
| `src/app/dashboard/contracts/[id]/page.tsx` | Added `risk_json → clauses` mapping; replaced two-panel layout with `<ContractViewer>` |
| `src/lib/gemini.ts` | `temperature: 0` |
| `src/app/api/scan/route.ts` | Deterministic score formula; removed hybrid Gemini-score logic |

---

## Definition of Done

- [x] ContractViewer manages shared `currentPage` and `pageTexts` state
- [x] PDFViewer accepts controlled `currentPage` prop
- [x] PDFViewer extracts page texts after document load
- [x] Clicking a clause card jumps the PDF to the correct page
- [x] Active clause card has visible indigo highlight state
- [x] "Click any clause to jump to it in the PDF" hint visible when texts are loaded
- [x] Category + severity filters are combinable and show accurate counts
- [x] Empty state with clear-filters action
- [x] No CSS console warnings
- [x] Delete contract navigates cleanly without hanging
- [x] Score is deterministic for identical clause sets
- [x] Build passes with zero TypeScript errors

---

## Deferred

- PDF inline highlights — blocked by `react-pdf-highlighter-plus` requiring `pdfjs-dist ^4.x` (project uses v5). Deferred to post-MVP.

---

## Next

Day 5 — Dashboard scan history, polish, server-side free-tier gate (`users.scans_used` enforced in `/api/scan`).
