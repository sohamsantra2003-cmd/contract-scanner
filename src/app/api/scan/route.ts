import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { callGemini } from "@/lib/gemini";
import { cleanContractText, buildScanPrompt, prefetchGeminiToken, type Clause } from "@/lib/scan-utils";
import { PDFParse } from "pdf-parse";
import { getPath as getPdfWorkerPath } from "pdf-parse/worker";

PDFParse.setWorker(getPdfWorkerPath());

type ScanResult = {
  id: string;
  risk_score: number;
  summary: string;
  clauses: Clause[];
  tokens_used: number;
  scanned_at: string;
};

export async function POST(request: NextRequest) {
  // Step 1 — Authenticate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Parse request body
  let contractId: string;
  try {
    const body = await request.json();
    contractId = body.contractId;
    if (!contractId) throw new Error("missing contractId");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Step 2 — Fetch contract (always filter by user_id)
  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .eq("user_id", user.id)
    .single();

  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Read scans_used + tier for logging
  const { data: userRecord } = await adminSupabase
    .from("users")
    .select("scans_used, tier")
    .eq("id", user.id)
    .single();

  console.log(`[scan] user ${user.id} scans_used=${userRecord?.scans_used} tier=${userRecord?.tier}`);

  // No updated_at column — skip stale-scan check, just block concurrent scans
  if (contract.status === "scanning") {
    return NextResponse.json({ error: "Scan already in progress" }, { status: 409 });
  }

  // If already complete, return existing scan without re-running
  if (contract.status === "complete") {
    const { data: existingScan } = await supabase
      .from("scans")
      .select("*")
      .eq("contract_id", contractId)
      .order("scanned_at", { ascending: false })
      .limit(1)
      .single();

    if (existingScan) {
      const result: ScanResult = {
        id: existingScan.id,
        risk_score: existingScan.risk_score,
        summary: existingScan.summary,
        clauses: existingScan.risk_json as Clause[],
        tokens_used: existingScan.tokens_used,
        scanned_at: existingScan.scanned_at,
      };
      return NextResponse.json({ scan: result });
    }
  }

  // Step 3 — Mark as scanning
  await supabase
    .from("contracts")
    .update({ status: "scanning" })
    .eq("id", contractId);

  // Step 4 — Parallel: PDF download + Gemini auth token
  const storagePath = contract.file_url.split("/storage/v1/object/public/contracts/")[1];

  let pdfBuffer: ArrayBuffer;
  let geminiToken: string;

  try {
    [pdfBuffer, geminiToken] = await Promise.all([
      (async () => {
        const { data: signedData } = await adminSupabase.storage
          .from("contracts")
          .createSignedUrl(storagePath, 60);
        if (!signedData?.signedUrl) throw new Error("Could not generate signed URL");
        const res = await fetch(signedData.signedUrl);
        if (!res.ok) throw new Error("Could not download PDF");
        return res.arrayBuffer();
      })(),
      prefetchGeminiToken(),
    ]);
  } catch (err) {
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    const msg = err instanceof Error ? err.message : "Could not access contract file.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Step 5 — Extract and clean text
  let extractedText: string;
  try {
    const parser = new PDFParse({ data: Buffer.from(pdfBuffer) });
    const pdfData = await parser.getText();
    extractedText = pdfData.text?.trim() ?? "";
  } catch (pdfErr) {
    console.error("PDF text extraction failed:", pdfErr);
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    return NextResponse.json(
      { error: "Failed to read the PDF file. The file may be corrupted." },
      { status: 422 }
    );
  }

  if (extractedText.length < 50) {
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    return NextResponse.json(
      { error: "This PDF appears to be scanned or contains no readable text. Text extraction requires a text-based PDF." },
      { status: 422 }
    );
  }

  const cleanedText = cleanContractText(extractedText);
  const finalText = cleanedText.length > 40000
    ? cleanedText.slice(0, 40000) + "\n\n[Note: Contract truncated to 40,000 characters for analysis]"
    : cleanedText;

  // Step 6 — Build Gemini prompt
  const systemPrompt = buildScanPrompt(finalText);

  // Step 7 — Call Gemini with env-aware timeout
  const SCAN_TIMEOUT_MS = process.env.NODE_ENV === "production" ? 55000 : 30000;

  let rawResponse: string;
  let tokensUsed: number;

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        const err = new Error("Gemini timed out");
        err.name = "AbortError";
        reject(err);
      }, SCAN_TIMEOUT_MS)
    );
    const { text, tokensUsed: tokens } = await Promise.race([
      callGemini(systemPrompt, geminiToken),
      timeoutPromise,
    ]);
    rawResponse = text;
    tokensUsed = tokens;
  } catch (error) {
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);

    const err = error as Error;
    if (err.message.includes("429")) {
      await supabase.from("contracts").update({ status: "pending" }).eq("id", contractId);
      return NextResponse.json(
        { error: "Analysis temporarily unavailable. Please try again in a few minutes." },
        { status: 503 }
      );
    }
    if (err.name === "AbortError") {
      return NextResponse.json(
        { error: "Analysis timed out. Please try again." },
        { status: 504 }
      );
    }
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }

  // Step 8 — Parse and validate Gemini JSON
  const cleaned = rawResponse
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: { summary: string; risk_score: number; clauses: Clause[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Gemini raw response (parse failed):", rawResponse);
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    return NextResponse.json(
      { error: "AI returned an unreadable response.", raw: rawResponse },
      { status: 422 }
    );
  }

  if (typeof parsed.risk_score !== "number" || !Array.isArray(parsed.clauses)) {
    console.error("Gemini raw response (validation failed):", rawResponse);
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    return NextResponse.json(
      { error: "AI response was missing required fields.", raw: rawResponse },
      { status: 422 }
    );
  }

  // Deterministic score from clause severities
  const high = parsed.clauses.filter((c) => c.severity === "high").length;
  const medium = parsed.clauses.filter((c) => c.severity === "medium").length;
  const low = parsed.clauses.filter((c) => c.severity === "low").length;
  const finalScore = Math.min(100, high * 20 + medium * 8 + low * 2);

  // Step 9 — Persist to scans table (admin client bypasses RLS)
  const { data: scan, error: scanError } = await adminSupabase
    .from("scans")
    .insert({
      contract_id: contractId,
      risk_json: parsed.clauses,
      risk_score: finalScore,
      summary: parsed.summary ?? "",
      model_used: "gemini-2.5-flash",
      tokens_used: tokensUsed,
    })
    .select()
    .single();

  if (scanError || !scan) {
    console.error("Scan insert error:", scanError);
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    return NextResponse.json({ error: "Failed to save scan results." }, { status: 500 });
  }

  // Step 10 — Mark contract complete
  await supabase
    .from("contracts")
    .update({ status: "complete" })
    .eq("id", contractId);

  // Step 10b — Increment scans_used
  const { data: freshUser } = await adminSupabase
    .from("users")
    .select("scans_used")
    .eq("id", user.id)
    .single();

  const { error: counterError } = await adminSupabase
    .from("users")
    .update({ scans_used: (freshUser?.scans_used ?? 0) + 1 })
    .eq("id", user.id);

  if (counterError) {
    console.error("[scan] failed to increment scans_used:", counterError);
  }

  // Step 11 — Return results
  const result: ScanResult = {
    id: scan.id,
    risk_score: finalScore,
    summary: parsed.summary,
    clauses: parsed.clauses,
    tokens_used: tokensUsed,
    scanned_at: scan.scanned_at,
  };

  return NextResponse.json({ scan: result });
}
