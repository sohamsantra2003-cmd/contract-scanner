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

function scoreColor(score: number) {
  if (score <= 29) return "#34c759";
  if (score <= 69) return "#ff9500";
  return "#ff4d4d";
}

function scoreBg(score: number) {
  if (score <= 29) return "rgba(52,199,89,0.12)";
  if (score <= 69) return "rgba(255,149,0,0.12)";
  return "rgba(255,77,77,0.12)";
}

function scoreLabel(score: number) {
  if (score <= 29) return "Low";
  if (score <= 69) return "Medium";
  return "High";
}

export function ContractRow({ contract }: { contract: Contract }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hovered, setHovered] = useState(false);

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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)",
        border: `0.5px solid ${hovered ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 14,
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        cursor: confirming ? "default" : "pointer",
        transform: hovered && !confirming ? "translateX(4px)" : "none",
        transition: "all 0.2s cubic-bezier(0.25,0.1,0.25,1)",
      }}
    >
      {/* File icon */}
      <div
        style={{
          width: 44, height: 44, borderRadius: 12,
          background: "rgba(91,79,255,0.1)",
          border: "0.5px solid rgba(91,79,255,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <FileText size={20} color="#818cf8" />
      </div>

      {/* Title + date */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: 15, fontWeight: 500, color: "#fff",
            letterSpacing: "-0.01em", marginBottom: 3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {contract.title}
        </p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
          {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
        </p>
      </div>

      {/* Right side */}
      {confirming ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginRight: 4 }}>Delete?</span>
          <button
            onClick={onCancel}
            style={{
              padding: "5px 12px", borderRadius: 7,
              border: "0.5px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.45)", fontSize: 12, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 12px", borderRadius: 7,
              border: "0.5px solid rgba(255,77,77,0.3)",
              background: "rgba(255,77,77,0.1)",
              color: "#ff4d4d", fontSize: 12, fontWeight: 500,
              cursor: deleting ? "not-allowed" : "pointer",
              opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting && <Loader2 size={11} className="animate-spin" />}
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {/* Score badge */}
          {hasScore ? (
            <span
              style={{
                background: scoreBg(latestScore!),
                color: scoreColor(latestScore!),
                fontSize: 11, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.04em",
                borderRadius: 6, padding: "3px 10px",
              }}
            >
              {latestScore} · {scoreLabel(latestScore!)}
            </span>
          ) : contract.status === "pending" ? (
            <span
              style={{
                background: "rgba(255,149,0,0.1)",
                color: "#ff9500",
                fontSize: 11, fontWeight: 500,
                borderRadius: 6, padding: "3px 10px",
                border: "0.5px solid rgba(255,149,0,0.2)",
              }}
            >
              Pending
            </span>
          ) : contract.status === "scanning" ? (
            <span
              style={{
                background: "rgba(91,79,255,0.1)",
                color: "#818cf8",
                fontSize: 11, fontWeight: 500,
                borderRadius: 6, padding: "3px 10px",
                border: "0.5px solid rgba(91,79,255,0.2)",
              }}
            >
              Scanning…
            </span>
          ) : contract.status === "error" ? (
            <span
              style={{
                background: "rgba(255,77,77,0.1)",
                color: "#ff4d4d",
                fontSize: 11, fontWeight: 500,
                borderRadius: 6, padding: "3px 10px",
                border: "0.5px solid rgba(255,77,77,0.2)",
              }}
            >
              Error
            </span>
          ) : null}

          <button
            onClick={onTrashClick}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 7,
              border: "0.5px solid rgba(255,255,255,0.06)",
              background: "transparent",
              color: "rgba(255,255,255,0.25)",
              cursor: "pointer", opacity: 0.5,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              el.style.color = "#ff4d4d";
              el.style.borderColor = "rgba(255,77,77,0.3)";
              el.style.background = "rgba(255,77,77,0.08)";
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
