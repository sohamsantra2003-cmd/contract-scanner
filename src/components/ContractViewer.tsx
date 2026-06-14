"use client";

import { useState, useEffect } from "react";
import { PDFViewer } from "@/components/PDFViewer";
import { RiskPanel } from "@/components/RiskPanel";
import { DeleteContractButton } from "@/components/DeleteContractButton";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  userEmail: string;
  initialScan: ScanResult | null;
  initiallyScanning?: boolean;
}

function scoreBadgeColor(score: number) {
  if (score <= 29) return "#4ade80";
  if (score <= 69) return "#fbbf24";
  return "#f87171";
}

export default function ContractViewer({
  pdfUrl,
  contractId,
  contractTitle,
  userEmail,
  initialScan,
  initiallyScanning,
}: ContractViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (isMobile) {
    return (
      <div style={{ position: "relative", height: "100vh" }}>
        <PDFViewer
          fileUrl={pdfUrl}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onTextExtracted={setPageTexts}
        />

        <Sheet>
          <SheetTrigger
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              zIndex: 50,
              background: "#4f46e5",
              border: "none",
              borderRadius: "50%",
              width: 52,
              height: 52,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 20px rgba(79,70,229,0.5)",
              cursor: "pointer",
            }}
          >
            <ShieldCheck size={22} color="white" />
            {initialScan && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  background: scoreBadgeColor(initialScan.risk_score),
                  color: "#000",
                  fontSize: 9,
                  fontWeight: 700,
                  borderRadius: 9999,
                  padding: "2px 5px",
                  minWidth: 18,
                  textAlign: "center",
                }}
              >
                {initialScan.risk_score}
              </span>
            )}
          </SheetTrigger>

          <SheetContent
            side="bottom"
            style={{
              background: "#0a0a0f",
              border: "0.5px solid rgba(255,255,255,0.08)",
              borderRadius: "20px 20px 0 0",
              maxHeight: "80vh",
              overflowY: "auto",
              padding: 0,
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
              />
              <div
                style={{
                  background: "rgba(255,255,255,0.015)",
                  border: "0.5px solid rgba(255,255,255,0.05)",
                  borderRadius: 12,
                  padding: "1rem",
                  marginTop: 16,
                }}
              >
                <p
                  style={{
                    fontSize: 11.5,
                    fontWeight: 500,
                    color: "rgba(255,255,255,0.25)",
                    marginBottom: 10,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
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

  // Desktop layout
  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>
      {/* PDF panel — 60% */}
      <div
        style={{
          flex: "0 0 60%",
          overflow: "hidden",
          borderRight: "0.5px solid rgba(255,255,255,0.06)",
        }}
      >
        <PDFViewer
          fileUrl={pdfUrl}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onTextExtracted={setPageTexts}
        />
      </div>

      {/* Risk panel — 40%, scrollable */}
      <div
        style={{
          flex: "0 0 40%",
          overflowY: "auto",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <RiskPanel
          contractId={contractId}
          contractTitle={contractTitle}
          userEmail={userEmail}
          initialScan={initialScan}
          initiallyScanning={initiallyScanning}
          pageTexts={pageTexts}
          onClauseClick={setCurrentPage}
        />

        {/* Danger zone */}
        <div
          style={{
            background: "rgba(255,255,255,0.015)",
            border: "0.5px solid rgba(255,255,255,0.05)",
            borderRadius: 12,
            padding: "1rem",
            marginTop: 4,
          }}
        >
          <p
            style={{
              fontSize: 11.5,
              fontWeight: 500,
              color: "rgba(255,255,255,0.25)",
              marginBottom: 10,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Danger zone
          </p>
          <DeleteContractButton contractId={contractId} />
        </div>
      </div>
    </div>
  );
}
