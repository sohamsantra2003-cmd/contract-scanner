"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadContract } from "@/app/actions/contracts";

type UploadState = "idle" | "uploading" | "error";

const uploadZoneShimmer: React.CSSProperties = {
  position: "absolute",
  inset: -1,
  borderRadius: 21,
  background:
    "linear-gradient(135deg, rgba(99,102,241,0.3), transparent 50%, rgba(124,58,237,0.2))",
  WebkitMask:
    "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
  WebkitMaskComposite: "destination-out",
  maskComposite: "exclude",
  pointerEvents: "none",
};

export function UploadZone() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);

  async function handleFile(file: File) {
    // Client-side pre-validation
    if (file.type !== "application/pdf") {
      setState("error");
      setErrorMsg("Please upload a PDF file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setState("error");
      setErrorMsg("File must be under 10MB");
      return;
    }

    setState("uploading");
    setProgress(30);

    // Simulate progress crawl 30 → 85
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) { clearInterval(interval); return 85; }
        return prev + 5;
      });
    }, 200);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadContract(formData);

      clearInterval(interval);

      if (result.error) {
        setState("error");
        setErrorMsg(result.error);
        setProgress(0);
        return;
      }

      setProgress(100);
      toast.success("Contract uploaded", {
        description: "Your contract is ready to analyse.",
      });
      router.push(`/dashboard/contracts/${result.data!.id}`);
    } catch {
      clearInterval(interval);
      setState("error");
      setErrorMsg("An unexpected error occurred. Please try again.");
      setProgress(0);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function reset() {
    setState("idle");
    setErrorMsg("");
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex flex-col items-center w-full" style={{ maxWidth: 560, padding: "0 1rem" }}>
      {/* Upload zone */}
      <div
        className="relative cursor-pointer transition-all group"
        style={{ marginBottom: "2.5rem" }}
        onClick={state === "idle" ? () => fileInputRef.current?.click() : undefined}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <div style={uploadZoneShimmer} />
        <div
          className="flex flex-col items-center justify-center transition-all"
          style={{
            width: 280,
            height: 180,
            borderRadius: 20,
            border: "1px dashed rgba(99,102,241,0.3)",
            background: "rgba(99,102,241,0.04)",
            gap: 12,
            padding: "0 20px",
          }}
        >
          {state === "uploading" ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <Loader2 size={26} color="#818cf8" className="animate-spin" />
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                Uploading contract...
              </p>
              {/* Progress bar */}
              <div
                style={{
                  width: "100%",
                  height: 3,
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 9999,
                }}
              >
                <div
                  className="transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    height: 3,
                    background: "#4f46e5",
                    borderRadius: 9999,
                  }}
                />
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: "rgba(99,102,241,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FilePlus size={26} color="#818cf8" />
              </div>
              <div className="text-center" style={{ marginTop: -2 }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.4)", lineHeight: 1 }}>
                  Drop PDF here
                </p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", marginTop: 5 }}>
                  or click to browse
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error alert */}
      {state === "error" && (
        <div
          style={{
            width: "100%",
            maxWidth: 400,
            background: "rgba(239,68,68,0.08)",
            border: "0.5px solid rgba(239,68,68,0.25)",
            borderRadius: 12,
            padding: "12px 16px",
            marginBottom: "1.5rem",
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 500, color: "#f87171", marginBottom: 4 }}>
            Upload failed
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,120,120,0.7)", marginBottom: 10 }}>
            {errorMsg}
          </p>
          <button
            onClick={reset}
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
      )}

      {/* Heading */}
      <h1
        className="text-center"
        style={{
          fontSize: 32,
          fontWeight: 500,
          color: "#ffffff",
          letterSpacing: "-0.03em",
          lineHeight: 1.15,
          marginBottom: 12,
        }}
      >
        Your contract, analysed in seconds
      </h1>

      {/* Description */}
      <p
        className="text-center mx-auto"
        style={{
          fontSize: 15,
          color: "rgba(255,255,255,0.35)",
          lineHeight: 1.7,
          marginBottom: "2rem",
          maxWidth: 420,
        }}
      >
        Upload any vendor agreement, NDA, or service contract. We&apos;ll
        identify every risky clause and explain it in plain English — no
        lawyer needed.
      </p>

      {/* CTA row */}
      <div className="flex items-center justify-center" style={{ gap: 10 }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={state === "uploading"}
          className="flex items-center hover:opacity-90 transition-opacity"
          style={{
            gap: 8,
            background: "#4f46e5",
            color: "white",
            border: "none",
            borderRadius: 10,
            padding: "12px 28px",
            fontSize: 15,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            cursor: state === "uploading" ? "not-allowed" : "pointer",
            opacity: state === "uploading" ? 0.6 : 1,
            boxShadow: "0 4px 20px rgba(79,70,229,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
        >
          <Upload size={16} />
          Upload contract
        </button>

        <button
          className="flex items-center hover:opacity-80 transition-opacity"
          style={{
            gap: 6,
            background: "transparent",
            color: "rgba(255,255,255,0.3)",
            border: "0.5px solid rgba(255,255,255,0.07)",
            borderRadius: 10,
            padding: "12px 20px",
            fontSize: 14,
            letterSpacing: "-0.01em",
            cursor: "pointer",
          }}
        >
          Try a demo
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </div>
  );
}
