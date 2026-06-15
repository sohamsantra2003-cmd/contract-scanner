"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ContractRow } from "@/components/ContractRow";
import { UploadZone } from "@/components/UploadZone";

interface Contract {
  id: string;
  title: string;
  status: string;
  created_at: string;
  file_url: string;
  scans?: { risk_score: number; scanned_at: string }[];
}

function ShieldLogo({ size = 28 }: { size?: number }) {
  const id = "sl-dash-" + size;
  return (
    <svg width={size} height={Math.round(size * 1.17)} viewBox="0 0 24 28" fill="none">
      <defs>
        <linearGradient id={id} x1="2" y1="1" x2="22" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFD080" />
          <stop offset="100%" stopColor="#FF9500" />
        </linearGradient>
      </defs>
      <path d="M12 1L2 5.5V13c0 6.35 4.5 12.28 10 13.88C17.5 25.28 22 19.35 22 13V5.5L12 1z"
        fill={"url(#" + id + ")"} fillOpacity=".18" stroke={"url(#" + id + ")"} strokeWidth="1.4" strokeLinejoin="round" />
      <line x1="7.5" y1="12" x2="16.5" y2="12" stroke={"url(#" + id + ")"} strokeWidth="1.5" strokeLinecap="round" opacity=".95" />
      <line x1="7.5" y1="15.8" x2="14.2" y2="15.8" stroke={"url(#" + id + ")"} strokeWidth="1.5" strokeLinecap="round" opacity=".7" />
      <line x1="7.5" y1="19.5" x2="11.5" y2="19.5" stroke={"url(#" + id + ")"} strokeWidth="1.5" strokeLinecap="round" opacity=".45" />
    </svg>
  );
}

function scoreColor(score: number): string {
  if (score >= 70) return "#FF3B30";
  if (score >= 40) return "#FF9500";
  return "#30D158";
}

