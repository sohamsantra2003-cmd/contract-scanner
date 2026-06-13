import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PDFViewer } from "@/components/PDFViewer";
import { DeleteContractButton } from "@/components/DeleteContractButton";

interface PageProps {
  params: Promise<{ id: string }>;
}

const statusStyles: Record<string, React.CSSProperties> = {
  pending: {
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

export default async function ContractPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!contract) redirect("/dashboard");

  // Generate a 1-hour signed URL (private bucket)
  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const storagePath = contract.file_url.split("/storage/v1/object/public/contracts/")[1];
  const { data: signedData } = await adminSupabase.storage
    .from("contracts")
    .createSignedUrl(storagePath, 3600);
  const pdfUrl = signedData?.signedUrl ?? contract.file_url;

  const statusStyle = statusStyles[contract.status] ?? statusStyles.pending;

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: "100vh", background: "#07070d", color: "#fff" }}
    >
      {/* ── Header ── */}
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
        {/* Left: wordmark → breadcrumb */}
        <div className="flex items-center min-w-0" style={{ gap: 10 }}>
          {/* Wordmark */}
          <Link
            href="/dashboard"
            className="flex items-center flex-shrink-0 hover:opacity-80 transition-opacity"
            style={{ gap: 7, textDecoration: "none" }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <polyline points="9 12 11 14 15 10"/>
              </svg>
            </div>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: "rgba(255,255,255,0.6)", letterSpacing: "-0.01em" }}>
              Dashboard
            </span>
          </Link>

          {/* Breadcrumb separator + filename */}
          <ChevronRight size={14} color="rgba(255,255,255,0.15)" style={{ flexShrink: 0 }} />
          <span
            className="truncate"
            style={{ fontSize: 13.5, fontWeight: 500, color: "rgba(255,255,255,0.85)", letterSpacing: "-0.01em", maxWidth: 320 }}
          >
            {contract.title}
          </span>
        </div>

        {/* Right: status badge */}
        <span
          style={{
            ...statusStyle,
            fontSize: 11,
            fontWeight: 500,
            borderRadius: 6,
            padding: "3px 9px",
            textTransform: "capitalize",
            flexShrink: 0,
          }}
        >
          {contract.status}
        </span>
      </header>

      {/* ── Two-panel layout ── */}
      <div className="flex flex-col md:flex-row flex-1" style={{ minHeight: 0 }}>

        {/* Left panel — PDF viewer (60%) */}
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
          <PDFViewer fileUrl={pdfUrl} />
        </div>

        {/* Right panel — actions (40%) */}
        <div
          className="w-full md:w-2/5 flex flex-col"
          style={{ padding: "1.5rem", gap: 12, overflowY: "auto" }}
        >
          {/* Risk analysis card */}
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

            {/* Analyse button — wired in Day 3 */}
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

          {/* Info hint */}
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

          {/* Delete section */}
          <div
            style={{
              background: "rgba(255,255,255,0.015)",
              border: "0.5px solid rgba(255,255,255,0.05)",
              borderRadius: 12,
              padding: "1rem",
            }}
          >
            <p style={{ fontSize: 11.5, fontWeight: 500, color: "rgba(255,255,255,0.25)", marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Danger zone
            </p>
            <DeleteContractButton contractId={contract.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
