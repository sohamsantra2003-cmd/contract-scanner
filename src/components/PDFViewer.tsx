"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PDFViewerProps {
  fileUrl: string;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onTextExtracted?: (texts: string[]) => void;
  isScanning?: boolean;
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

export function PDFViewer({
  fileUrl,
  currentPage,
  onPageChange,
  onTextExtracted,
  isScanning = false,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [internalPage, setInternalPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [loadError, setLoadError] = useState<boolean>(false);

  const onTextExtractedRef = useRef(onTextExtracted);
  useEffect(() => { onTextExtractedRef.current = onTextExtracted; }, [onTextExtracted]);

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
  }, []);

  if (loadError) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
        Could not load PDF. The file may be corrupted.
      </div>
    );
  }

  return (
    <div style={{ height: "100%", background: "#0a0a12", position: "relative", display: "flex", flexDirection: "column" }}>
      {/* MRI scan overlay — visible during scanning */}
      {isScanning && (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 5 }}>
          <div className="mri-line" />
          <div className="mri-glow" />
          <div style={{ position: "absolute", inset: 0, background: "rgba(6,6,9,0.4)" }} />
          <span
            style={{
              position: "absolute", bottom: 60, right: 16,
              fontSize: 11, color: "rgba(255,255,255,0.4)",
              fontFamily: "SF Mono, ui-monospace, monospace",
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
        style={{ overflowY: "auto", display: "flex", justifyContent: "center", padding: "20px 16px 80px", background: "#0d0d14", flex: 1 }}
      >
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={() => setLoadError(true)}
          loading={
            <Skeleton style={{ width: 595, height: 600, borderRadius: 6, background: "rgba(255,255,255,0.04)" }} />
          }
        >
          <Page
            pageNumber={internalPage}
            scale={scale}
            renderTextLayer
            renderAnnotationLayer
            loading={
              <Skeleton style={{ width: 595 * scale, height: 842 * scale, borderRadius: 6, background: "rgba(255,255,255,0.04)" }} />
            }
          />
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
