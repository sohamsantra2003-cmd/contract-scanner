"use client";

import { useRef } from "react";
import { FilePlus, Upload, Search, MessageSquare, PenLine, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/actions/auth";

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
          width: 600,
          height: 500,
          top: 40,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(79,70,229,0.09)",
          filter: "blur(100px)",
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Navbar */}
      <header
        className="sticky top-0 flex items-center justify-between z-50"
        style={{
          height: 64,
          background: "rgba(7,7,13,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: "0.5px solid rgba(255,255,255,0.06)",
          padding: "0 2rem",
        }}
      >
        {/* Wordmark */}
        <div className="flex items-center gap-2.5">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.9)", letterSpacing: "-0.01em" }}>
            Contract Scanner
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center" style={{ gap: 12 }}>
          {/* Plan pill */}
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.04em",
              background: "rgba(99,102,241,0.12)",
              color: "#818cf8",
              border: "0.5px solid rgba(99,102,241,0.25)",
              borderRadius: 6,
              padding: "4px 10px",
            }}
          >
            Free plan
          </span>

          {/* Email */}
          <span
            className="hidden sm:block truncate"
            style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", maxWidth: 200, letterSpacing: "-0.01em" }}
          >
            {email}
          </span>

          {/* Avatar with dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger style={{ all: "unset", cursor: "pointer" }}>
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "rgba(99,102,241,0.15)",
                  border: "1px solid rgba(99,102,241,0.35)",
                  fontSize: 11,
                  fontWeight: 500,
                  color: "#818cf8",
                  cursor: "pointer",
                }}
              >
                {initials}
              </div>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" style={{ minWidth: 200 }}>
              {/* Email display — plain div, NOT DropdownMenuLabel (crashes with @base-ui) */}
              <div style={{ padding: "6px 8px", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                {email}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex items-center gap-2 cursor-pointer"
                style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}
                onClick={() => signOut()}
              >
                <LogOut size={14} />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center relative z-10 px-4 py-12">
        <div
          className="flex flex-col items-center w-full"
          style={{ maxWidth: 560, padding: "0 1rem" }}
        >

          {/* Upload zone */}
          <div
            className="relative cursor-pointer transition-all group"
            onClick={triggerUpload}
            style={{ marginBottom: "2.5rem" }}
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
              }}
            >
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
            </div>
          </div>

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
            Upload any vendor agreement, NDA, or service contract. We&apos;ll identify every risky clause and explain it in plain English — no lawyer needed.
          </p>

          {/* CTA row */}
          <div className="flex items-center justify-center" style={{ gap: 10 }}>
            <button
              onClick={triggerUpload}
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
                cursor: "pointer",
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

          {/* Feature cards */}
          <div className="flex justify-center flex-wrap" style={{ gap: 12, marginTop: "3rem" }}>
            {featureCards.map(({ Icon, label }) => (
              <div
                key={label}
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "0.5px solid rgba(255,255,255,0.05)",
                  borderRadius: 10,
                  padding: "14px 14px",
                  maxWidth: 140,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    background: "rgba(99,102,241,0.1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 10,
                  }}
                >
                  <Icon size={14} color="#818cf8" />
                </div>
                <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.5)", lineHeight: 1.4 }}>
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
