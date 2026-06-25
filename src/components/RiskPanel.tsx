"use client";

import { useReducer, useState, useEffect, useRef, useCallback } from "react";
import { Copy, Check, Download, RefreshCw, ScanLine, Lock, FileWarning, Clock, Zap } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { exportScanReport } from "@/lib/export-pdf";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  coverage?: { chunksTotal: number; chunksProcessed: number; complete: boolean };
};

type ScanState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "done"; scan: ScanResult }
  | { status: "error"; message: string };

function reducer(_prev: ScanState, next: ScanState): ScanState {
  return next;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 70) return "#F05252";
  if (score >= 40) return "#F6A609";
  return "#22C97B";
}

function scoreGrade(score: number) {
  if (score >= 80) return "F";
  if (score >= 65) return "D";
  if (score >= 50) return "C";
  if (score >= 35) return "B";
  return "A";
}

function gradeColor(score: number) {
  if (score >= 80) return "#F05252";
  if (score >= 65) return "#F97316";
  if (score >= 50) return "#F6A609";
  if (score >= 35) return "#84CC16";
  return "#22C97B";
}

function severityColor(s: string) {
  if (s === "high") return "#F05252";
  if (s === "medium") return "#F6A609";
  return "#22C97B";
}

function severityBg(s: string) {
  if (s === "high") return "rgba(240,82,82,0.08)";
  if (s === "medium") return "rgba(246,166,9,0.08)";
  return "rgba(34,201,123,0.08)";
}

function severityBorder(s: string) {
  if (s === "high") return "rgba(240,82,82,0.22)";
  if (s === "medium") return "rgba(246,166,9,0.22)";
  return "rgba(34,201,123,0.22)";
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
  for (let i = 0; i < pageTexts.length; i++) {
    if (normalise(pageTexts[i]).includes(needle)) return i + 1;
  }
  const needleWords = new Set(needle.split(" ").filter((w) => w.length > 4));
  let bestPage = 1, bestScore = 0;
  pageTexts.forEach((text, i) => {
    const matches = normalise(text).split(" ").filter((w) => needleWords.has(w)).length;
    if (matches > bestScore) { bestScore = matches; bestPage = i + 1; }
  });
  return bestPage;
}

const CATEGORY_KEYS = ["all", "payment_terms", "liability", "auto_renewal", "IP", "termination", "other"] as const;
const SEVERITY_KEYS = ["all", "high", "medium", "low"] as const;

// ── RiskGauge ─────────────────────────────────────────────────────────────────

