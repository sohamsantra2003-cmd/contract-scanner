"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { signIn, signInWithMagicLink } from "@/app/actions/auth";

function ShieldLogo({ size = 28 }: { size?: number }) {
  const id = "sl-login-" + size;
  return (
    <svg width={size} height={Math.round(size * 1.17)} viewBox="0 0 24 28" fill="none">
      <defs>
        <linearGradient id={id} x1="2" y1="1" x2="22" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFD080" />
          <stop offset="100%" stopColor="#FF9500" />
        </linearGradient>
      </defs>
      <path d="M12 1L2 5.5V13c0 6.35 4.5 12.28 10 13.88C17.5 25.28 22 19.35 22 13V5.5L12 1z"
        fill={"url(#" + id + ")"} fillOpacity=".18"
        stroke={"url(#" + id + ")"} strokeWidth="1.4" strokeLinejoin="round" />
      <line x1="7.5" y1="12" x2="16.5" y2="12" stroke={"url(#" + id + ")"} strokeWidth="1.5" strokeLinecap="round" opacity=".95" />
      <line x1="7.5" y1="15.8" x2="14.2" y2="15.8" stroke={"url(#" + id + ")"} strokeWidth="1.5" strokeLinecap="round" opacity=".7" />
      <line x1="7.5" y1="19.5" x2="11.5" y2="19.5" stroke={"url(#" + id + ")"} strokeWidth="1.5" strokeLinecap="round" opacity=".45" />
    </svg>
  );
}

