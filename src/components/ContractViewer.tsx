"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PDFViewer } from "@/components/PDFViewer";
import { RiskPanel } from "@/components/RiskPanel";
import { DeleteContractButton } from "@/components/DeleteContractButton";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { exportScanReport } from "@/lib/export-pdf";
import {
  type PositionedTextItem,
  type HighlightRect,
  findClausePage,
  findBestRectsAcrossPages,
} from "@/lib/pdf-positions";

type Clause = {
  text: string;
  category: "payment_terms" | "liability" | "auto_renewal" | "IP" | "termination" | "other";
  severity: "high" | "medium" | "low";
  explanation: string;
  rewrite: string;
};

type ScanResult = {
  id: string;
  risk_score: number;
  summary: string;
  clauses: Clause[];
  tokens_used: number;
  scanned_at: string;
};

interface ContractViewerProps {
  pdfUrl: string;
  contractId: string;
  contractTitle: string;
  contractStatus: string;
  userEmail: string;
  initialScan: ScanResult | null;
  initiallyScanning?: boolean;
}

const statusBadgeStyle: Record<string, React.CSSProperties> = {
  pending:  { background: "rgba(255,255,255,0.05)", color: "var(--tx-secondary)", border: "1px solid var(--bd-default)" },
  scanning: { background: "rgba(255,149,0,0.08)", color: "var(--ac-lite)", border: "1px solid rgba(255,149,0,0.2)" },
  complete: { background: "var(--rl-bg)", color: "var(--rl)", border: "1px solid var(--rl-bd)" },
  error:    { background: "var(--rh-bg)", color: "var(--rh)", border: "1px solid var(--rh-bd)" },
};

function ShieldIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
      <path d="M10 2l-7 3v5c0 4.5 3 8.5 7 9.5 4-1 7-5 7-9.5V5l-7-3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  );
}

