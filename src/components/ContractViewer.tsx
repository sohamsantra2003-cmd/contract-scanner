"use client";

import { useState } from "react";
import { PDFViewer } from "@/components/PDFViewer";
import { RiskPanel } from "@/components/RiskPanel";
import { DeleteContractButton } from "@/components/DeleteContractButton";

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
  initialScan: ScanResult | null;
}

export default function ContractViewer({
  pdfUrl,
  contractId,
  initialScan,
}: ContractViewerProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageTexts, setPageTexts] = useState<string[]>([]);

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
          initialScan={initialScan}
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
