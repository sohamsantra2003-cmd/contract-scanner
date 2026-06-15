import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div style={{ padding: "48px 40px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", color: "var(--tx-primary)", marginBottom: 6 }}>
          Contract Chat
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--tx-secondary)" }}>
          Ask questions about any contract in plain English.
        </p>
      </div>

      <div className="card" style={{ padding: "60px 40px", textAlign: "center" }}>
        <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 20, opacity: 0.5 }}>💬</div>
        <h2 style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 20, color: "var(--tx-primary)", marginBottom: 8, letterSpacing: "-0.02em" }}>
          AI Chat
        </h2>
        <p style={{ fontSize: 13.5, color: "var(--tx-secondary)", lineHeight: 1.6, maxWidth: 360, margin: "0 auto 20px" }}>
          Ask questions about any contract in plain English. Gemini answers with clause-level citations.
        </p>
        <span style={{
          display: "inline-block", fontSize: 11, fontWeight: 600,
          letterSpacing: "0.08em", textTransform: "uppercase",
          color: "var(--ac)", background: "var(--ac-bg)",
          border: "1px solid rgba(255,149,0,0.2)",
          borderRadius: 9999, padding: "4px 14px",
        }}>
          Coming soon
        </span>
      </div>
    </div>
  );
}
