"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { deleteContract } from "@/app/actions/contracts";

interface Contract {
  id: string;
  title: string;
  status: string;
  created_at: string;
  scans?: { risk_score: number; scanned_at: string }[];
}

function scoreColor(score: number): string {
  if (score >= 70) return "#FF3B30";
  if (score >= 40) return "#FF9500";
  return "#30D158";
}

function RiskBar({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          width: `${score}%`, height: "100%", borderRadius: 99,
          background: color,
          boxShadow: `0 0 6px ${color}66`,
        }} />
      </div>
      <span style={{
        fontFamily: "var(--ff-mono)", fontSize: 13, fontWeight: 500,
        color, flexShrink: 0, minWidth: 28, textAlign: "right",
      }}>
        {score}
      </span>
    </div>
  );
}

export function ContractRow({ contract }: { contract: Contract }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hovered, setHovered] = useState(false);

  const latestScan = contract.scans?.[0];
  const hasScore = contract.status === "complete" && latestScan !== undefined;

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
        display: "grid",
        gridTemplateColumns: "1fr 150px 185px 120px 40px",
        gap: 16, padding: "15px 24px",
        alignItems: "center",
        cursor: confirming ? "default" : "pointer",
        background: hovered && !confirming ? "rgba(255,255,255,0.025)" : "transparent",
        borderBottom: "1px solid var(--bd-subtle)",
        transition: "background .15s",
      }}
    >
      {/* Col 1: Title + date */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600, color: "var(--tx-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginBottom: 3,
        }}>
          {contract.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--tx-muted)" }}>
          {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
        </div>
      </div>

      {/* Col 2: Client (stub) */}
      <div style={{ fontSize: 13, color: "var(--tx-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        —
      </div>

      {/* Col 3: Risk bar */}
      <div>
        {hasScore ? (
          <RiskBar score={latestScan!.risk_score} />
        ) : (
          <span style={{ fontSize: 12, color: "var(--tx-muted)" }}>—</span>
        )}
      </div>

      {/* Col 4: Status badge */}
      <div>
        {confirming ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={onCancel}
              className="btn btn-ghost btn-sm"
              style={{ padding: "4px 10px", fontSize: 11 }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="btn btn-sm"
              style={{
                padding: "4px 10px", fontSize: 11,
                background: "var(--rh-bg)", color: "var(--rh)",
                border: "1px solid var(--rh-bd)",
                opacity: deleting ? 0.7 : 1,
                cursor: deleting ? "not-allowed" : "pointer",
              }}
            >
              {deleting ? "…" : "Delete"}
            </button>
          </div>
        ) : (
          <span className={`badge badge-${contract.status === "complete" ? "complete" : contract.status === "pending" ? "pending" : contract.status === "scanning" ? "scanning" : "error"}`}>
            {contract.status === "complete" ? "Complete" : contract.status === "pending" ? "Pending" : contract.status === "scanning" ? "Scanning" : "Error"}
          </span>
        )}
      </div>

      {/* Col 5: Chevron or delete */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        {!confirming && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={onTrashClick}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: hovered ? "var(--rh)" : "var(--tx-muted)",
                padding: 4, borderRadius: 4,
                display: "flex", opacity: hovered ? 1 : 0,
                transition: "opacity .15s, color .15s",
              }}
              title="Delete"
            >
              <svg viewBox="0 0 16 16" fill="none" width="13" height="13">
                <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <svg
              viewBox="0 0 16 16" fill="none" width="16" height="16"
              style={{ color: hovered ? "var(--ac)" : "var(--tx-muted)", transition: "color .15s", flexShrink: 0 }}
            >
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
