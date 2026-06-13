"use client";

import { useReducer, useState, useEffect, useRef } from "react";
import { ShieldCheck, Copy, Check } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

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

type ScanState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "done"; scan: ScanResult }
  | { status: "error"; message: string };

function reducer(_prev: ScanState, next: ScanState): ScanState {
  return next;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score <= 29) return "#4ade80";
  if (score <= 69) return "#fbbf24";
  return "#f87171";
}

function scoreGrade(score: number) {
  if (score <= 20) return "A";
  if (score <= 40) return "B";
  if (score <= 60) return "C";
  if (score <= 80) return "D";
  return "F";
}

function severityColor(s: string) {
  if (s === "high") return "#f87171";
  if (s === "medium") return "#fbbf24";
  return "#4ade80";
}

function severityBg(s: string) {
  if (s === "high") return "rgba(239,68,68,0.1)";
  if (s === "medium") return "rgba(234,179,8,0.1)";
  return "rgba(34,197,94,0.1)";
}

function categoryLabel(cat: string) {
  const map: Record<string, string> = {
    payment_terms: "Payment",
    liability: "Liability",
    auto_renewal: "Auto-Renewal",
    IP: "IP",
    termination: "Termination",
    other: "Other",
  };
  return map[cat] ?? cat;
}

const CATEGORY_KEYS = ["all", "payment_terms", "liability", "auto_renewal", "IP", "termination", "other"] as const;
const SEVERITY_KEYS = ["all", "high", "medium", "low"] as const;

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 hover:opacity-80 transition-opacity flex-shrink-0"
      style={{
        background: "transparent",
        border: "0.5px solid rgba(255,255,255,0.08)",
        borderRadius: 6,
        padding: "3px 8px",
        fontSize: 11,
        color: copied ? "#4ade80" : "rgba(255,255,255,0.3)",
        cursor: "pointer",
      }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function ClauseCard({ clause }: { clause: Clause }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = clause.text.length > 200;

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "0.5px solid rgba(255,255,255,0.06)",
        borderLeft: `3px solid ${severityColor(clause.severity)}`,
        borderRadius: 10,
        padding: 14,
        marginBottom: 8,
      }}
    >
      {/* Top row: severity + category */}
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span
          style={{
            background: severityBg(clause.severity),
            color: severityColor(clause.severity),
            border: `0.5px solid ${severityColor(clause.severity)}40`,
            fontSize: 10,
            fontWeight: 600,
            borderRadius: 5,
            padding: "2px 8px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {clause.severity}
        </span>
        <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.25)" }}>
          {categoryLabel(clause.category)}
        </span>
      </div>

      {/* Quoted clause text */}
      <p
        style={{
          fontSize: 12.5,
          color: "rgba(255,255,255,0.45)",
          fontStyle: "italic",
          lineHeight: 1.55,
          marginBottom: 8,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: expanded || !isLong ? 999 : 3,
          WebkitBoxOrient: "vertical",
        }}
      >
        &ldquo;{clause.text}&rdquo;
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded((e) => !e)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: 11,
            color: "#6366f1",
            cursor: "pointer",
            marginBottom: 8,
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      {/* Explanation */}
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, marginBottom: 10 }}>
        {clause.explanation}
      </p>

      {/* Safer rewrite */}
      <div
        style={{
          background: "rgba(99,102,241,0.05)",
          borderRadius: 8,
          padding: "10px 12px",
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#6366f1",
            }}
          >
            Safer alternative
          </span>
          <CopyButton text={clause.rewrite} />
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontStyle: "italic", lineHeight: 1.5 }}>
          {clause.rewrite}
        </p>
      </div>
    </div>
  );
}

