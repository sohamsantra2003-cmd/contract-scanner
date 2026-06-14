"use client";

import { useReducer, useState, useEffect, useRef } from "react";
import { ShieldCheck, Copy, Check, Download, RefreshCw, ScanLine, Lock, FileWarning, Clock, Zap } from "lucide-react";
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
  if (score <= 29) return "#34c759";
  if (score <= 69) return "#ff9500";
  return "#ff4d4d";
}

function scoreGrade(score: number) {
  if (score <= 20) return "A";
  if (score <= 40) return "B";
  if (score <= 60) return "C";
  if (score <= 80) return "D";
  return "F";
}

function severityColor(s: string) {
  if (s === "high") return "#ff4d4d";
  if (s === "medium") return "#ff9500";
  return "#34c759";
}

function severityBg(s: string) {
  if (s === "high") return "rgba(255,77,77,0.1)";
  if (s === "medium") return "rgba(255,149,0,0.1)";
  return "rgba(52,199,89,0.1)";
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

// ── Sub-components ────────────────────────────────────────────────────────────

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
      className="flex items-center gap-1 hover:opacity-80 transition-opacity flex-shrink-0"
      style={{
        background: "transparent",
        border: "0.5px solid rgba(255,255,255,0.08)",
        borderRadius: 6,
        padding: "3px 8px",
        fontSize: 11,
        color: copied ? "#34c759" : "rgba(255,255,255,0.3)",
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
  const [hovered, setHovered] = useState(false);
  const isLong = clause.text.length > 200;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isActive
          ? "rgba(91,79,255,0.08)"
          : hovered
          ? "rgba(255,255,255,0.04)"
          : "rgba(255,255,255,0.02)",
        borderTop: isActive ? "0.5px solid rgba(91,79,255,0.5)" : "0.5px solid rgba(255,255,255,0.06)",
        borderRight: isActive ? "0.5px solid rgba(91,79,255,0.5)" : "0.5px solid rgba(255,255,255,0.06)",
        borderBottom: isActive ? "0.5px solid rgba(91,79,255,0.5)" : "0.5px solid rgba(255,255,255,0.06)",
        borderLeft: `3px solid ${severityColor(clause.severity)}`,
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
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
            <span style={{ fontSize: 10, color: isActive ? "#818cf8" : "rgba(255,255,255,0.2)", fontWeight: isActive ? 500 : 400, transition: "color 0.15s" }}>
              → p.{targetPage}
            </span>
          )}
        </div>
      </div>

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
          style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "#5b4fff", cursor: "pointer", marginBottom: 8 }}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, marginBottom: 10 }}>
        {clause.explanation}
      </p>

      <div style={{ background: "rgba(91,79,255,0.05)", borderRadius: 8, padding: "10px 12px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5b4fff" }}>
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

interface ScanningViewProps {
  statusMessage: string;
  streamingText: string;
  chunkProgress: { completed: number; total: number } | null;
}

function ScanningView({ statusMessage, streamingText, chunkProgress }: ScanningViewProps) {
  const [progress, setProgress] = useState(0);
  const [showSlowMsg, setShowSlowMsg] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamingTextRef = useRef<HTMLDivElement>(null);

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
    if (streamingTextRef.current) {
      streamingTextRef.current.scrollTop = streamingTextRef.current.scrollHeight;
    }
  }, [streamingText]);

  return (
    <div className="flex flex-col" style={{ padding: "2rem 1rem", gap: 16 }}>
      <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", letterSpacing: "-0.01em", textAlign: "center" }}>
        {statusMessage}
      </p>
      <div style={{ width: "100%", height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 9999 }}>
        <div
          className="transition-all duration-300"
          style={{ width: `${progress}%`, height: 3, background: "#5b4fff", borderRadius: 9999 }}
        />
      </div>
      {chunkProgress ? (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 4, fontFamily: "monospace" }}>
            {chunkProgress.completed} / {chunkProgress.total} sections
          </div>
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {Array.from({ length: chunkProgress.total }).map((_, i) => (
              <div key={i} style={{
                width: 12, height: 4, borderRadius: 2,
                background: i < chunkProgress.completed ? "#5b4fff" : "rgba(255,255,255,0.08)",
                transition: "background 0.2s",
              }} />
            ))}
          </div>
        </div>
      ) : showSlowMsg ? (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center" }}>
          Still working — this contract may be complex…
        </p>
      ) : null}
      {streamingText.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "#818cf8", marginBottom: 6 }}>
            Gemini is thinking...
          </p>
          <div
            ref={streamingTextRef}
            style={{
              background: "rgba(0,0,0,0.3)",
              border: "0.5px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
              padding: "12px 14px",
              fontFamily: "'Courier New', monospace",
              fontSize: 11,
              color: "rgba(255,255,255,0.35)",
              maxHeight: 180,
              overflowY: "auto",
              wordBreak: "break-all",
            }}
          >
            {streamingText}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

