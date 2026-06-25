"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PDFHighlightOverlay } from "@/components/PDFHighlightOverlay";
import { extractPositionedItems, type PositionedTextItem, type HighlightRect } from "@/lib/pdf-positions";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PDFViewerProps {
  fileUrl: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onTextExtracted?: (texts: string[]) => void;
  onPositionedTextExtracted?: (pages: PositionedTextItem[][]) => void;
  isScanning?: boolean;
  // Highlight overlay props — all optional; no overlay rendered if rects is empty
  highlightRects?: HighlightRect[];
  highlightClauseIds?: string[];
  highlightSeverities?: string[];
  activeClauseId?: string | null;
  onHighlightClick?: (clauseId: string) => void;
}

async function extractPageTexts(
  pdf: { numPages: number; getPage: (n: number) => Promise<any> },
  onExtracted: (texts: string[]) => void
) {
  try {
    const texts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = (content.items as any[]).map((item: any) => item.str ?? "").join(" ");
        texts.push(text);
      } catch {
        texts.push("");
      }
    }
    onExtracted(texts);
  } catch {
    // non-critical
  }
}

async function extractAllPositionedItems(
  pdf: { numPages: number; getPage: (n: number) => Promise<any> },
  onExtracted: (pages: PositionedTextItem[][]) => void
) {
  try {
    const allPages: PositionedTextItem[][] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const items = await extractPositionedItems(page);
        allPages.push(items);
      } catch {
        allPages.push([]);
      }
    }
    // TODO: remove this log once highlighting is confirmed working
    console.log("[PDFHighlight] Page 1 item count:", allPages[0]?.length ?? 0, "sample:", allPages[0]?.[0]);
    onExtracted(allPages);
  } catch {
    // non-critical
  }
}

export function PDFViewer({
  fileUrl,
  currentPage,
  onPageChange,
  onTextExtracted,
  onPositionedTextExtracted,
  isScanning = false,
  highlightRects = [],
  highlightClauseIds = [],
  highlightSeverities = [],
  activeClauseId = null,
  onHighlightClick,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [internalPage, setInternalPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [loadError, setLoadError] = useState<boolean>(false);

  const onTextExtractedRef = useRef(onTextExtracted);
  useEffect(() => { onTextExtractedRef.current = onTextExtracted; }, [onTextExtracted]);

  const onPositionedTextExtractedRef = useRef(onPositionedTextExtracted);
  useEffect(() => { onPositionedTextExtractedRef.current = onPositionedTextExtracted; }, [onPositionedTextExtracted]);

  useEffect(() => {
    if (currentPage !== undefined && currentPage !== internalPage) {
      setInternalPage(currentPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const goToPage = (page: number) => { setInternalPage(page); onPageChange?.(page); };
  const prevPage = () => goToPage(Math.max(1, internalPage - 1));
  const nextPage = () => goToPage(Math.min(numPages, internalPage + 1));
  const zoomIn = () => setScale((s) => Math.min(2.0, +(s + 0.25).toFixed(2)));
  const zoomOut = () => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)));

  const onDocumentLoadSuccess = useCallback((pdf: any) => {
    setNumPages(pdf.numPages);
    setInternalPage(1);
    if (onTextExtractedRef.current) extractPageTexts(pdf, onTextExtractedRef.current);
    if (onPositionedTextExtractedRef.current) extractAllPositionedItems(pdf, onPositionedTextExtractedRef.current);
  }, []);

  if (loadError) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
        Could not load PDF. The file may be corrupted.
      </div>
    );
  }

  return (
    <div style={{ height: "100%", background: "#080A14", position: "relative", display: "flex", flexDirection: "column" }}>
      {/* Amber scan bar — visible during scanning */}
      {isScanning && (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 5 }}>
          <div className="scan-bar" />
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.3)" }} />
          <span
            style={{
              position: "absolute", bottom: 60, right: 16,
              fontSize: 11, color: "rgba(255,255,255,0.4)",
              fontFamily: "var(--ff-mono)",
              letterSpacing: "0.04em",
            }}
          >
            Analysing with Gemini...
          </span>
        </div>
      )}

      {/* Scrollable PDF area */}
      <div
        className="flex-1"
        style={{ overflowY: "auto", display: "flex", justifyContent: "center", padding: "20px 16px 80px", background: "#080A14", flex: 1 }}
      >
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={() => setLoadError(true)}
          loading={
            <Skeleton style={{ width: 595, height: 600, borderRadius: 6, background: "rgba(255,255,255,0.04)" }} />
          }
        >
          <div style={{ position: "relative", display: "inline-block" }}>
            <Page
              pageNumber={internalPage}
              scale={scale}
              renderTextLayer
              renderAnnotationLayer
              loading={
                <Skeleton style={{ width: 595 * scale, height: 842 * scale, borderRadius: 6, background: "rgba(255,255,255,0.04)" }} />
              }
            />
            <PDFHighlightOverlay
              rects={highlightRects}
              scale={scale}
              activeClauseId={activeClauseId}
              rectClauseIds={highlightClauseIds}
              rectSeverities={highlightSeverities}
              onRectClick={onHighlightClick}
            />
          </div>
        </Document>
      </div>

      {/* Navigation bar */}
      <div
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 48,
          background: "rgba(6,6,9,0.95)", backdropFilter: "blur(12px)",
          borderTop: "0.5px solid rgba(255,255,255,0.06)",
          padding: "0 16px", zIndex: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={prevPage} disabled={internalPage <= 1} style={navBtnStyle(internalPage <= 1)}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", minWidth: 80, textAlign: "center" }}>
            Page {internalPage} of {numPages || "—"}
          </span>
          <button onClick={nextPage} disabled={internalPage >= numPages} style={navBtnStyle(internalPage >= numPages)}>
            <ChevronRight size={14} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: "0.5px", height: 16, background: "rgba(255,255,255,0.08)" }} />
          <button onClick={zoomOut} disabled={scale <= 0.5} style={navBtnStyle(scale <= 0.5)}>
            <ZoomOut size={13} />
          </button>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", minWidth: 42, textAlign: "center" }}>
            {Math.round(scale * 100)}%
          </span>
          <button onClick={zoomIn} disabled={scale >= 2.0} style={navBtnStyle(scale >= 2.0)}>
            <ZoomIn size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 28, height: 28, borderRadius: 7,
    border: "0.5px solid rgba(255,255,255,0.07)",
    background: "rgba(255,255,255,0.03)",
    color: disabled ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.5)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}