function SubmitButton({ label, formAction }: { label: string; formAction: (fd: FormData) => void | Promise<void> }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={pending}
      className="btn btn-primary btn-lg"
      style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
    >
      {pending ? <Loader2 size={16} className="animate-spin" /> : label}
    </button>
  );
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const message = searchParams.get("message");
  const [focused, setFocused] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", overflow: "hidden", background: "#000" }}>

      {/* ── LEFT HERO PANEL ── */}
      <div style={{
        flex: "0 0 54%", position: "relative", overflow: "hidden",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "64px 72px",
      }}>
        {/* Top orange glow */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 320, pointerEvents: "none",
          background: "radial-gradient(ellipse 90% 100% at 50% 0%, rgba(255,149,0,0.1) 0%, transparent 65%)",
        }} />

        {/* Giant faint shield watermark */}
        <div style={{ position: "absolute", right: -60, top: "50%", transform: "translateY(-50%)", opacity: 0.03, pointerEvents: "none" }}>
          <ShieldLogo size={480} />
        </div>

        {/* Content */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Brand row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 64 }}>
            <ShieldLogo size={34} />
            <span style={{ fontFamily: "var(--ff-display)", fontWeight: 800, fontSize: 18, color: "var(--tx-secondary)", letterSpacing: "-0.01em" }}>
              Contract Scanner
            </span>
          </div>

          {/* Headline */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: "var(--ff-display)", fontWeight: 800, fontSize: 54, lineHeight: 1.05, letterSpacing: "-0.035em", color: "var(--tx-primary)" }}>
              Read smarter.
            </div>
            <div style={{ fontFamily: "var(--ff-display)", fontWeight: 800, fontSize: 54, lineHeight: 1.05, letterSpacing: "-0.035em", color: "var(--ac)" }}>
              Sign safer.
            </div>
          </div>

          {/* Subtext */}
          <p style={{ fontSize: 16, color: "var(--tx-secondary)", lineHeight: 1.72, maxWidth: 400, marginBottom: 52 }}>
            Upload any contract — the AI finds every risky clause, explains it in plain English, and rewrites it safely. In 30 seconds.
          </p>

          {/* Floating product preview card */}
          <div style={{
            background: "#141414",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 18, padding: "18px 20px", maxWidth: 400,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 24px 64px rgba(0,0,0,0.7)",
            animation: "floatUp 5s ease-in-out infinite",
          }}>
            {/* Card header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx-primary)", marginBottom: 3 }}>
                  Software License Agreement
                </div>
                <div style={{ fontSize: 11.5, color: "var(--tx-secondary)" }}>
                  TechSolutions Pvt. Ltd. · 24 pages
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontFamily: "var(--ff-mono)", fontSize: 22, fontWeight: 700, color: "var(--rh)" }}>72</span>
                <span style={{ fontSize: 10, color: "var(--tx-muted)" }}> / 100 risk</span>
              </div>
            </div>

            {/* Mini risk bar */}
            <div style={{ display: "flex", gap: 2, height: 4, marginBottom: 14, borderRadius: 99 }}>
              <div style={{ flex: 30, background: "var(--rh)", borderRadius: 99 }} />
              <div style={{ flex: 20, background: "var(--ac)", borderRadius: 99 }} />
              <div style={{ flex: 10, background: "var(--rl)", borderRadius: 99 }} />
              <div style={{ flex: 40, background: "rgba(255,255,255,0.07)", borderRadius: 99 }} />
            </div>

            {/* Clause items */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { label: "UNLIMITED LIABILITY EXPOSURE", color: "var(--rh)" },
                { label: "90-DAY AUTO-RENEWAL TRAP", color: "var(--rh)" },
                { label: "UNILATERAL PRICE INCREASE", color: "var(--rm)" },
              ].map((c) => (
                <div key={c.label} style={{
                  display: "flex", alignItems: "center",
                  padding: "8px 10px", background: "rgba(255,255,255,0.03)",
                  borderRadius: 8, borderLeft: `2px solid ${c.color}`,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c.color, letterSpacing: "0.04em" }}>
                    {c.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--rl)", flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: "var(--tx-muted)" }}>Analysis completed in 28 seconds</span>
            </div>
          </div>

          {/* Trust row */}
          <div style={{ display: "flex", gap: 28, marginTop: 36, flexWrap: "wrap" }}>
            {["🔒 SOC 2 Type II", "🇮🇳 Indian Law Optimised", "⚡ 30-second analysis"].map((item) => (
              <span key={item} style={{ fontSize: 12.5, color: "var(--tx-muted)" }}>{item}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ── */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "60px 56px",
        borderLeft: "1px solid var(--bd-subtle)",
        background: "var(--bg-surface)",
      }}>
        <div style={{ width: "100%", maxWidth: 368, animation: "fadeUp .35s .1s ease both" }}>

          <h1 style={{ fontFamily: "var(--ff-display)", fontWeight: 800, fontSize: 32, letterSpacing: "-0.03em", marginBottom: 6, color: "var(--tx-primary)" }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 14, color: "var(--tx-secondary)", marginBottom: 32 }}>
            New here?{" "}
            <Link href="/signup" style={{ color: "var(--ac)", textDecoration: "none" }}>Sign up free</Link>
          </p>

          {/* Status messages */}
          {error && (
            <div style={{ background: "var(--rh-bg)", border: "1px solid var(--rh-bd)", borderRadius: "var(--r-sm)", padding: "10px 14px", fontSize: 13, color: "var(--rh)", marginBottom: 20 }}>
              {error}
            </div>
          )}
          {message && (
            <div style={{ background: "var(--ac-bg)", border: "1px solid rgba(255,149,0,.2)", borderRadius: "var(--r-sm)", padding: "10px 14px", fontSize: 13, color: "var(--ac-lite)", marginBottom: 20 }}>
              {message}
            </div>
          )}

          <form>
            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tx-secondary)", marginBottom: 7 }}>
                Email
              </label>
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                className="input"
                style={focused === "email" ? {} : {}}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tx-secondary)" }}>
                  Password
                </label>
                <span style={{ fontSize: 12.5, color: "var(--ac)", fontWeight: 600, cursor: "pointer" }}>
                  Forgot?
                </span>
              </div>
              <input
                name="password"
                type="password"
                placeholder="••••••••"
                required
                className="input"
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
              />
            </div>

            <SubmitButton label="Sign in" formAction={signIn} />

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--bd-subtle)" }} />
              <span style={{ fontSize: 11, color: "var(--tx-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "var(--bd-subtle)" }} />
            </div>

            {/* Magic link */}
            <button
              type="submit"
              formAction={signInWithMagicLink}
              formNoValidate
              className="btn btn-ghost"
              style={{ width: "100%", justifyContent: "center" }}
            >
              ✨ Sign in with magic link
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
