"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, ChevronRight, Trash2, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { deleteContract } from "@/app/actions/contracts";

interface Contract {
  id: string;
  title: string;
  status: string;
  created_at: string;
  scans?: { risk_score: number; scanned_at: string }[];
}

const statusStyles: Record<string, React.CSSProperties> = {
  pending: {
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.4)",
    border: "0.5px solid rgba(255,255,255,0.1)",
  },
  scanning: {
    background: "rgba(234,179,8,0.1)",
    color: "#fbbf24",
    border: "0.5px solid rgba(234,179,8,0.2)",
  },
  complete: {
    background: "rgba(34,197,94,0.1)",
    color: "#4ade80",
    border: "0.5px solid rgba(34,197,94,0.2)",
  },
  error: {
    background: "rgba(239,68,68,0.1)",
    color: "#f87171",
    border: "0.5px solid rgba(239,68,68,0.2)",
  },
};

function scoreStyle(score: number): React.CSSProperties {
  if (score <= 29) return { background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "0.5px solid rgba(34,197,94,0.2)" };
  if (score <= 69) return { background: "rgba(234,179,8,0.1)", color: "#fbbf24", border: "0.5px solid rgba(234,179,8,0.2)" };
  return { background: "rgba(239,68,68,0.1)", color: "#f87171", border: "0.5px solid rgba(239,68,68,0.2)" };
}

export function ContractRow({ contract }: { contract: Contract }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Most recent scan score
  const latestScore = contract.scans?.[0]?.risk_score;
  const hasScore = contract.status === "complete" && latestScore !== undefined;

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    await deleteContract(contract.id);
    router.refresh();
  }

  function onTrashClick(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirming(true);
  }

  function onCancel(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirming(false);
  }

  return (
    <div
      onClick={() => !confirming && router.push(`/dashboard/contracts/${contract.id}`)}
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "0.5px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        padding: "12px 16px",
        cursor: confirming ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!confirming)
          (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.025)";
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          background: "rgba(99,102,241,0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <FileText size={18} color="#818cf8" />
      </div>

      {/* Title + date */}
      <div className="flex-1 min-w-0">
        <p
          className="truncate"
          style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", fontWeight: 500, marginBottom: 3 }}
        >
          {contract.title}
        </p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
          {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
        </p>
      </div>

      {/* Right side */}
      {confirming ? (
        <div className="flex items-center flex-shrink-0" style={{ gap: 6 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginRight: 4 }}>
            Delete?
          </span>
          <button
            onClick={onCancel}
            style={{
              padding: "5px 12px",
              borderRadius: 7,
              border: "0.5px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.45)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5"
            style={{
              padding: "5px 12px",
              borderRadius: 7,
              border: "0.5px solid rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.1)",
              color: "#f87171",
              fontSize: 12,
              fontWeight: 500,
              cursor: deleting ? "not-allowed" : "pointer",
              opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting && <Loader2 size={11} className="animate-spin" />}
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      ) : (
        <div className="flex items-center flex-shrink-0" style={{ gap: 8 }}>
          {/* Risk score badge — only on completed contracts */}
          {hasScore && (
            <span
              style={{
                ...scoreStyle(latestScore!),
                fontSize: 10,
                fontWeight: 500,
                borderRadius: 4,
                padding: "2px 6px",
              }}
            >
              {latestScore}
            </span>
          )}

          <span
            style={{
              ...(statusStyles[contract.status] ?? statusStyles.pending),
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 6,
              padding: "3px 9px",
              textTransform: "capitalize",
            }}
          >
            {contract.status}
          </span>

          <button
            onClick={onTrashClick}
            className="hover:opacity-100 transition-opacity"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 7,
              border: "0.5px solid rgba(255,255,255,0.06)",
              background: "transparent",
              color: "rgba(255,255,255,0.25)",
              cursor: "pointer",
              opacity: 0.5,
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.color = "#f87171";
              el.style.borderColor = "rgba(239,68,68,0.3)";
              el.style.background = "rgba(239,68,68,0.08)";
              el.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.style.color = "rgba(255,255,255,0.25)";
              el.style.borderColor = "rgba(255,255,255,0.06)";
              el.style.background = "transparent";
              el.style.opacity = "0.5";
            }}
          >
            <Trash2 size={13} />
          </button>
          <ChevronRight size={16} color="rgba(255,255,255,0.2)" />
        </div>
      )}
    </div>
  );
}