export function RiskPanelSkeleton() {
  return (
    <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: 12 }}>
      <Skeleton style={{ height: 120, borderRadius: 14 }} />
      <Skeleton style={{ height: 80, borderRadius: 12 }} />
      <div style={{ display: "flex", gap: 6 }}>
        {[80, 100, 90, 110].map((w, i) => (
          <Skeleton key={i} style={{ width: w, height: 28, borderRadius: 9999 }} />
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} style={{ height: 110, borderRadius: 12 }} />
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
  const [activeClauseIndex, setActiveClauseIndex] = useState<number | null>(null);
  const [displayScore, setDisplayScore] = useState(0);
  const [scanStatusMessage, setScanStatusMessage] = useState("Connecting to Gemini...");
  const [streamingText, setStreamingText] = useState("");
  const [chunkProgress, setChunkProgress] = useState<{ completed: number; total: number } | null>(null);

  useEffect(() => {
    setActiveSeverity("all");
    setActiveClauseIndex(null);
  }, [activeCategory]);

  useEffect(() => {
    if (state.status !== "done") return;
    const target = state.scan.risk_score;
    if (displayScore === target) return;
    const duration = 1000;
    const steps = 40;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) { setDisplayScore(target); clearInterval(timer); }
      else setDisplayScore(Math.round(current));
    }, duration / steps);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

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
                  toast.success("Analysis complete", {
                    description: `Risk score: ${payload.scan.risk_score}/100`,
                  });
                  // Fire-and-forget email
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
        // 409 means a scan is already running — just show scanning state
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

    // Small delay to ensure the DB write has propagated before scan-stream reads status
    await new Promise((resolve) => setTimeout(resolve, 300));

    dispatch({ status: "scanning" });
    onScanStart?.();
    await runScan();
  }

  // ── Idle ──
  if (state.status === "idle") {
    return (
      <div
        className="flex flex-col items-center text-center"
        style={{
          background: "rgba(255,255,255,0.025)",
          border: "0.5px solid rgba(255,255,255,0.07)",
          borderRadius: 16,
          padding: "2.5rem 1.5rem",
          gap: 14,
        }}
      >
        <div
          className="glow-pulse"
          style={{
            width: 60, height: 60, borderRadius: "50%",
            background: "rgba(91,79,255,0.12)",
            border: "0.5px solid rgba(91,79,255,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <ShieldCheck size={28} color="#818cf8" strokeWidth={1.5} />
        </div>
        <div>
          <h3 style={{ fontSize: 24, fontWeight: 600, color: "#ffffff", marginBottom: 8, letterSpacing: "-0.02em" }}>
            Ready to Analyse
          </h3>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
            This contract hasn&apos;t been scanned yet. Click below to identify risky clauses.
          </p>
        </div>
        <button
          onClick={startScan}
          style={{
            width: "100%",
            height: 52,
            background: "linear-gradient(135deg, #5b4fff, #7c3aed)",
            color: "white",
            border: "none",
            borderRadius: 14,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(91,79,255,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            marginTop: 4,
            fontFamily: "inherit",
          }}
        >
          <Zap size={17} />
          Analyse contract
        </button>
      </div>
    );
  }

  // ── Scanning ──
  if (state.status === "scanning") {
    return <ScanningView statusMessage={scanStatusMessage} streamingText={streamingText} chunkProgress={chunkProgress} />;
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
        <div style={{ background: "rgba(255,149,0,0.06)", border: "0.5px solid rgba(255,149,0,0.25)", borderRadius: 12, padding: "1.25rem" }}>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
            <ScanLine size={16} color="#ff9500" />
            <p style={{ fontSize: 13, fontWeight: 500, color: "#ff9500", margin: 0 }}>Scanned PDF detected</p>
          </div>
          <p style={{ fontSize: 12.5, color: "rgba(255,180,80,0.7)", lineHeight: 1.6, marginBottom: 12, whiteSpace: "pre-line" }}>
            {"This PDF contains scanned images rather than selectable text.\n\nTo fix this:\n• Adobe Acrobat → Tools → Enhance Scans → Recognize Text\n• Free OCR: "}
            <a href="https://smallpdf.com/pdf-to-word" target="_blank" rel="noopener noreferrer" style={{ color: "#ff9500" }}>smallpdf.com/pdf-to-word</a>
            {"\n• Or export as PDF directly from Word / Google Docs"}
          </p>
          <button onClick={() => dispatch({ status: "idle" })} style={{ fontSize: 12, color: "#818cf8", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
            Upload a different file
          </button>
        </div>
      );
    }

    if (isPassword) {
      return (
        <div style={{ background: "rgba(255,149,0,0.06)", border: "0.5px solid rgba(255,149,0,0.25)", borderRadius: 12, padding: "1.25rem" }}>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
            <Lock size={16} color="#ff9500" />
            <p style={{ fontSize: 13, fontWeight: 500, color: "#ff9500", margin: 0 }}>Password-protected PDF</p>
          </div>
          <p style={{ fontSize: 12.5, color: "rgba(255,180,80,0.7)", lineHeight: 1.6, marginBottom: 12 }}>
            {"To remove the password:\n• Adobe Acrobat: File → Properties → Security → Change to \"No Security\"\n• Online (free): "}
            <a href="https://smallpdf.com/unlock-pdf" target="_blank" rel="noopener noreferrer" style={{ color: "#ff9500" }}>smallpdf.com/unlock-pdf</a>
            {"\n• Google Chrome: Open PDF → Print → Save as PDF"}
          </p>
          <button onClick={() => dispatch({ status: "idle" })} style={{ fontSize: 12, color: "#818cf8", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
            Upload unlocked file
          </button>
        </div>
      );
    }

    if (isComplex) {
      return (
        <div style={{ background: "rgba(91,79,255,0.06)", border: "0.5px solid rgba(91,79,255,0.25)", borderRadius: 12, padding: "1.25rem" }}>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
            <FileWarning size={16} color="#818cf8" />
            <p style={{ fontSize: 13, fontWeight: 500, color: "#818cf8", margin: 0 }}>Document too complex to parse</p>
          </div>
          <p style={{ fontSize: 12.5, color: "rgba(180,180,255,0.6)", lineHeight: 1.6, marginBottom: 12 }}>
            Try uploading just the main agreement pages without annexes and form templates.
          </p>
          <button onClick={() => dispatch({ status: "idle" })} style={{ fontSize: 12, color: "#818cf8", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
            Try again
          </button>
        </div>
      );
    }

    if (isTimeout) {
      return (
        <div style={{ background: "rgba(255,77,77,0.06)", border: "0.5px solid rgba(255,77,77,0.25)", borderRadius: 12, padding: "1.25rem" }}>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
            <Clock size={16} color="#ff4d4d" />
            <p style={{ fontSize: 13, fontWeight: 500, color: "#ff4d4d", margin: 0 }}>Analysis timed out</p>
          </div>
          <p style={{ fontSize: 12.5, color: "rgba(255,120,120,0.7)", lineHeight: 1.6, marginBottom: 12 }}>
            This contract is taking longer than expected. Please try again — Gemini processes faster on retry.
          </p>
          <button onClick={() => dispatch({ status: "idle" })} style={{ fontSize: 12, color: "#818cf8", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
            Try again
          </button>
        </div>
      );
    }

    return (
      <div style={{ background: "rgba(255,77,77,0.08)", border: "0.5px solid rgba(255,77,77,0.25)", borderRadius: 12, padding: "1.25rem" }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "#ff4d4d", marginBottom: 6 }}>Analysis failed</p>
        <p style={{ fontSize: 12.5, color: "rgba(255,120,120,0.7)", lineHeight: 1.5, marginBottom: 12 }}>{state.message}</p>
        <button onClick={() => dispatch({ status: "idle" })} style={{ fontSize: 12, color: "#818cf8", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}>
          Try again
        </button>
      </div>
    );
  }

  // ── Done ──
  const { scan } = state;
  const color = scoreColor(scan.risk_score);
  const grade = scoreGrade(scan.risk_score);

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
    <>
      <div className="flex flex-col" style={{ gap: 14, paddingBottom: 80 }}>

        {/* Risk score with radial glow */}
        <div className="flex flex-col" style={{ gap: 6 }}>
          <div style={{ position: "relative", display: "inline-flex", alignItems: "flex-end", gap: 10 }}>
            {/* Radial glow behind score number */}
            <div
              style={{
                position: "absolute",
                left: -20, top: "50%",
                transform: "translateY(-50%)",
                width: 160, height: 160,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${color}28 0%, transparent 70%)`,
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
            <span style={{ fontSize: 96, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.05em", position: "relative", zIndex: 1 }}>
              {displayScore}
            </span>
            <div className="flex flex-col items-start" style={{ paddingBottom: 12, gap: 4, position: "relative", zIndex: 1 }}>
              <span
                style={{
                  fontSize: 22, fontWeight: 700, color,
                  background: `${color}18`, border: `1px solid ${color}40`,
                  borderRadius: 8, padding: "2px 10px", lineHeight: 1.4,
                }}
              >
                {grade}
              </span>
            </div>
          </div>
          <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
            Risk Score
          </p>
          <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 9999, overflow: "hidden" }}>
            <div
              style={{
                width: `${displayScore}%`, height: 4, borderRadius: 9999,
                background: color, transition: "width 1s ease-out",
              }}
            />
          </div>
        </div>

        {/* Executive summary */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "0.5px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "14px 16px" }}>
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5b4fff", marginBottom: 6 }}>
            Analysis Summary
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>
            {scan.summary}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col" style={{ gap: 6 }}>
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
                    fontSize: 11, padding: "4px 10px", borderRadius: 9999,
                    border: "none", cursor: "pointer", transition: "all 0.15s",
                    background: active ? "#5b4fff" : "rgba(255,255,255,0.05)",
                    color: active ? "#ffffff" : "rgba(255,255,255,0.4)",
                    fontWeight: active ? 500 : 400,
                    fontFamily: "inherit",
                  }}
                >
                  {cat === "all" ? "All" : categoryLabel(cat)} ({count})
                </button>
              );
            })}
          </div>

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
                    fontSize: 11, padding: "4px 10px", borderRadius: 9999,
                    cursor: "pointer", transition: "all 0.15s",
                    background: active ? sev === "all" ? "#5b4fff" : `${sevCol}33` : "rgba(255,255,255,0.05)",
                    color: active ? sev === "all" ? "#ffffff" : sevCol! : "rgba(255,255,255,0.4)",
                    border: active && sev !== "all" ? `0.5px solid ${sevCol}66` : "none",
                    fontWeight: active ? 500 : 400,
                    fontFamily: "inherit",
                  }}
                >
                  {sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {pageTexts && pageTexts.length > 0 && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontStyle: "italic", marginBottom: -6 }}>
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
                style={{ marginTop: 8, fontSize: 12, color: "#818cf8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}
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

      {/* Sticky action buttons */}
      <div
        style={{
          position: "sticky", bottom: 0,
          background: "rgba(6,6,9,0.95)", backdropFilter: "blur(12px)",
          borderTop: "0.5px solid rgba(255,255,255,0.06)",
          padding: "12px 0",
          display: "flex", alignItems: "center", gap: 8,
          marginLeft: -24, marginRight: -24, paddingLeft: 24, paddingRight: 24,
        }}
      >
        {/* Download PDF */}
        <button
          onClick={() => exportScanReport(scan, contractTitle)}
          style={{
            flex: 1, height: 40,
            background: "rgba(255,255,255,0.04)",
            border: "0.5px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            fontSize: 12.5, fontWeight: 500,
            color: "rgba(255,255,255,0.6)",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            transition: "all 0.15s",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
        >
          <Download size={13} />
          Download PDF
        </button>

        {/* Download .docx (coming soon) */}
        <button
          disabled
          title="Coming soon"
          style={{
            flex: 1, height: 40,
            background: "rgba(255,255,255,0.04)",
            border: "0.5px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            fontSize: 12.5, fontWeight: 500,
            color: "rgba(255,255,255,0.6)",
            cursor: "not-allowed",
            opacity: 0.4,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontFamily: "inherit",
          }}
        >
          <Download size={13} />
          Download .docx
        </button>

        {/* Re-analyse */}
        <button
          onClick={handleRescan}
          style={{
            background: "none",
            border: "none",
            borderRadius: 8,
            padding: "0 10px",
            height: 40,
            fontSize: 12, fontWeight: 500,
            color: "rgba(255,255,255,0.3)",
            cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5,
            transition: "color 0.15s",
            fontFamily: "inherit",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}
        >
          <RefreshCw size={12} />
          Re-analyse
        </button>
      </div>
    </>
  );
}
