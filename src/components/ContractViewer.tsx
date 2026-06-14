"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PDFViewer } from "@/components/PDFViewer";
import { RiskPanel } from "@/components/RiskPanel";
import { DeleteContractButton } from "@/components/DeleteContractButton";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ShieldCheck } from "lucide-react";

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

const statusStyles: Record<string, React.CSSProperties> = {
  pending:  { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", border: "0.5px solid rgba(255,255,255,0.1)" },
  scanning: { background: "rgba(91,79,255,0.1)", color: "#818cf8", border: "0.5px solid rgba(91,79,255,0.2)" },
  complete: { background: "rgba(52,199,89,0.1)", color: "#34c759", border: "0.5px solid rgba(52,199,89,0.2)" },
  error:    { background: "rgba(255,77,77,0.1)", color: "#ff4d4d", border: "0.5px solid rgba(255,77,77,0.2)" },
};

function scoreBadgeColor(score: number) {
  if (score <= 29) return "#34c759";
  if (score <= 69) return "#ff9500";
  return "#ff4d4d";
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

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const statusStyle = statusStyles[contractStatus] ?? statusStyles.pending;

  // ── Slim header (52px, shared across mobile and desktop) ──────────
  const SlimHeader = (
    <header
      style={{
        height: 52, flexShrink: 0,
        background: "rgba(6,6,9,0.9)", backdropFilter: "blur(12px)",
        borderBottom: "0.5px solid rgba(255,255,255,0.06)",
        padding: "0 24px", position: "sticky", top: 0, zIndex: 50,
        display: "flex", alignItems: "center", gap: 12,
      }}
    >
      {/* Back */}
      <button
        onClick={() => router.push("/dashboard")}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer",
          color: "rgba(255,255,255,0.4)", fontSize: 13, padding: 0,
          flexShrink: 0, transition: "color 0.15s",
          fontFamily: "inherit",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.4)"; }}
      >
        <ChevronLeft size={14} />
        Contracts
      </button>

      {/* Title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 15, fontWeight: 500, color: "#fff",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            display: "block",
          }}
        >
          {contractTitle}
        </span>
      </div>

      {/* Status badge */}
      <span
        style={{
          ...statusStyle,
          fontSize: 11, fontWeight: 500, borderRadius: 6,
          padding: "3px 9px", textTransform: "capitalize", flexShrink: 0,
        }}
      >
        {contractStatus}
      </span>
    </header>
  );

  if (isMobile) {
    return (
      <div style={{ position: "relative", height: "100vh", display: "flex", flexDirection: "column" }}>
        {SlimHeader}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <PDFViewer
            fileUrl={pdfUrl}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onTextExtracted={setPageTexts}
            isScanning={isScanning}
          />
        </div>

        <Sheet>
          <SheetTrigger
            style={{
              position: "fixed", bottom: 24, right: 24, zIndex: 50,
              background: "#5b4fff", border: "none", borderRadius: "50%",
              width: 52, height: 52, display: "flex", alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 20px rgba(91,79,255,0.5)", cursor: "pointer",
            }}
          >
            <ShieldCheck size={22} color="white" />
            {initialScan && (
              <span
                style={{
                  position: "absolute", top: -4, right: -4,
                  background: scoreBadgeColor(initialScan.risk_score),
                  color: "#000", fontSize: 9, fontWeight: 700,
                  borderRadius: 9999, padding: "2px 5px",
                  minWidth: 18, textAlign: "center",
                }}
              >
                {initialScan.risk_score}
              </span>
            )}
          </SheetTrigger>
          <SheetContent
            side="bottom"
            style={{
              background: "#0a0a12", border: "0.5px solid rgba(255,255,255,0.08)",
              borderRadius: "20px 20px 0 0", maxHeight: "80vh", overflowY: "auto", padding: 0,
            }}
          >
            <div style={{ padding: "1.5rem" }}>
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
              />
              <div style={{ background: "rgba(255,255,255,0.015)", border: "0.5px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "1rem", marginTop: 16 }}>
                <p style={{ fontSize: 11.5, fontWeight: 500, color: "rgba(255,255,255,0.25)", marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>
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
      {SlimHeader}

      <div style={{ display: "flex", flex: 1, overflow: "hidden", height: "calc(100vh - 52px)" }}>
        {/* PDF panel — 60% */}
        <div style={{ flex: "0 0 60%", overflow: "hidden", borderRight: "0.5px solid rgba(255,255,255,0.06)" }}>
          <PDFViewer
            fileUrl={pdfUrl}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onTextExtracted={setPageTexts}
            isScanning={isScanning}
          />
        </div>

        {/* Risk panel — 40% */}
        <div style={{ flex: "0 0 40%", overflowY: "auto", padding: "24px", background: "#060609", display: "flex", flexDirection: "column", gap: 12 }}>
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
          />
          <div style={{ background: "rgba(255,255,255,0.015)", border: "0.5px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "1rem", marginTop: 4 }}>
            <p style={{ fontSize: 11.5, fontWeight: 500, color: "rgba(255,255,255,0.25)", marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Danger zone
            </p>
            <DeleteContractButton contractId={contractId} />
          </div>
        </div>
      </div>
    </div>
  );
}
