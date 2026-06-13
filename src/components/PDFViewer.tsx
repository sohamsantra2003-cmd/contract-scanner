"use client";

import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PDFViewerProps {
  fileUrl: string;
}

export function PDFViewer({ fileUrl }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [loadError, setLoadError] = useState<boolean>(false);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setCurrentPage(1);
    },
    []
  );

  const prevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const nextPage = () => setCurrentPage((p) => Math.min(numPages, p + 1));
  const zoomIn = () => setScale((s) => Math.min(2.0, +(s + 0.25).toFixed(2)));
  const zoomOut = () => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)));

  if (loadError) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: 400, color: "rgba(255,255,255,0.3)", fontSize: 13 }}
      >
        Could not load PDF. The file may be corrupted.
      </div>
    );
  }

  return (
    <div
      className="flex flex-col"
      style={{ height: "100%", background: "#07070d", position: "relative" }}
    >
      {/* Scrollable PDF area */}
      <div
        className="flex-1 overflow-y-auto flex justify-center"
        style={{ padding: "20px 16px 80px", background: "#0d0d14" }}
      >
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={() => setLoadError(true)}
          loading={
            <Skeleton
              style={{ width: 595, height: 600, borderRadius: 6, background: "rgba(255,255,255,0.04)" }}
            />
          }
        >
          <Page
            pageNumber={currentPage}
            scale={scale}
            renderTextLayer
            renderAnnotationLayer
            loading={
              <Skeleton
                style={{ width: 595 * scale, height: 842 * scale, borderRadius: 6, background: "rgba(255,255,255,0.04)" }}
              />
            }
          />
        </Document>
      </div>

      {/* Navigation bar — pinned to bottom */}
      <div
        className="flex items-center justify-between"
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 48,
          background: "rgba(7,7,13,0.95)",
          backdropFilter: "blur(12px)",
          borderTop: "0.5px solid rgba(255,255,255,0.06)",
          padding: "0 16px",
          zIndex: 10,
        }}
      >
        {/* Page navigation */}
        <div className="flex items-center" style={{ gap: 8 }}>
          <button
            onClick={prevPage}
            disabled={currentPage <= 1}
            style={navBtnStyle(currentPage <= 1)}
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", minWidth: 80, textAlign: "center" }}>
            Page {currentPage} of {numPages || "—"}
          </span>
          <button
            onClick={nextPage}
            disabled={currentPage >= numPages}
            style={navBtnStyle(currentPage >= numPages)}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center" style={{ gap: 8 }}>
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
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 7,
    border: "0.5px solid rgba(255,255,255,0.07)",
    background: "rgba(255,255,255,0.03)",
    color: disabled ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.5)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}
