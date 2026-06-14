"use client";

import React from "react";
import { ShieldX, RefreshCw } from "lucide-react";

interface Props { children: React.ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (process.env.NODE_ENV === "development") {
      console.error("[ErrorBoundary]", error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", background: "#07070d",
          display: "flex", alignItems: "center",
          justifyContent: "center", padding: "2rem",
        }}>
          <div style={{ textAlign: "center", maxWidth: "400px" }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: "rgba(239,68,68,0.1)",
              border: "0.5px solid rgba(239,68,68,0.2)",
              display: "flex", alignItems: "center",
              justifyContent: "center", margin: "0 auto 1.5rem",
            }}>
              <ShieldX size={26} color="#f87171" />
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 500, color: "#ffffff", letterSpacing: "-0.02em", margin: "0 0 8px" }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, margin: "0 0 24px" }}>
              An unexpected error occurred. Your contracts and scan history are safe.
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "#4f46e5", border: "none", borderRadius: 9,
                padding: "10px 20px", fontSize: 13, fontWeight: 500,
                color: "#ffffff", cursor: "pointer",
                boxShadow: "0 4px 14px rgba(79,70,229,0.35)",
              }}
            >
              <RefreshCw size={14} />
              Reload page
            </button>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <pre style={{
                marginTop: "1.5rem", padding: 12,
                background: "rgba(255,255,255,0.03)",
                border: "0.5px solid rgba(255,255,255,0.06)",
                borderRadius: 8, fontSize: 10,
                color: "rgba(255,255,255,0.3)",
                textAlign: "left", overflow: "auto", maxHeight: 200,
              }}>
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