function StatCard({
  label, sub, value, color, hex, delay,
  icon,
}: {
  label: string;
  sub: string;
  value: string | number;
  color: string;
  hex: string;
  delay: number;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "28px 28px 24px", overflow: "hidden", position: "relative",
        borderTop: `1px solid ${hex}22`,
        animation: `countUp .42s ease ${delay}s both`,
      }}
    >
      {/* Background glow */}
      <div style={{
        position: "absolute", top: -40, right: -40,
        width: 130, height: 130, borderRadius: "50%",
        background: `radial-gradient(circle, ${hex}1A 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      {/* Icon */}
      <div style={{
        width: 40, height: 40, borderRadius: 12, marginBottom: 20,
        background: `${hex}18`, border: `1px solid ${hex}28`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color,
      }}>
        {icon}
      </div>

      {/* Big number */}
      <div style={{
        fontFamily: "var(--ff-mono)", fontSize: 64, fontWeight: 500,
        lineHeight: 0.95, letterSpacing: "-3px",
        color, textShadow: `0 0 30px ${hex}30`,
        marginBottom: 14,
      }}>
        {value}
      </div>

      <div style={{ fontWeight: 600, fontSize: 15, color: "var(--tx-primary)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: "var(--tx-muted)" }}>{sub}</div>
    </div>
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
  const [showUpload, setShowUpload] = useState(false);

  const completeContracts = contracts.filter((c) => c.status === "complete");
  const pendingContracts = contracts.filter((c) => c.status === "pending");
  const scoresAll = completeContracts.flatMap((c) => c.scans?.map((s) => s.risk_score) ?? []);
  const avgScore = scoresAll.length > 0
    ? Math.round(scoresAll.reduce((a, b) => a + b, 0) / scoresAll.length)
    : null;

  const totalHighClauses = 0;

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  if (contracts.length === 0 && !showUpload) {
    return (
      <div style={{ padding: "48px 40px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40 }}>
          <div>
            <h1 style={{ fontFamily: "var(--ff-display)", fontWeight: 800, fontSize: 32, letterSpacing: "-0.03em", color: "var(--tx-primary)", marginBottom: 5 }}>Dashboard</h1>
            <p style={{ fontSize: 13.5, color: "var(--tx-secondary)" }}>{today}</p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowUpload(true)}
            style={{ gap: 8 }}
          >
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
              <path d="M8 2v8M4 6l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Upload Contract
          </button>
        </div>

        {showUpload && (
          <div style={{ marginBottom: 32, animation: "fadeUp .2s ease both" }}>
            <UploadZone />
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 10 }}
              onClick={() => setShowUpload(false)}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Empty state */}
        <div className="card" style={{ padding: "60px 40px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20, opacity: 0.4 }}>
            <ShieldLogo size={64} />
          </div>
          <h2 style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 20, color: "var(--tx-primary)", marginBottom: 8 }}>
            No contracts yet
          </h2>
          <p style={{ fontSize: 14, color: "var(--tx-secondary)", marginBottom: 24 }}>
            Upload your first contract to get started.
          </p>
          <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
            Upload Contract
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "48px 40px" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: "var(--ff-display)", fontWeight: 800, fontSize: 32, letterSpacing: "-0.03em", color: "var(--tx-primary)", marginBottom: 5 }}>
            Dashboard
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--tx-secondary)" }}>{today}</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowUpload((v) => !v)}
          style={{ gap: 8 }}
        >
          <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
            <path d="M8 2v8M4 6l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Upload Contract
        </button>
      </div>

      {/* Upload zone */}
      {showUpload && (
        <div style={{ marginBottom: 24, animation: "fadeUp .2s ease both" }}>
          <UploadZone />
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 10 }}
            onClick={() => setShowUpload(false)}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
        <StatCard
          label="Contracts Scanned"
          sub={`${contracts.length} total · ${pendingContracts.length} pending`}
          value={completeContracts.length}
          color="#FF9500"
          hex="#FF9500"
          delay={0}
          icon={
            <svg viewBox="0 0 16 16" fill="none" width="18" height="18">
              <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <line x1="5" y1="9" x2="11" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <line x1="5" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          }
        />
        <StatCard
          label="Average Risk Score"
          sub="Across all analysed contracts"
          value={avgScore !== null ? avgScore : "—"}
          color={avgScore !== null ? scoreColor(avgScore) : "#FF9500"}
          hex={avgScore !== null ? (avgScore >= 70 ? "#FF3B30" : "#FF9500") : "#FF9500"}
          delay={0.1}
          icon={
            <svg viewBox="0 0 16 16" fill="none" width="18" height="18">
              <path d="M8 2v4M8 10v4M2 8h4M10 8h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/>
            </svg>
          }
        />
        <StatCard
          label="High-Risk Clauses"
          sub={`${totalHighClauses} total clauses identified`}
          value={totalHighClauses}
          color="#FF3B30"
          hex="#FF3B30"
          delay={0.2}
          icon={
            <svg viewBox="0 0 16 16" fill="none" width="18" height="18">
              <path d="M8 2L1 14h14L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              <line x1="8" y1="7" x2="8" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <circle cx="8" cy="12" r=".75" fill="currentColor"/>
            </svg>
          }
        />
      </div>

      {/* Contracts table */}
      <div className="card" style={{ overflow: "hidden" }}>
        {/* Table header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 0" }}>
          <h2 style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 17, color: "var(--tx-primary)" }}>
            Recent Contracts
          </h2>
        </div>

        {/* Column headers */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 150px 185px 120px 40px",
          gap: 16, padding: "14px 24px 10px",
          borderBottom: "1px solid var(--bd-subtle)",
        }}>
          {["CONTRACT", "CLIENT", "RISK SCORE", "STATUS", ""].map((col) => (
            <div key={col} style={{ fontSize: 10.5, fontWeight: 700, color: "var(--tx-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {col}
            </div>
          ))}
        </div>

        {/* Rows */}
        {contracts.map((contract) => (
          <ContractRow key={contract.id} contract={contract} />
        ))}

        {contracts.length === 0 && (
          <div style={{ padding: "60px 40px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "var(--tx-secondary)" }}>No contracts yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
