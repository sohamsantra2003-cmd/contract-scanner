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

function findClausePage(clauseText: string, pageTexts: string[]): number {
  if (!pageTexts.length) return 1;

  const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const needle = normalise(clauseText).slice(0, 120);

  // Exact substring match first
  for (let i = 0; i < pageTexts.length; i++) {
    if (normalise(pageTexts[i]).includes(needle)) return i + 1;
  }

  // Fallback: word overlap scoring (ignore short words)
  const needleWords = new Set(needle.split(" ").filter((w) => w.length > 4));
  let bestPage = 1;
  let bestScore = 0;

  pageTexts.forEach((text, i) => {
    const pageWords = normalise(text).split(" ");
    const matches = pageWords.filter((w) => needleWords.has(w)).length;
    if (matches > bestScore) {
      bestScore = matches;
      bestPage = i + 1;
    }
  });

  return bestPage;
}

const CATEGORY_KEYS = ["all", "payment_terms", "liability", "auto_renewal", "IP", "termination", "other"] as const;
const SEVERITY_KEYS = ["all", "high", "medium", "low"] as const;

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation(); // don't bubble to clause card click
    try {
      await navigator.clipboard.writeText(text);
    } catch {
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

interface ClauseCardProps {
  clause: Clause;
  isActive: boolean;
  targetPage: number | null;
  onClick: () => void;
}

function ClauseCard({ clause, isActive, targetPage, onClick }: ClauseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = clause.text.length > 200;

  return (
    <div
      onClick={onClick}
      style={{
        background: isActive ? "rgba(99,102,241,0.06)" : "rgba(255,255,255,0.02)",
        border: isActive
          ? "0.5px solid rgba(99,102,241,0.5)"
          : "0.5px solid rgba(255,255,255,0.06)",
        borderLeft: `3px solid ${severityColor(clause.severity)}`,
        borderRadius: 10,
        padding: 14,
        marginBottom: 8,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      {/* Top row: severity badge + category + page jump label */}
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
        <div className="flex items-center" style={{ gap: 6 }}>
          <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.25)" }}>
            {categoryLabel(clause.category)}
          </span>
          {targetPage !== null && (
            <span
              style={{
                fontSize: 10,
                color: isActive ? "#818cf8" : "rgba(255,255,255,0.2)",
                fontWeight: isActive ? 500 : 400,
                transition: "color 0.15s",
              }}
            >
              → p.{targetPage}
            </span>
          )}
        </div>
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
          onClick={(e) => { e.stopPropagation(); setExpanded((x) => !x); }}
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
    const jumpTimer = setTimeout(() => setProgress(30), 300);
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 85) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 85;
        }
        return p + 0.55;
      });
    }, 60);
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
  pageTexts?: string[];
  onClauseClick?: (page: number) => void;
}

export function RiskPanel({
  contractId,
  initialScan,
  pageTexts,
  onClauseClick,
}: RiskPanelProps) {
  const [state, dispatch] = useReducer(
    reducer,
    initialScan ? { status: "done", scan: initialScan } : { status: "idle" }
  );

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeSeverity, setActiveSeverity] = useState<string>("all");
  const [activeClauseIndex, setActiveClauseIndex] = useState<number | null>(null);

  // Reset severity + active clause when category changes
  useEffect(() => {
    setActiveSeverity("all");
    setActiveClauseIndex(null);
  }, [activeCategory]);

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

  // Category counts (across all clauses)
  const categoryCounts = scan.clauses.reduce((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Clauses matching the active category (before severity filter)
  const categoryFiltered = scan.clauses.filter(
    (c) => activeCategory === "all" || c.category === activeCategory
  );

  // Severity counts derived from the category-filtered set
  const severityCounts: Record<string, number> = {
    high: categoryFiltered.filter((c) => c.severity === "high").length,
    medium: categoryFiltered.filter((c) => c.severity === "medium").length,
    low: categoryFiltered.filter((c) => c.severity === "low").length,
  };

  // Final list: both filters applied, sorted high → medium → low
  const severityOrder = { high: 0, medium: 1, low: 2 };
  const filtered = categoryFiltered
    .filter((c) => activeSeverity === "all" || c.severity === activeSeverity)
    .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  // Pre-compute target pages for all filtered clauses (avoids re-computing per render)
  const targetPages = filtered.map((clause) =>
    pageTexts && pageTexts.length > 0 ? findClausePage(clause.text, pageTexts) : null
  );

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
            const count = cat === "all" ? scan.clauses.length : (categoryCounts[cat] ?? 0);
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
                  transition: "all 0.15s",
                  background: active ? "#4f46e5" : "rgba(255,255,255,0.05)",
                  color: active ? "#ffffff" : "rgba(255,255,255,0.4)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {cat === "all" ? "All" : categoryLabel(cat)} ({count})
              </button>
            );
          })}
        </div>

        {/* Severity pills — counts based on category-filtered set */}
        <div className="flex flex-wrap" style={{ gap: 5 }}>
          {SEVERITY_KEYS.map((sev) => {
            const count = sev === "all" ? categoryFiltered.length : (severityCounts[sev] ?? 0);
            if (sev !== "all" && count === 0) return null;
            const active = activeSeverity === sev;
            const sevCol = sev === "all" ? null : severityColor(sev);
            return (
              <button
                key={sev}
                onClick={() => setActiveSeverity(sev)}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: 9999,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  background: active
                    ? sev === "all" ? "#4f46e5" : `${sevCol}33`
                    : "rgba(255,255,255,0.05)",
                  color: active
                    ? sev === "all" ? "#ffffff" : sevCol!
                    : "rgba(255,255,255,0.4)",
                  border: active && sev !== "all"
                    ? `0.5px solid ${sevCol}66`
                    : "none",
                  fontWeight: active ? 500 : 400,
                }}
              >
                {sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation hint — shown once page texts are loaded */}
      {pageTexts && pageTexts.length > 0 && (
        <p
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.25)",
            fontStyle: "italic",
            marginBottom: -6,
          }}
        >
          Click any clause below to jump to it in the PDF
        </p>
      )}

      {/* Clause cards */}
      <div>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem 1rem", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
            No clauses match this filter combination.
            <br />
            <button
              onClick={() => { setActiveCategory("all"); setActiveSeverity("all"); }}
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "#818cf8",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          filtered.map((clause, i) => (
            <ClauseCard
              key={i}
              clause={clause}
              isActive={activeClauseIndex === i}
              targetPage={targetPages[i]}
              onClick={() => {
                setActiveClauseIndex(i);
                const page = targetPages[i];
                if (page !== null) onClauseClick?.(page);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
