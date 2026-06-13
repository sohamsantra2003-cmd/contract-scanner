"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { deleteContract } from "@/app/actions/contracts";

interface Props {
  contractId: string;
  redirectTo?: string;
}

export function DeleteContractButton({ contractId, redirectTo = "/dashboard" }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleDelete() {
    setDeleting(true);
    setErrorMsg("");
    const result = await deleteContract(contractId);
    if (result.error) {
      setDeleting(false);
      setConfirming(false);
      setErrorMsg(result.error);
      return;
    }
    router.push(redirectTo);
  }

  if (confirming) {
    return (
      <div className="flex flex-col" style={{ gap: 8 }}>
        <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
          This will permanently delete the contract and its file. This cannot be undone.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => { setConfirming(false); setErrorMsg(""); }}
            disabled={deleting}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 9,
              border: "0.5px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.5)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center justify-center gap-2"
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 9,
              border: "0.5px solid rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.1)",
              color: "#f87171",
              fontSize: 13,
              fontWeight: 500,
              cursor: deleting ? "not-allowed" : "pointer",
              opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : null}
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
        {errorMsg && (
          <p style={{ fontSize: 11.5, color: "#f87171" }}>{errorMsg}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: errorMsg ? 6 : 0 }}>
      <button
        onClick={() => setConfirming(true)}
        className="flex items-center justify-center gap-2 hover:opacity-80 transition-opacity"
        style={{
          width: "100%",
          padding: "9px",
          borderRadius: 9,
          border: "0.5px solid rgba(255,255,255,0.07)",
          background: "transparent",
          color: "rgba(255,255,255,0.3)",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        <Trash2 size={13} />
        Delete contract
      </button>
      {errorMsg && (
        <p style={{ fontSize: 11.5, color: "#f87171" }}>{errorMsg}</p>
      )}
    </div>
  );
}