function RiskGauge({ score }: { score: number }) {
  const r = 46, cx = 65, cy = 65, size = 130;
  const circ = 2 * Math.PI * r;
  const arc = circ * 0.75;
  const filled = arc * (score / 100);
  const color = scoreColor(score);
  const grade = scoreGrade(score);
  const gColor = gradeColor(score);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 130 130">
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke="rgba(255,255,255,0.07)" strokeWidth="9"
          strokeDasharray={`${arc} ${circ - arc}`} strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`} />
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth="9"
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`}
          style={{ filter: `drop-shadow(0 0 10px ${color}99)`, transition: "stroke-dasharray 1s ease" }} />
        <text x={cx} y={cy - 2} textAnchor="middle" fill="white"
          fontSize="30" fontWeight="700"
          fontFamily={"'DM Mono',monospace" as string} letterSpacing="-1">
          {score}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle"
          fill="rgba(255,255,255,.38)" fontSize="11"
          fontFamily={"'Plus Jakarta Sans',sans-serif" as string}>
          out of 100
        </text>
      </svg>
      <div style={{
        position: "absolute", bottom: 6, right: 6,
        width: 32, height: 32, borderRadius: "50%",
        background: gColor + "1A", border: `1.5px solid ${gColor}50`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'DM Mono',monospace", fontWeight: 700,
        fontSize: 14, color: gColor,
      }}>{grade}</div>
    </div>
  );
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
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
    toast.success("Copied to clipboard", { duration: 1500 });
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="btn btn-ghost btn-sm btn-icon"
      style={{
        fontSize: 11, padding: "3px 8px",
        color: copied ? "#22C97B" : "var(--tx-secondary)",
        gap: 4,
      }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ── ClauseCard ────────────────────────────────────────────────────────────────

interface ClauseCardProps {
  clause: Clause;
  isActive: boolean;
  targetPage: number | null;
  onClick: () => void;
  cardRef?: (el: HTMLDivElement | null) => void;
}

function ClauseCard({ clause, isActive, targetPage, onClick, cardRef }: ClauseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = clause.text.length > 200;
  const sColor = severityColor(clause.severity);
  const sBg = severityBg(clause.severity);
  const sBd = severityBorder(clause.severity);

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className="card"
      style={{
        borderLeft: `3px solid ${sColor}`,
        background: isActive ? sBg : "var(--bg-card)",
        cursor: "pointer",
        transition: "background .15s, border-color .15s",
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ padding: "12px 14px 10px", display: "flex", alignItems: "center", gap: 8 }}>
        <span className={`badge badge-${clause.severity}`}>
          {clause.severity}
        </span>
        <span style={{ fontSize: 11, color: "var(--tx-muted)", flex: 1 }}>
          {categoryLabel(clause.category)}
        </span>
        {targetPage !== null && (
          <span style={{ fontSize: 10.5, color: isActive ? "var(--ac)" : "var(--tx-muted)" }}>
            p.{targetPage}
          </span>
        )}
        <svg viewBox="0 0 16 16" fill="none" width="14" height="14"
          style={{ color: "var(--tx-muted)", transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s", flexShrink: 0 }}>
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Quote text */}
      <div style={{ padding: "0 14px 12px" }}>
        <p
          style={{
            fontSize: 12.5, color: "var(--tx-secondary)",
            fontStyle: "italic", lineHeight: 1.55, marginBottom: 6,
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
            style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "var(--ac)", cursor: "pointer", marginBottom: 8 }}
          >
            {expanded ? "Show less" : "Show more"}
          </button>
        )}

        {/* Why it's risky */}
        <div style={{ marginBottom: 10 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "var(--tx-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
            Why it&apos;s risky
          </p>
          <p style={{ fontSize: 13, color: "var(--tx-secondary)", lineHeight: 1.6 }}>
            {clause.explanation}
          </p>
        </div>

        {/* Safer alternative */}
        <div style={{
          background: sBg, border: `1px solid ${sBd}`,
          borderRadius: 8, padding: "10px 12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: sColor }}>
              Safer alternative
            </span>
            <CopyButton text={clause.rewrite} />
          </div>
          <p style={{ fontSize: 12, color: "var(--tx-secondary)", fontStyle: "italic", lineHeight: 1.55 }}>
            {clause.rewrite}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── ScanningView ──────────────────────────────────────────────────────────────

interface ScanningViewProps {
  statusMessage: string;
  streamingText: string;
  chunkProgress: { completed: number; total: number } | null;
}

function ScanningView({ statusMessage, streamingText, chunkProgress }: ScanningViewProps) {
  const [progress, setProgress] = useState(0);
  const [showSlowMsg, setShowSlowMsg] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [termLines, setTermLines] = useState<string[]>(["Connecting to Gemini..."]);

  useEffect(() => {
    const jumpTimer = setTimeout(() => setProgress(30), 300);
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 85) { if (intervalRef.current) clearInterval(intervalRef.current); return 85; }
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

  useEffect(() => {
    if (statusMessage) {
      setTermLines((prev) => {
        const last = prev[prev.length - 1];
        if (last === statusMessage) return prev;
        return [...prev, statusMessage];
      });
    }
  }, [statusMessage]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [termLines, streamingText]);

  const pct = chunkProgress
    ? Math.round((chunkProgress.completed / chunkProgress.total) * 100)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Terminal box */}
      <div
        ref={terminalRef}
        style={{
          background: "#0A0A0A",
          border: "1px solid var(--bd-subtle)",
          borderRadius: "var(--r-md)",
          padding: "16px 18px",
          fontFamily: "var(--ff-mono)",
          fontSize: 12.5, lineHeight: 1.7,
          minHeight: 160, maxHeight: 260,
          overflowY: "auto",
        }}
      >
        {termLines.map((line, i) => (
          <div
            key={i}
            style={{
              color: i === 0 ? "#30D158" : line.includes("Analysing") || line.includes("section") ? "var(--tx-secondary)" : "#30D158",
              animation: `termLine .15s ease ${i * 0.05}s both`,
            }}
          >
            <span style={{ color: "var(--tx-muted)", marginRight: 8 }}>▸</span>
            {line}
          </div>
        ))}
        {streamingText.length > 0 && (
          <div style={{ color: "var(--ac)", marginTop: 4, wordBreak: "break-all", fontSize: 11 }}>
            {streamingText.slice(-200)}
          </div>
        )}
        {/* Blinking cursor */}
        <div style={{ display: "inline-block", width: 8, height: 14, background: "var(--ac)", marginTop: 4, animation: "blink 1s step-end infinite", verticalAlign: "middle" }} />
      </div>

      {/* Progress */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontFamily: "var(--ff-mono)", fontSize: 11.5, color: "var(--tx-secondary)" }}>
            {chunkProgress ? `${chunkProgress.completed} / ${chunkProgress.total} sections` : "Analysing…"}
          </span>
          {pct !== null && (
            <span style={{ fontFamily: "var(--ff-mono)", fontSize: 11.5, color: "var(--ac)" }}>
              {pct}%
            </span>
          )}
        </div>
        <div style={{ width: "100%", height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 99 }}>
          <div style={{
            width: `${pct ?? progress}%`, height: 3, borderRadius: 99,
            background: "linear-gradient(90deg, var(--ac), var(--ac-lite))",
            boxShadow: "0 0 10px var(--ac)",
            transition: "width .12s linear",
          }} />
        </div>
        {chunkProgress && (
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginTop: 8 }}>
            {Array.from({ length: chunkProgress.total }).map((_, i) => (
              <div key={i} style={{
                width: 12, height: 4, borderRadius: 2,
                background: i < chunkProgress.completed ? "var(--ac)" : "rgba(255,255,255,0.08)",
                transition: "background 0.2s",
              }} />
            ))}
          </div>
        )}
        {showSlowMsg && !chunkProgress && (
          <p style={{ fontSize: 12, color: "var(--tx-muted)", textAlign: "center", marginTop: 8 }}>
            Still working — this contract may be complex…
          </p>
        )}
      </div>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

export function RiskPanelSkeleton() {
  return (
    <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
      <Skeleton style={{ height: 130, borderRadius: "var(--r-lg)" }} />
      <Skeleton style={{ height: 80, borderRadius: "var(--r-md)" }} />
      <div style={{ display: "flex", gap: 6 }}>
        {[80, 100, 90, 110].map((w, i) => (
          <Skeleton key={i} style={{ width: w, height: 30, borderRadius: 99 }} />
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} style={{ height: 110, borderRadius: "var(--r-md)" }} />
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface RiskPanelProps {
  contractId: string;
  contractTitle: string;
  userEmail: string;
  initialScan: ScanResult | null;
  initiallyScanning?: boolean;
  pageTexts?: string[];
  onClauseClick?: (page: number) => void;
  onScanStart?: () => void;
  onScanEnd?: () => void;
  onScanComplete?: (scan: ScanResult) => void;
  onRegisterRescan?: (fn: () => void) => void;
  // Bidirectional highlight sync
  externalActiveClauseIndex?: number | null;
  onClauseActivated?: (clauseIdx: number) => void;
}

export function RiskPanel({
  contractId,
  contractTitle,
  userEmail,
  initialScan,
  initiallyScanning,
  pageTexts,
  onClauseClick,
  onScanStart,
  onScanEnd,
  onScanComplete,
  onRegisterRescan,
  externalActiveClauseIndex,
  onClauseActivated,
}: RiskPanelProps) {
  const [state, dispatch] = useReducer(
    reducer,
    initialScan
      ? { status: "done", scan: initialScan }
      : initiallyScanning
        ? { status: "scanning" }
        : { status: "idle" }
  );

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeSeverity, setActiveSeverity] = useState<string>("all");
  // Tracks the ORIGINAL scan.clauses index (not the filtered array index)
  const [activeClauseIndex, setActiveClauseIndex] = useState<number | null>(null);
  const clauseCardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [scanStatusMessage, setScanStatusMessage] = useState("Connecting to Gemini...");
  const [streamingText, setStreamingText] = useState("");
  const [chunkProgress, setChunkProgress] = useState<{ completed: number; total: number } | null>(null);

  useEffect(() => {
    setActiveSeverity("all");
    setActiveClauseIndex(null);
  }, [activeCategory]);

  useEffect(() => {
    if (externalActiveClauseIndex === null || externalActiveClauseIndex === undefined) return;
    setActiveClauseIndex(externalActiveClauseIndex);
    const el = clauseCardRefs.current.get(externalActiveClauseIndex);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [externalActiveClauseIndex]);

  // ── Core SSE fetch ────────────────────────────────────────────────────────────
  async function runScan() {
    let settled = false;
    const clientTimeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        dispatch({ status: "error", message: "Analysis timed out. Please try again." });
        onScanEnd?.();
        toast.error("Analysis failed", { description: "Analysis timed out. Please try again." });
      }
    }, 60000);

    try {
      const response = await fetch("/api/scan-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId }),
      });

      if (!response.ok || !response.body) throw new Error("Stream connection failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const payload = JSON.parse(jsonStr);
              switch (currentEvent) {
                case "status":
                  setScanStatusMessage(payload.message);
                  break;
                case "chunk":
                  setStreamingText((prev) => prev + payload.text);
                  break;
                case "progress":
                  setChunkProgress({ completed: payload.completed, total: payload.total });
                  setScanStatusMessage(payload.message ?? `Analysed ${payload.completed} of ${payload.total} sections...`);
                  break;
                case "complete":
                  settled = true;
                  clearTimeout(clientTimeout);
                  dispatch({ status: "done", scan: payload.scan });
                  onScanEnd?.();
                  onScanComplete?.(payload.scan);
                  toast.success("Analysis complete", {
                    description: `Risk score: ${payload.scan.risk_score}/100`,
                  });
                  fetch("/api/send-report", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ scan: payload.scan, contractTitle }),
                  }).catch(() => {});
                  toast.success("Report emailed", {
                    description: `Sent to ${userEmail}`,
                    duration: 4000,
                  });
                  break;
                case "error":
                  settled = true;
                  clearTimeout(clientTimeout);
                  dispatch({ status: "error", message: payload.message });
                  onScanEnd?.();
                  toast.error("Analysis failed", { description: payload.message });
                  break;
              }
              currentEvent = "";
            } catch {
              // Malformed SSE line — skip
            }
          }
        }
      }
    } catch {
      if (!settled) {
        settled = true;
        clearTimeout(clientTimeout);
        dispatch({ status: "error", message: "Connection lost. Please try again." });
        onScanEnd?.();
        toast.error("Analysis failed", { description: "Connection lost. Please try again." });
      }
    }
  }

  async function startScan() {
    dispatch({ status: "scanning" });
    onScanStart?.();
    setScanStatusMessage("Connecting to Gemini...");
    setStreamingText("");
    setChunkProgress(null);
    await runScan();
  }

  async function handleRescan() {
    setScanStatusMessage("Connecting to Gemini...");
    setStreamingText("");
    setChunkProgress(null);

    try {
      const resetRes = await fetch("/api/contracts/reset-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractId }),
      });

      if (!resetRes.ok) {
        const resetData = await resetRes.json();
        if (resetRes.status === 409) {
          dispatch({ status: "scanning" });
          onScanStart?.();
          return;
        }
        dispatch({ status: "error", message: resetData.error ?? "Failed to reset contract. Please try again." });
        return;
      }
    } catch {
      dispatch({ status: "error", message: "Network error. Please try again." });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
    dispatch({ status: "scanning" });
    onScanStart?.();
    await runScan();
  }

  // Register rescan with parent
  const handleRescanRef = useRef(handleRescan);
  useEffect(() => { handleRescanRef.current = handleRescan; });
  useEffect(() => {
    onRegisterRescan?.(() => handleRescanRef.current());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Idle ──
  if (state.status === "idle") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", flex: 1, justifyContent: "center", gap: 14, padding: "40px 0" }}>
        <div style={{ animation: "floatUp 4s ease-in-out infinite", marginBottom: 4 }}>
          <svg width={52} height={Math.round(52 * 1.17)} viewBox="0 0 24 28" fill="none">
            <defs>
              <linearGradient id="shield-idle" x1="2" y1="1" x2="22" y2="27" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FFD080"/>
                <stop offset="100%" stopColor="#FF9500"/>
              </linearGradient>
            </defs>
            <path d="M12 1L2 5.5V13c0 6.35 4.5 12.28 10 13.88C17.5 25.28 22 19.35 22 13V5.5L12 1z"
              fill="url(#shield-idle)" fillOpacity=".18" stroke="url(#shield-idle)" strokeWidth="1.4" strokeLinejoin="round"/>
            <line x1="7.5" y1="12" x2="16.5" y2="12" stroke="url(#shield-idle)" strokeWidth="1.5" strokeLinecap="round" opacity=".95"/>
            <line x1="7.5" y1="15.8" x2="14.2" y2="15.8" stroke="url(#shield-idle)" strokeWidth="1.5" strokeLinecap="round" opacity=".7"/>
          </svg>
        </div>
        <div>
          <h3 style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 20, color: "var(--tx-primary)", marginBottom: 8, letterSpacing: "-0.02em" }}>
            Ready to analyse
          </h3>
          <p style={{ fontSize: 13.5, color: "var(--tx-secondary)", lineHeight: 1.65, maxWidth: 300 }}>
            This contract hasn&apos;t been scanned yet. Click below to identify risky clauses using Gemini AI.
          </p>
        </div>
        <button
          onClick={startScan}
          className="btn btn-primary"
          style={{ maxWidth: 280, width: "100%", justifyContent: "center", marginTop: 8 }}
        >
          <Zap size={15} />
          Analyse Contract
        </button>
      </div>
    );
  }

  // ── Scanning ──
  if (state.status === "scanning") {
    return (
      <ScanningView
        statusMessage={scanStatusMessage}
        streamingText={streamingText}
        chunkProgress={chunkProgress}
      />
    );
  }

  // ── Error ──
  if (state.status === "error") {
    const msg = state.message;
    const isScanned = msg.includes("SCANNED_PDF") || msg.includes("scanned images");
    const isPassword = msg.includes("PASSWORD_PROTECTED") || msg.includes("password-protected");
    const isComplex = msg.includes("unreadable") || msg.includes("too complex");
    const isTimeout = msg.includes("timed out");

    if (isScanned) {
      return (
        <div style={{ background: "rgba(246,166,9,0.06)", border: "1px solid rgba(246,166,9,0.22)", borderRadius: "var(--r-md)", padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <ScanLine size={16} color="#F6A609" />
            <p style={{ fontSize: 13, fontWeight: 600, color: "#F6A609", margin: 0 }}>Scanned PDF detected</p>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--tx-secondary)", lineHeight: 1.6, marginBottom: 12, whiteSpace: "pre-line" }}>
            {"This PDF contains scanned images rather than selectable text.\n\nTo fix this:\n• Adobe Acrobat → Tools → Enhance Scans → Recognize Text\n• Free OCR: "}
            <a href="https://smallpdf.com/pdf-to-word" target="_blank" rel="noopener noreferrer" style={{ color: "var(--ac)" }}>smallpdf.com/pdf-to-word</a>
            {"\n• Or export as PDF directly from Word / Google Docs"}
          </p>
          <button onClick={() => dispatch({ status: "idle" })} style={{ fontSize: 12, color: "var(--ac)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
            Upload a different file
          </button>
        </div>
      );
    }

    if (isPassword) {
      return (
        <div style={{ background: "rgba(246,166,9,0.06)", border: "1px solid rgba(246,166,9,0.22)", borderRadius: "var(--r-md)", padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Lock size={16} color="#F6A609" />
            <p style={{ fontSize: 13, fontWeight: 600, color: "#F6A609", margin: 0 }}>Password-protected PDF</p>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--tx-secondary)", lineHeight: 1.6, marginBottom: 12 }}>
            {"To remove the password:\n• Adobe Acrobat: File → Properties → Security → \"No Security\"\n• Online (free): "}
            <a href="https://smallpdf.com/unlock-pdf" target="_blank" rel="noopener noreferrer" style={{ color: "var(--ac)" }}>smallpdf.com/unlock-pdf</a>
            {"\n• Google Chrome: Open PDF → Print → Save as PDF"}
          </p>
          <button onClick={() => dispatch({ status: "idle" })} style={{ fontSize: 12, color: "var(--ac)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
            Upload unlocked file
          </button>
        </div>
      );
    }

    if (isComplex) {
      return (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--bd-default)", borderRadius: "var(--r-md)", padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <FileWarning size={16} color="var(--tx-secondary)" />
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--tx-primary)", margin: 0 }}>Document too complex</p>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--tx-secondary)", lineHeight: 1.6, marginBottom: 12 }}>
            Try uploading just the main agreement pages without annexes and form templates.
          </p>
          <button onClick={() => dispatch({ status: "idle" })} style={{ fontSize: 12, color: "var(--ac)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
            Try again
          </button>
        </div>
      );
    }

    if (isTimeout) {
      return (
        <div style={{ background: "var(--rh-bg)", border: "1px solid var(--rh-bd)", borderRadius: "var(--r-md)", padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Clock size={16} color="var(--rh)" />
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--rh)", margin: 0 }}>Analysis timed out</p>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--tx-secondary)", lineHeight: 1.6, marginBottom: 12 }}>
            This contract is taking longer than expected. Please try again.
          </p>
          <button onClick={() => dispatch({ status: "idle" })} style={{ fontSize: 12, color: "var(--ac)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
            Try again
          </button>
        </div>
      );
    }

    return (
      <div style={{ background: "var(--rh-bg)", border: "1px solid var(--rh-bd)", borderRadius: "var(--r-md)", padding: "16px 18px" }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--rh)", marginBottom: 6 }}>Analysis failed</p>
        <p style={{ fontSize: 12.5, color: "var(--tx-secondary)", lineHeight: 1.5, marginBottom: 12 }}>{state.message}</p>
        <button onClick={() => dispatch({ status: "idle" })} style={{ fontSize: 12, color: "var(--ac)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
          Try again
        </button>
      </div>
    );
  }

  // ── Done ──
  const { scan } = state;

  const categoryCounts = scan.clauses.reduce((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const categoryFiltered = scan.clauses.filter(
    (c) => activeCategory === "all" || c.category === activeCategory
  );

  const severityCounts: Record<string, number> = {
    high: categoryFiltered.filter((c) => c.severity === "high").length,
    medium: categoryFiltered.filter((c) => c.severity === "medium").length,
    low: categoryFiltered.filter((c) => c.severity === "low").length,
  };

  const severityOrder = { high: 0, medium: 1, low: 2 };
  const filtered = categoryFiltered
    .filter((c) => activeSeverity === "all" || c.severity === activeSeverity)
    .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  const targetPages = filtered.map((clause) =>
    pageTexts && pageTexts.length > 0 ? findClausePage(clause.text, pageTexts) : null
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Risk gauge card */}
      <div className="card" style={{ padding: "18px 20px", display: "flex", gap: 20, alignItems: "flex-start" }}>
        <RiskGauge score={scan.risk_score} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 14, color: "var(--tx-primary)", marginBottom: 8 }}>
            Executive Summary
          </h3>
          <p style={{ fontSize: 13, color: "var(--tx-secondary)", lineHeight: 1.65, marginBottom: 12 }}>
            {scan.summary}
          </p>
          {/* Clause count dots */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {(["high", "medium", "low"] as const).map((sev) => {
              const count = scan.clauses.filter((c) => c.severity === sev).length;
              if (count === 0) return null;
              return (
                <div key={sev} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: severityColor(sev), flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "var(--tx-secondary)", textTransform: "capitalize" }}>
                    {sev} <span style={{ fontFamily: "var(--ff-mono)", fontWeight: 700, color: severityColor(sev) }}>{count}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Partial-coverage banner */}
      {scan.coverage && !scan.coverage.complete && (
        <div style={{
          background: "rgba(246,166,9,0.08)", border: "1px solid rgba(246,166,9,0.28)",
          borderRadius: "var(--r-md)", padding: "10px 14px",
          display: "flex", alignItems: "flex-start", gap: 8,
        }}>
          <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>⚠</span>
          <p style={{ fontSize: 12, color: "#F6A609", margin: 0, lineHeight: 1.55 }}>
            <strong>Partial analysis</strong> — {scan.coverage.chunksProcessed} of {scan.coverage.chunksTotal} sections were analysed before the time limit. Some clauses may not be shown.
          </p>
        </div>
      )}

      {/* Filter tabs — categories */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {CATEGORY_KEYS.map((cat) => {
          const count = cat === "all" ? scan.clauses.length : (categoryCounts[cat] ?? 0);
          if (cat !== "all" && count === 0) return null;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`tab${activeCategory === cat ? " active" : ""}`}
            >
              {cat === "all" ? "All" : categoryLabel(cat)} ({count})
            </button>
          );
        })}
      </div>

      {/* Filter tabs — severity */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {SEVERITY_KEYS.map((sev) => {
          const count = sev === "all" ? categoryFiltered.length : (severityCounts[sev] ?? 0);
          if (sev !== "all" && count === 0) return null;
          return (
            <button
              key={sev}
              onClick={() => setActiveSeverity(sev)}
              className={`tab${activeSeverity === sev ? " active" : ""}`}
            >
              {sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      {pageTexts && pageTexts.length > 0 && (
        <p style={{ fontSize: 11, color: "var(--tx-muted)", fontStyle: "italic" }}>
          Click any clause to jump to it in the PDF
        </p>
      )}

      {/* Clause cards */}
      <div>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--tx-muted)", fontSize: 13 }}>
            No clauses match this filter.
            <br />
            <button
              onClick={() => { setActiveCategory("all"); setActiveSeverity("all"); }}
              style={{ marginTop: 8, fontSize: 12, color: "var(--ac)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          filtered.map((clause, i) => {
            const originalIdx = scan.clauses.indexOf(clause);
            return (
              <ClauseCard
                key={originalIdx}
                clause={clause}
                isActive={activeClauseIndex === originalIdx}
                targetPage={targetPages[i]}
                cardRef={(el) => {
                  if (el) clauseCardRefs.current.set(originalIdx, el);
                  else clauseCardRefs.current.delete(originalIdx);
                }}
                onClick={() => {
                  setActiveClauseIndex(originalIdx);
                  const page = targetPages[i];
                  if (page !== null) onClauseClick?.(page);
                  onClauseActivated?.(originalIdx);
                }}
              />
            );
          })
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: "1px solid var(--bd-subtle)" }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => exportScanReport(scan, contractTitle)}
          style={{ flex: 1, justifyContent: "center", gap: 6 }}
        >
          <Download size={12} />
          Download PDF
        </button>
        <button
          className="btn btn-ghost btn-sm"
          disabled
          title="Coming soon"
          style={{ flex: 1, justifyContent: "center", gap: 6, opacity: 0.4, cursor: "not-allowed" }}
        >
          Download .docx
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleRescan}
          style={{ color: "var(--ac-lite)", borderColor: "rgba(255,149,0,0.25)", gap: 5 }}
        >
          <RefreshCw size={11} />
          Re-analyse
        </button>
      </div>
    </div>
  );
}
