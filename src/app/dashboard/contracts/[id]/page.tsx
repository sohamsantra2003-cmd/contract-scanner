import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import ContractViewer from "@/components/ContractViewer";
import { RiskPanelSkeleton } from "@/components/RiskPanel";

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

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Generate 1-hour signed URL for the PDF viewer
  const storagePath = contract.file_url.split("/storage/v1/object/public/contracts/")[1];
  const { data: signedData } = await adminSupabase.storage
    .from("contracts")
    .createSignedUrl(storagePath, 3600);
  const pdfUrl = signedData?.signedUrl ?? contract.file_url;

  // Fetch most recent scan (if any) — use admin client to bypass RLS join complexity
  const { data: existingScan } = await adminSupabase
    .from("scans")
    .select("*")
    .eq("contract_id", contract.id)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .single();

  // Map raw DB row → ScanResult shape that RiskPanel expects
  const initialScan = existingScan
    ? {
        id: existingScan.id as string,
        risk_score: existingScan.risk_score as number,
        summary: existingScan.summary as string,
        clauses: (existingScan.risk_json ?? []) as {
          text: string;
          category: "payment_terms" | "liability" | "auto_renewal" | "IP" | "termination" | "other";
          severity: "high" | "medium" | "low";
          explanation: string;
          rewrite: string;
        }[],
        tokens_used: existingScan.tokens_used as number,
        scanned_at: existingScan.scanned_at as string,
      }
    : null;

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
          <ChevronRight size={14} color="rgba(255,255,255,0.15)" style={{ flexShrink: 0 }} />
          <span
            className="truncate"
            style={{ fontSize: 13.5, fontWeight: 500, color: "rgba(255,255,255,0.85)", letterSpacing: "-0.01em", maxWidth: 300 }}
          >
            {contract.title}
          </span>
        </div>

        {/* Right: status badge + scanned timestamp */}
        <div className="flex items-center flex-shrink-0" style={{ gap: 8 }}>
          {existingScan && (
            <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.2)" }}>
              Scanned {formatDistanceToNow(new Date(existingScan.scanned_at))} ago
            </span>
          )}
          <span
            style={{
              ...statusStyle,
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 6,
              padding: "3px 9px",
              textTransform: "capitalize",
            }}
          >
            {contract.status}
          </span>
        </div>
      </header>

      {/* ── Two-panel layout (client-owned state via ContractViewer) ── */}
      <Suspense fallback={<RiskPanelSkeleton />}>
        <ContractViewer
          pdfUrl={pdfUrl}
          contractId={contract.id}
          contractTitle={contract.title}
          userEmail={user.email ?? ""}
          initialScan={initialScan}
          initiallyScanning={contract.status === "scanning"}
        />
      </Suspense>
    </div>
  );
}