export default function ContractViewer({
  pdfUrl,
  contractId,
  contractTitle,
  contractStatus,
  userEmail,
  initialScan,
  initiallyScanning,
}: ContractViewerProps) {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(!!initiallyScanning);
  const [isMobile, setIsMobile] = useState(false);
  const [currentScan, setCurrentScan] = useState<ScanResult | null>(initialScan);
  const [rescanFn, setRescanFn] = useState<(() => void) | null>(null);

  // Highlighting state
  const [allPositionedItems, setAllPositionedItems] = useState<PositionedTextItem[][]>([]);
  const [activeClauseId, setActiveClauseId] = useState<string | null>(null);
  // When a highlight rect is clicked, this tells RiskPanel to scroll to that clause card
  const [externalScrollIdx, setExternalScrollIdx] = useState<number | null>(null);

  // Compute clause→rect mapping once when scan + positioned items are both ready
  const clauseRects = useMemo(() => {
    if (!currentScan?.clauses?.length || !allPositionedItems.length || !pageTexts.length) return {};
    const result: Record<string, HighlightRect[]> = {};
    currentScan.clauses.forEach((clause, idx) => {
      const clauseId = `clause-${idx}`;
      const targetPage = findClausePage(clause.text, pageTexts);
      result[clauseId] = findBestRectsAcrossPages(clause.text, allPositionedItems, targetPage);
    });
    return result;
  }, [currentScan?.clauses, allPositionedItems, pageTexts]);

  // Filter down to rects on the currently visible page
  const rectsForCurrentPage = useMemo(() => {
    const rects: HighlightRect[] = [];
    const clauseIds: string[] = [];
    const severities: string[] = [];
    Object.entries(clauseRects).forEach(([clauseId, clauseRectList]) => {
      clauseRectList
        .filter((r) => r.page === currentPage)
        .forEach((r) => {
          rects.push(r);
          clauseIds.push(clauseId);
          const clauseIdx = parseInt(clauseId.split("-")[1]);
          severities.push(currentScan?.clauses[clauseIdx]?.severity ?? "low");
        });
    });
    return { rects, clauseIds, severities };
  }, [clauseRects, currentPage, currentScan]);

  // Clause card clicked → set active highlight
  const handleClauseActivated = useCallback((idx: number) => {
    setActiveClauseId(`clause-${idx}`);
  }, []);

  // Highlight rect clicked → set active + scroll RiskPanel to that clause card
  const handleHighlightClick = useCallback((clauseId: string) => {
    setActiveClauseId(clauseId);
    const idx = parseInt(clauseId.split("-")[1]);
    if (!isNaN(idx)) setExternalScrollIdx(idx);
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const statusStyle = statusBadgeStyle[contractStatus] ?? statusBadgeStyle.pending;
  const isComplete = currentScan !== null;

  const TopBar = (
    <header style={{
      flexShrink: 0,
      background: "var(--bg-sidebar)",
      borderBottom: "1px solid var(--bd-subtle)",
      padding: "0 24px",
      height: 52,
      display: "flex", alignItems: "center", gap: 12,
      position: "sticky", top: 0, zIndex: 50,
    }}>
      {/* Back */}
      <button
        onClick={() => router.push("/dashboard")}
        className="btn btn-ghost btn-sm"
        style={{ gap: 6, flexShrink: 0 }}
      >
        <svg viewBox="0 0 16 16" fill="none" width="13" height="13">
          <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back
      </button>

      {/* Divider */}
      <div style={{ width: 1, height: 20, background: "var(--bd-subtle)", flexShrink: 0 }} />

      {/* Title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 15, fontWeight: 700, color: "var(--tx-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          display: "block",
        }}>
          {contractTitle}
        </span>
      </div>

      {/* Status badge */}
      <span style={{
        ...statusStyle,
        fontSize: 11, fontWeight: 600, borderRadius: 99,
        padding: "3px 10px", textTransform: "capitalize",
        letterSpacing: "0.03em", flexShrink: 0,
      }}>
        {contractStatus}
      </span>

      {/* Action buttons (when scan complete) */}
      {isComplete && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => currentScan && exportScanReport(currentScan, contractTitle)}
            style={{ gap: 6 }}
          >
            <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
              <path d="M8 2v8M4 10l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            PDF Report
          </button>
          <button
            className="btn btn-ghost btn-sm"
            disabled
            title="Coming soon"
            style={{ gap: 6, opacity: 0.4, cursor: "not-allowed" }}
          >
            Word Doc
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => rescanFn?.()}
            style={{ color: "var(--ac-lite)", borderColor: "rgba(255,149,0,0.25)", gap: 6 }}
          >
            <svg viewBox="0 0 16 16" fill="none" width="12" height="12">
              <path d="M2 8a6 6 0 116 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M2 8V4M2 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Re-analyse
          </button>
        </div>
      )}
    </header>
  );

  if (isMobile) {
    return (
      <div style={{ position: "relative", height: "100vh", display: "flex", flexDirection: "column" }}>
        {TopBar}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <PDFViewer
            fileUrl={pdfUrl}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onTextExtracted={setPageTexts}
            onPositionedTextExtracted={setAllPositionedItems}
            isScanning={isScanning}
            highlightRects={rectsForCurrentPage.rects}
            highlightClauseIds={rectsForCurrentPage.clauseIds}
            highlightSeverities={rectsForCurrentPage.severities}
            activeClauseId={activeClauseId}
            onHighlightClick={handleHighlightClick}
          />
        </div>

        <Sheet>
          <SheetTrigger
            style={{
              position: "fixed", bottom: 24, right: 24, zIndex: 50,
              background: "var(--ac)", border: "none", borderRadius: "50%",
              width: 52, height: 52, display: "flex", alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 20px rgba(255,149,0,0.4)", cursor: "pointer",
              color: "#000",
            }}
          >
            <ShieldIcon />
            {currentScan && (
              <span style={{
                position: "absolute", top: -4, right: -4,
                background: currentScan.risk_score >= 70 ? "var(--rh)" : "var(--ac)",
                color: "#000", fontSize: 9, fontWeight: 700,
                borderRadius: 9999, padding: "2px 5px",
                minWidth: 18, textAlign: "center",
              }}>
                {currentScan.risk_score}
              </span>
            )}
          </SheetTrigger>
          <SheetContent
            side="bottom"
            style={{
              background: "var(--bg-surface)", border: "1px solid var(--bd-subtle)",
              borderRadius: "20px 20px 0 0", maxHeight: "80vh", overflowY: "auto", padding: 0,
            }}
          >
            <div style={{ padding: "18px 22px" }}>
              <RiskPanel
                contractId={contractId}
                contractTitle={contractTitle}
                userEmail={userEmail}
                initialScan={initialScan}
                initiallyScanning={initiallyScanning}
                pageTexts={pageTexts}
                onClauseClick={(page) => setCurrentPage(page)}
                onScanStart={() => setIsScanning(true)}
                onScanEnd={() => setIsScanning(false)}
                onScanComplete={(scan) => setCurrentScan(scan)}
                onRegisterRescan={(fn) => setRescanFn(() => fn)}
                externalActiveClauseIndex={externalScrollIdx}
                onClauseActivated={handleClauseActivated}
              />
              <div style={{ marginTop: 20, padding: "12px 0", borderTop: "1px solid var(--bd-subtle)" }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-muted)", marginBottom: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Danger zone
                </p>
                <DeleteContractButton contractId={contractId} />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  // Desktop
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {TopBar}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* PDF panel — 42% */}
        <div style={{
          flex: "0 0 42%", overflow: "hidden", position: "relative",
          borderRight: "1px solid var(--bd-subtle)",
          background: "#080A14",
        }}>
          <PDFViewer
            fileUrl={pdfUrl}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onTextExtracted={setPageTexts}
            onPositionedTextExtracted={setAllPositionedItems}
            isScanning={isScanning}
            highlightRects={rectsForCurrentPage.rects}
            highlightClauseIds={rectsForCurrentPage.clauseIds}
            highlightSeverities={rectsForCurrentPage.severities}
            activeClauseId={activeClauseId}
            onHighlightClick={handleHighlightClick}
          />
        </div>

        {/* Right panel — 58% */}
        <div style={{
          flex: 1, overflowY: "auto", background: "var(--bg-surface)",
          display: "flex", flexDirection: "column",
        }}>
          <div style={{ flex: 1, padding: "18px 22px", minHeight: 0 }}>
            <RiskPanel
              contractId={contractId}
              contractTitle={contractTitle}
              userEmail={userEmail}
              initialScan={initialScan}
              initiallyScanning={initiallyScanning}
              pageTexts={pageTexts}
              onClauseClick={setCurrentPage}
              onScanStart={() => setIsScanning(true)}
              onScanEnd={() => setIsScanning(false)}
              onScanComplete={(scan) => setCurrentScan(scan)}
              onRegisterRescan={(fn) => setRescanFn(() => fn)}
              externalActiveClauseIndex={externalScrollIdx}
              onClauseActivated={handleClauseActivated}
            />
          </div>
          <div style={{ padding: "14px 22px 18px", borderTop: "1px solid var(--bd-subtle)" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--tx-muted)", marginBottom: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Danger zone
            </p>
            <DeleteContractButton contractId={contractId} />
          </div>
        </div>
      </div>
    </div>
  );
}
