"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, Shield, Check } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { signIn, signInWithMagicLink } from "@/app/actions/auth";

const pageStyle: React.CSSProperties = {
  background: "#07070d",
  minHeight: "100vh",
  position: "relative",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const gridStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  backgroundImage:
    "linear-gradient(rgba(79,70,229,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(79,70,229,0.03) 1px, transparent 1px)",
  backgroundSize: "40px 40px",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.025)",
  border: "0.5px solid rgba(255,255,255,0.07)",
  borderRadius: 20,
  padding: "2rem",
  backdropFilter: "blur(20px)",
  boxShadow:
    "0 0 0 1px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
};

const shimmerStyle: React.CSSProperties = {
  position: "absolute",
  inset: -1,
  borderRadius: 20,
  background:
    "linear-gradient(135deg, rgba(99,102,241,0.3), transparent 50%, rgba(124,58,237,0.2))",
  WebkitMask:
    "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
  WebkitMaskComposite: "destination-out",
  maskComposite: "exclude",
  pointerEvents: "none",
};

function inputStyle(focused: boolean): React.CSSProperties {
  return {
    width: "100%",
    background: focused ? "rgba(99,102,241,0.05)" : "rgba(255,255,255,0.04)",
    border: `0.5px solid ${focused ? "rgba(99,102,241,0.5)" : "rgba(255,255,255,0.08)"}`,
    boxShadow: focused ? "0 0 0 3px rgba(99,102,241,0.08)" : "none",
    borderRadius: 10,
    padding: "10px 13px",
    fontSize: 13.5,
    color: "rgba(255,255,255,0.7)",
    outline: "none",
    transition: "all 0.15s ease",
  };
}

const trustItems = [
  { Icon: Lock, label: "End-to-end encrypted" },
  { Icon: Shield, label: "Files never stored long-term" },
  { Icon: Check, label: "No data sold" },
];

export function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const message = searchParams.get("message");
  const [focused, setFocused] = useState<string | null>(null);

  return (
    <div style={pageStyle}>
      {/* Grid texture */}
      <div style={gridStyle} />

      {/* Orb 1 */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 300,
          top: -80,
          left: -80,
          background: "rgba(79,70,229,0.12)",
          filter: "blur(80px)",
          borderRadius: 9999,
          pointerEvents: "none",
        }}
      />
      {/* Orb 2 */}
      <div
        style={{
          position: "absolute",
          width: 300,
          height: 300,
          bottom: -60,
          right: -40,
          background: "rgba(124,58,237,0.08)",
          filter: "blur(80px)",
          borderRadius: 9999,
          pointerEvents: "none",
        }}
      />

      {/* Content */}
      <div
        className="relative z-10 w-full px-4"
        style={{ maxWidth: 400 }}
      >
        {/* Wordmark */}
        <div className="flex justify-center" style={{ marginBottom: "2.5rem" }}>
          <Wordmark variant="login" />
        </div>

        {/* Card */}
        <div className="relative">
          <div style={shimmerStyle} />
          <div style={cardStyle}>

            {/* Eyebrow */}
            <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6366f1", marginBottom: 8 }}>
              Secure portal
            </p>

            {/* Title */}
            <h1 style={{ fontSize: 22, fontWeight: 500, color: "#ffffff", letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: 4 }}>
              Welcome back
            </h1>

            {/* Subtitle */}
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.3)", lineHeight: 1.5, marginBottom: "1.75rem" }}>
              Sign in to analyse your contracts and protect your business.
            </p>

            {/* Status messages */}
            {error && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "0.5px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "rgba(255,120,120,0.9)", marginBottom: 16 }}>
                {error}
              </div>
            )}
            {message && (
              <div style={{ background: "rgba(99,102,241,0.1)", border: "0.5px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#818cf8", marginBottom: 16 }}>
                {message}
              </div>
            )}

            {/* Form */}
            <form>
              {/* Email */}
              <div style={{ marginBottom: "0.875rem" }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
                  Email
                </label>
                <input
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  className="placeholder:text-white/20"
                  style={inputStyle(focused === "email")}
                  onFocus={() => setFocused("email")}
                  onBlur={() => setFocused(null)}
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: "0.375rem" }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>
                    Password
                  </label>
                  <span style={{ fontSize: 11, color: "#6366f1", opacity: 0.7, cursor: "pointer" }}>
                    Forgot?
                  </span>
                </div>
                <input
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  className="placeholder:text-white/20"
                  style={inputStyle(focused === "password")}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                />
              </div>

              {/* Sign in button */}
              <button
                type="submit"
                formAction={signIn}
                className="relative w-full overflow-hidden hover:bg-[#4338ca] transition-colors"
                style={{
                  background: "#4f46e5",
                  borderRadius: 10,
                  padding: "11px",
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: "white",
                  letterSpacing: "-0.01em",
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(79,70,229,0.35)",
                  marginTop: "1rem",
                  display: "block",
                }}
              >
                <span
                  className="absolute top-0 left-0 right-0 h-px pointer-events-none"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }}
                />
                Sign in
              </button>

              {/* Separator */}
              <div className="flex items-center gap-3" style={{ margin: "1.25rem 0" }}>
                <div className="flex-1" style={{ height: "0.5px", background: "rgba(255,255,255,0.06)" }} />
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  or continue with
                </span>
                <div className="flex-1" style={{ height: "0.5px", background: "rgba(255,255,255,0.06)" }} />
              </div>

              {/* Magic link button */}
              <button
                type="submit"
                formAction={signInWithMagicLink}
                formNoValidate
                className="flex items-center justify-center gap-2 w-full hover:opacity-80 transition-opacity"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "0.5px solid rgba(255,255,255,0.07)",
                  borderRadius: 10,
                  padding: "10px",
                  fontSize: 13,
                  color: "rgba(255,255,255,0.4)",
                  cursor: "pointer",
                }}
              >
                <Mail size={14} style={{ opacity: 0.4 }} />
                Send magic link
              </button>
            </form>

            {/* Footer */}
            <p className="text-center" style={{ marginTop: "1.25rem", fontSize: 12 }}>
              <span style={{ color: "rgba(255,255,255,0.2)" }}>No account? </span>
              <Link href="/signup" style={{ color: "#818cf8", textDecoration: "none" }}>
                Create one free
              </Link>
            </p>
          </div>
        </div>

        {/* Trust strip */}
        <div className="flex flex-wrap items-center justify-center" style={{ marginTop: "1.75rem", gap: 18 }}>
          {trustItems.map(({ Icon, label }) => (
            <div key={label} className="flex items-center" style={{ gap: 6, fontSize: 10.5, color: "rgba(255,255,255,0.18)" }}>
              <Icon size={11} style={{ opacity: 0.35 }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
