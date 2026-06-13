"use client";

import { useRef } from "react";
import { FilePlus, Upload, Search, MessageSquare, PenLine } from "lucide-react";

const uploadZoneShimmer: React.CSSProperties = {
  position: "absolute",
  inset: -1,
  borderRadius: 17,
  background:
    "linear-gradient(135deg, rgba(99,102,241,0.3), transparent 50%, rgba(124,58,237,0.2))",
  WebkitMask:
    "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
  WebkitMaskComposite: "destination-out",
  maskComposite: "exclude",
  pointerEvents: "none",
};

const featureCards = [
  { Icon: Search, label: "Risk detection" },
  { Icon: MessageSquare, label: "Plain English explanations" },
  { Icon: PenLine, label: "Safer rewrites" },
];

export function DashboardContent({
  email,
  initials,
}: {
  email: string;
  initials: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerUpload = () => fileInputRef.current?.click();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#07070d", position: "relative", overflow: "hidden" }}
    >
      {/* Grid texture */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          backgroundImage:
            "linear-gradient(rgba(79,70,229,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(79,70,229,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          zIndex: 0,
        }}
      />
      {/* Glow orb */}
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 400,
          top: 50,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(79,70,229,0.07)",
          filter: "blur(80px)",
          borderRadius: 9999,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Navbar */}
      <header
        className="sticky top-0 flex items-center justify-between z-50"
        style={{
          height: 50,
          background: "rgba(7,7,13,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: "0.5px solid rgba(255,255,255,0.05)",
          padding: "0 1.25rem",
        }}
      >
        {/* Wordmark — inline to avoid import issues in client component */}
        <div className="flex items-center gap-2.5">
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {/* Shield icon SVG inline — avoids lucide import in both client + server */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
          </div>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: "rgba(255,255,255,0.85)", letterSpacing: "-0.01em" }}>
            Contract Scanner
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center" style={{ gap: 10 }}>
          {/* Plan badge */}
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              background: "rgba(99,102,241,0.1)",
              color: "#818cf8",
              border: "0.5px solid rgba(99,102,241,0.2)",
              borderRadius: 5,
              padding: "3px 8px",
            }}
          >
            Free plan
          </span>

          {/* Email */}
          <span
            className="hidden sm:block truncate"
            style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", maxWidth: 160, letterSpacing: "-0.01em" }}
          >
            {email}
          </span>

          {/* Avatar */}
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: 27,
              height: 27,
              borderRadius: "50%",
              background: "rgba(99,102,241,0.15)",
              border: "0.5px solid rgba(99,102,241,0.3)",
              fontSize: 9.5,
              fontWeight: 500,
              color: "#818cf8",
            }}
          >
            {initials}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center relative z-10 px-4 py-12">
        <div className="flex flex-col items-center w-full" style={{ maxWidth: 400 }}>

          {/* Upload zone */}
          <div
            className="relative cursor-pointer transition-all group"
            onClick={triggerUpload}
            style={{ marginBottom: "2rem" }}
          >
            <div style={uploadZoneShimmer} />
            <div
              className="flex flex-col items-center justify-center transition-all"
              style={{
                width: 200,
                height: 140,
                borderRadius: 16,
                border: "1px dashed rgba(99,102,241,0.25)",
                background: "rgba(99,102,241,0.04)",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "rgba(99,102,241,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FilePlus size={22} color="#818cf8" />
              </div>
              <div className="text-center" style={{ marginTop: -2 }}>
                <p style={{ fontSize: 11.5, fontWeight: 500, color: "rgba(255,255,255,0.35)", lineHeight: 1 }}>
                  Drop PDF here
                </p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", marginTop: 4 }}>
                  or click to browse
                </p>
              </div>
            </div>
          </div>

          {/* Heading */}
          <h1
            className="text-center"
            style={{ fontSize: 20, fontWeight: 500, color: "#ffffff", letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 8 }}
          >
            Your contract, analysed in seconds
          </h1>

          {/* Description */}
          <p
            className="text-center mx-auto"
            style={{ fontSize: 12.5, color: "rgba(255,255,255,0.3)", lineHeight: 1.65, marginBottom: "1.5rem", maxWidth: 320 }}
          >
            Upload any vendor agreement, NDA, or service contract. We&apos;ll identify every risky clause and explain it in plain English — no lawyer needed.
          </p>

          {/* CTA row */}
          <div className="flex items-center justify-center" style={{ gap: 8 }}>
            <button
              onClick={triggerUpload}
              className="flex items-center hover:opacity-90 transition-opacity"
              style={{
                gap: 6,
                background: "#4f46e5",
                color: "white",
                border: "none",
                borderRadius: 9,
                padding: "9px 18px",
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: "-0.01em",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(79,70,229,0.35), inset 0 1px 0 rgba(255,255,255,0.1)",
              }}
            >
              <Upload size={14} />
              Upload contract
            </button>

            <button
              className="flex items-center hover:opacity-80 transition-opacity"
              style={{
                gap: 6,
                background: "transparent",
                color: "rgba(255,255,255,0.3)",
                border: "0.5px solid rgba(255,255,255,0.07)",
                borderRadius: 9,
                padding: "9px 14px",
                fontSize: 12,
                letterSpacing: "-0.01em",
                cursor: "pointer",
              }}
            >
              Try a demo
            </button>
          </div>

          {/* Feature cards */}
          <div className="flex justify-center" style={{ gap: 8, marginTop: "2rem" }}>
            {featureCards.map(({ Icon, label }) => (
              <div
                key={label}
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "0.5px solid rgba(255,255,255,0.05)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  maxWidth: 110,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: "rgba(99,102,241,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 6,
                  }}
                >
                  <Icon size={12} color="#818cf8" />
                </div>
                <p style={{ fontSize: 10.5, fontWeight: 500, color: "rgba(255,255,255,0.5)", lineHeight: 1.3 }}>
                  {label}
                </p>
              </div>
            ))}
          </div>

        </div>
      </main>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={() => {/* Day 2 */}}
      />
    </div>
  );
}
