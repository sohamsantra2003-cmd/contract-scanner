import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import ContractViewer from "@/components/ContractViewer";
import { RiskPanelSkeleton } from "@/components/RiskPanel";

interface PageProps {
  params: Promise<{ id: string }>;
}

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

  return (
    <Suspense fallback={<RiskPanelSkeleton />}>
      <ContractViewer
        pdfUrl={pdfUrl}
        contractId={contract.id}
        contractTitle={contract.title}
        contractStatus={contract.status}
        userEmail={user.email ?? ""}
        initialScan={initialScan}
        initiallyScanning={contract.status === "scanning"}
      />
    </Suspense>
  );
}
