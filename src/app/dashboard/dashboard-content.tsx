"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, MessageSquare, PenLine, Upload, Shield } from "lucide-react";
import { UploadZone } from "@/components/UploadZone";
import { ContractRow } from "@/components/ContractRow";

interface Contract {
  id: string;
  title: string;
  status: string;
  created_at: string;
  file_url: string;
  scans?: { risk_score: number; scanned_at: string }[];
}

const featureCards = [
  { Icon: Search, label: "Risk detection" },
  { Icon: MessageSquare, label: "Plain English" },
  { Icon: PenLine, label: "Safer rewrites" },
];

function scoreColor(score: number) {
  if (score <= 29) return "#34c759";
  if (score <= 69) return "#ff9500";
  return "#ff4d4d";
}

function PillUploadButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        background: "linear-gradient(135deg, #5b4fff, #7c3aed)",
        border: "none", borderRadius: 980,
        padding: "10px 20px", fontSize: 14, fontWeight: 600,
        color: "white", cursor: "pointer",
        boxShadow: "0 4px 20px rgba(91,79,255,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
        transition: "opacity 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.85"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
    >
      <Upload size={15} />
      Upload contract
    </button>
  );
}

function UploadTrigger({ label, style }: { label: string; style?: React.CSSProperties }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") return;
    if (file.size > 10 * 1024 * 1024) return;
    const { uploadContract } = await import("@/app/actions/contracts");
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadContract(formData);
    if (result.data) router.push(`/dashboard/contracts/${result.data.id}`);
  }

  return (
    <>
      <button
        onClick={() => fileInputRef.current?.click()}
        style={style}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.85"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
      >
        <Upload size={15} />
        {label}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </>
  );
}

export function DashboardContent({
  email,
  contracts,
}: {
  email: string;
  initials: string;
  contracts: Contract[];
}) {
  const hasContracts = contracts.length > 0;

  // Stat computations
  const scoresAll = contracts.flatMap((c) => c.scans?.map((s) => s.risk_score) ?? []);
  const avgScore = scoresAll.length > 0
    ? Math.round(scoresAll.reduce((a, b) => a + b, 0) / scoresAll.length)
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "#060609" }}>

      {hasContracts ? (
        <div style={{ padding: "40px 40px 40px 40px" }}>
          {/* Page header */}
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 32, fontWeight: 600, color: "#fff", letterSpacing: "-0.03em", marginBottom: 6 }}>
              Dashboard
            </h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>
              Your contract risk overview
            </p>
          </div>

          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
            {/* Total contracts */}
            <div
              className="glass-card"
              style={{ height: 120, padding: 24, display: "flex", flexDirection: "column", justifyContent: "space-between" }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(91,79,255,0.9)" }}>
                Total Contracts
              </span>
              <span style={{ fontSize: 48, fontWeight: 700, letterSpacing: "-0.04em", color: "#fff", lineHeight: 1 }}>
                {contracts.length}
              </span>
            </div>

            {/* Average risk score */}
            <div
              className="glass-card"
              style={{ height: 120, padding: 24, display: "flex", flexDirection: "column", justifyContent: "space-between" }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(91,79,255,0.9)" }}>
                Average Risk Score
              </span>
              <span
                style={{
                  fontSize: 48, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1,
                  color: avgScore !== null ? scoreColor(avgScore) : "rgba(255,255,255,0.3)",
                }}
              >
                {avgScore !== null ? avgScore : "—"}
              </span>
            </div>

            {/* High risk clauses */}
            <div
              className="glass-card"
              style={{ height: 120, padding: 24, display: "flex", flexDirection: "column", justifyContent: "space-between" }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(91,79,255,0.9)" }}>
                High Risk Clauses
              </span>
              <span style={{ fontSize: 48, fontWeight: 700, letterSpacing: "-0.04em", color: "#ff4d4d", lineHeight: 1 }}>
                —
              </span>
            </div>
          </div>

          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontSize: 28, fontWeight: 600, color: "#fff", letterSpacing: "-0.03em" }}>
              Your contracts
            </h2>
            <UploadTrigger
              label="Upload contract"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "linear-gradient(135deg, #5b4fff, #7c3aed)",
                border: "none", borderRadius: 980,
                padding: "10px 20px", fontSize: 14, fontWeight: 600,
                color: "white", cursor: "pointer",
                boxShadow: "0 4px 20px rgba(91,79,255,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
                transition: "opacity 0.15s",
              }}
            />
          </div>

          {/* Contract rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {contracts.map((contract) => (
              <ContractRow key={contract.id} contract={contract} />
            ))}
          </div>
        </div>
      ) : (
        /* Empty state */
        <div
          style={{
            minHeight: "calc(100vh - 0px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px",
            gap: 0,
          }}
        >
          {/* Glow icon */}
          <div
            className="glow-pulse"
            style={{
              width: 80, height: 80, borderRadius: 20,
              background: "rgba(91,79,255,0.1)",
              border: "0.5px solid rgba(91,79,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <Shield size={32} color="#5b4fff" strokeWidth={1.5} />
          </div>

          <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.03em", textAlign: "center", marginBottom: 12, color: "#fff" }}>
            Upload your first contract
          </h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", textAlign: "center", maxWidth: 420, margin: "0 auto 32px" }}>
            Drop any PDF contract and get an instant AI risk report in plain English.
          </p>

          <UploadTrigger
            label="Upload contract"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "linear-gradient(135deg, #5b4fff, #7c3aed)",
              border: "none", borderRadius: 980,
              padding: "14px 32px", fontSize: 15, fontWeight: 600,
              color: "white", cursor: "pointer", maxWidth: 280, width: "100%",
              boxShadow: "0 4px 20px rgba(91,79,255,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
              marginBottom: 40, transition: "opacity 0.15s",
            }}
          />

          {/* Feature cards */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            {featureCards.map(({ Icon, label }) => (
              <div
                key={label}
                style={{
                  width: 130, padding: 14,
                  background: "rgba(255,255,255,0.025)",
                  border: "0.5px solid rgba(255,255,255,0.06)",
                  borderRadius: 14,
                }}
              >
                <div
                  style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: "rgba(91,79,255,0.1)",
                    border: "0.5px solid rgba(91,79,255,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 10,
                  }}
                >
                  <Icon size={14} color="#818cf8" />
                </div>
                <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.5)", lineHeight: 1.4 }}>
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