function ScanningView() {
  const [progress, setProgress] = useState(0);
  const [showSlowMsg, setShowSlowMsg] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Jump to 30% after 300ms
    const jumpTimer = setTimeout(() => setProgress(30), 300);

    // Crawl from 30 → 85 over ~10s
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 85) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 85;
        }
        return p + 0.55;
      });
    }, 60);

    // Show slow message after 15s
    const slowTimer = setTimeout(() => setShowSlowMsg(true), 15000);

    return () => {
      clearTimeout(jumpTimer);
      clearTimeout(slowTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col items-center" style={{ padding: "2rem 1rem", gap: 16 }}>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", letterSpacing: "-0.01em" }}>
        Analysing contract…
      </p>
      <div style={{ width: "100%", height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 9999 }}>
        <div
          className="transition-all duration-300"
          style={{ width: `${progress}%`, height: 3, background: "#4f46e5", borderRadius: 9999 }}
        />
      </div>
      {showSlowMsg && (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center" }}>
          Still working — this contract may be complex…
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface RiskPanelProps {
  contractId: string;
  initialScan: ScanResult | null;
}

export function RiskPanel({ contractId, initialScan }: RiskPanelProps) {
  const [state, dispatch] = useReducer(
    reducer,
    initialScan ? { status: "done", scan: initialScan } : { status: "idle" }
  );

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeSeverity, setActiveSeverity] = useState<string>("all");

  async function startScan() {
    dispatch({ status: "scanning" });
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId }),
      });
      const data = await res.json();
      if (!res.ok) {
        dispatch({ status: "error", message: data.error ?? "Scan failed" });
        return;
      }
      dispatch({ status: "done", scan: data.scan });
    } catch {
      dispatch({ status: "error", message: "Network error. Please try again." });
    }
  }

  // ── Idle ──
  if (state.status === "idle") {
    return (
      <div
        className="flex flex-col items-center text-center"
        style={{
          background: "rgba(255,255,255,0.025)",
          border: "0.5px solid rgba(255,255,255,0.07)",
          borderRadius: 14,
          padding: "2rem 1.5rem",
          gap: 12,
        }}
      >
        <ShieldCheck size={40} color="#818cf8" strokeWidth={1.5} />
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 500, color: "#ffffff", marginBottom: 6 }}>
            Ready to analyse
          </h3>
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
            This contract hasn&apos;t been scanned yet. Click below to identify risky clauses.
          </p>
        </div>
        <button
          onClick={startScan}
          style={{
            width: "100%",
            background: "#4f46e5",
            color: "white",
            border: "none",
            borderRadius: 10,
            padding: "11px",
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            cursor: "pointer",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(79,70,229,0.3)",
            marginTop: 4,
          }}
        >
          Analyse contract
        </button>
      </div>
    );
  }

  // ── Scanning ──
  if (state.status === "scanning") {
    return <ScanningView />;
  }

  // ── Error ──
  if (state.status === "error") {
    return (
      <div
        style={{
          background: "rgba(239,68,68,0.08)",
          border: "0.5px solid rgba(239,68,68,0.25)",
          borderRadius: 12,
          padding: "1.25rem",
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 500, color: "#f87171", marginBottom: 6 }}>
          Analysis failed
        </p>
        <p style={{ fontSize: 12.5, color: "rgba(255,120,120,0.7)", lineHeight: 1.5, marginBottom: 12 }}>
          {state.message}
        </p>
        <button
          onClick={() => dispatch({ status: "idle" })}
          style={{
            fontSize: 12,
            color: "#818cf8",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  // ── Done ──
  const { scan } = state;
  const color = scoreColor(scan.risk_score);
  const grade = scoreGrade(scan.risk_score);

  // Sort: high first, then medium, then low
  const severityOrder = { high: 0, medium: 1, low: 2 };
  const sorted = [...scan.clauses].sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  );

  // Apply filters
  const filtered = sorted.filter((c) => {
    const catMatch = activeCategory === "all" || c.category === activeCategory;
    const sevMatch = activeSeverity === "all" || c.severity === activeSeverity;
    return catMatch && sevMatch;
  });

  const countBySeverity = (sev: string) =>
    scan.clauses.filter((c) => c.severity === sev).length;

  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {/* Risk score */}
      <div className="flex flex-col" style={{ gap: 6 }}>
        <div className="flex items-end" style={{ gap: 10 }}>
          <span style={{ fontSize: 72, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.04em" }}>
            {scan.risk_score}
          </span>
          <div className="flex flex-col items-start" style={{ paddingBottom: 8, gap: 4 }}>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color,
                background: `${color}18`,
                border: `1px solid ${color}40`,
                borderRadius: 8,
                padding: "2px 10px",
                lineHeight: 1.4,
              }}
            >
              {grade}
            </span>
          </div>
        </div>
        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
          Risk Score
        </p>
        <div style={{ width: "100%", height: 4, background: color, borderRadius: 9999 }} />
      </div>

      {/* Executive summary */}
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "0.5px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: "14px 16px",
        }}
      >
        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6366f1", marginBottom: 6 }}>
          Summary
        </p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
          {scan.summary}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col" style={{ gap: 6 }}>
        {/* Category pills */}
        <div className="flex flex-wrap" style={{ gap: 5 }}>
          {CATEGORY_KEYS.map((cat) => {
            const count = cat === "all" ? scan.clauses.length : scan.clauses.filter((c) => c.category === cat).length;
            if (cat !== "all" && count === 0) return null;
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: 9999,
                  border: "none",
                  cursor: "pointer",
                  background: active ? "#4f46e5" : "rgba(255,255,255,0.05)",
                  color: active ? "white" : "rgba(255,255,255,0.4)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {cat === "all" ? "All" : categoryLabel(cat)} ({count})
              </button>
            );
          })}
        </div>

        {/* Severity pills */}
        <div className="flex flex-wrap" style={{ gap: 5 }}>
          {SEVERITY_KEYS.map((sev) => {
            const count = sev === "all" ? scan.clauses.length : countBySeverity(sev);
            if (sev !== "all" && count === 0) return null;
            const active = activeSeverity === sev;
            const sevCol = sev === "all" ? undefined : severityColor(sev);
            return (
              <button
                key={sev}
                onClick={() => setActiveSeverity(sev)}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: 9999,
                  border: "none",
                  cursor: "pointer",
                  background: active
                    ? sev === "all" ? "#4f46e5" : `${sevCol}25`
                    : "rgba(255,255,255,0.05)",
                  color: active
                    ? sev === "all" ? "white" : sevCol
                    : "rgba(255,255,255,0.4)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Clause cards */}
      <div>
        {filtered.length === 0 ? (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "2rem 0" }}>
            No clauses in this category
          </p>
        ) : (
          filtered.map((clause, i) => <ClauseCard key={i} clause={clause} />)
        )}
      </div>
    </div>
  );
}
