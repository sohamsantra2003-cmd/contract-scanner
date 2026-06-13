import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { PDFViewer } from "@/components/PDFViewer";

interface PageProps {
  params: Promise<{ id: string }>;
}

function statusBadge(status: string) {
  const styles: Record<string, React.CSSProperties> = {
    uploaded: {
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.4)",
      border: "0.5px solid rgba(255,255,255,0.1)",
    },
    scanning: {
      background: "rgba(234,179,8,0.1)",
      color: "#fbbf24",
      border: "0.5px solid rgba(234,179,8,0.2)",
    },
    complete: {
      background: "rgba(34,197,94,0.1)",
      color: "#4ade80",
      border: "0.5px solid rgba(34,197,94,0.2)",
    },
    error: {
      background: "rgba(239,68,68,0.1)",
      color: "#f87171",
      border: "0.5px solid rgba(239,68,68,0.2)",
    },
  };
  const style = styles[status] ?? styles.uploaded;
  return (
    <span
      style={{
        ...style,
        fontSize: 11,
        fontWeight: 500,
        borderRadius: 6,
        padding: "3px 9px",
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

export default async function ContractPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch contract — always filter by user_id to prevent cross-user access
  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!contract) redirect("/dashboard");

  const createdAt = new Date(contract.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: "100vh", background: "#07070d", color: "#fff" }}
    >
      {/* Page header */}
      <header
        style={{
          height: 60,
          background: "rgba(7,7,13,0.97)",
          backdropFilter: "blur(12px)",
          borderBottom: "0.5px solid rgba(255,255,255,0.06)",
          padding: "0 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        {/* Left: back + title */}
        <div className="flex items-center" style={{ gap: 12, minWidth: 0 }}>
          <Link
            href="/dashboard"
            className="flex items-center hover:opacity-70 transition-opacity flex-shrink-0"
            style={{ gap: 6, fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}
          >
            <ArrowLeft size={15} />
            Dashboard
          </Link>
          <div style={{ width: "0.5px", height: 16, background: "rgba(255,255,255,0.1)", flexShrink: 0 }} />
          <FileText size={15} color="#818cf8" style={{ flexShrink: 0 }} />
          <span
            className="truncate"
            style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.85)", maxWidth: 300 }}
          >
            {contract.title}
          </span>
        </div>

        {/* Right: status + date */}
        <div className="flex items-center flex-shrink-0" style={{ gap: 10 }}>
          {statusBadge(contract.status)}
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
            {createdAt}
          </span>
        </div>
      </header>

      {/* Two-panel layout */}
      <div className="flex flex-col md:flex-row flex-1" style={{ minHeight: 0 }}>

        {/* Left panel — PDF viewer (60% on desktop) */}
        <div
          className="w-full md:w-3/5"
          style={{
            borderRight: "0.5px solid rgba(255,255,255,0.06)",
            height: "calc(100vh - 60px)",
            position: "sticky",
            top: 60,
            overflow: "hidden",
          }}
        >
          <PDFViewer fileUrl={contract.file_url} />
        </div>

        {/* Right panel — Risk analysis (40% on desktop) */}
        <div
          className="w-full md:w-2/5 flex flex-col"
          style={{ padding: "1.5rem", gap: 16, overflowY: "auto" }}
        >
          {/* Risk card */}
          <div
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "0.5px solid rgba(255,255,255,0.07)",
              borderRadius: 14,
              padding: "1.25rem",
            }}
          >
            <h2
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: "#ffffff",
                letterSpacing: "-0.01em",
                marginBottom: 8,
              }}
            >
              Risk Analysis
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.3)",
                lineHeight: 1.6,
                marginBottom: "1.25rem",
              }}
            >
              Click &lsquo;Analyse contract&rsquo; to scan for risky clauses.
              We&apos;ll identify red flags and explain them in plain English.
            </p>

            {/* Analyse button — wired up in Day 3 */}
            <button
              style={{
                width: "100%",
                background: "#4f46e5",
                color: "white",
                border: "none",
                borderRadius: 10,
                padding: "11px",
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: "-0.01em",
                cursor: "pointer",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(79,70,229,0.3)",
              }}
            >
              Analyse contract
            </button>
          </div>

          {/* Placeholder info cards */}
          <div
            style={{
              background: "rgba(99,102,241,0.05)",
              border: "0.5px solid rgba(99,102,241,0.15)",
              borderRadius: 12,
              padding: "1rem",
            }}
          >
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>
              After analysis, you&apos;ll see a breakdown of risky clauses, severity ratings, and suggested rewrites — all in plain English.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
