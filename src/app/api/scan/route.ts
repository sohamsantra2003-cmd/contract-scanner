import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { callGemini } from "@/lib/gemini";
import { PDFParse } from "pdf-parse";
import { getPath as getPdfWorkerPath } from "pdf-parse/worker";

// Set pdfjs worker path once at module load so the FakeWorker fallback
// resolves to an actual file rather than the relative "./pdf.worker.mjs"
// which would be missing in the compiled Next.js output directory.
PDFParse.setWorker(getPdfWorkerPath());

type Clause = {
  text: string;
  category: "payment_terms" | "liability" | "auto_renewal" | "IP" | "termination" | "other";
  severity: "high" | "medium" | "low";
  explanation: string;
  rewrite: string;
};

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

  // Read scans_used + tier for logging now; gate enforcement is Day 5
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

  // Step 3 — Mark as scanning (before Gemini call so UI shows loading immediately)
  await supabase
    .from("contracts")
    .update({ status: "scanning" })
    .eq("id", contractId);

  // Step 4 — Generate signed URL and download PDF
  const storagePath = contract.file_url.split("/storage/v1/object/public/contracts/")[1];
  const { data: signedData } = await adminSupabase.storage
    .from("contracts")
    .createSignedUrl(storagePath, 60);

  if (!signedData?.signedUrl) {
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    return NextResponse.json({ error: "Could not access contract file." }, { status: 500 });
  }

  const pdfResponse = await fetch(signedData.signedUrl);
  if (!pdfResponse.ok) {
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    return NextResponse.json({ error: "Could not download contract file." }, { status: 500 });
  }
  const pdfBuffer = await pdfResponse.arrayBuffer();

  // Step 5 — Extract text
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
      {
        error:
          "This PDF appears to be scanned or contains no readable text. Text extraction requires a text-based PDF.",
      },
      { status: 422 }
    );
  }

  if (extractedText.length > 40000) {
    extractedText =
      extractedText.slice(0, 40000) +
      "\n\n[Note: Contract truncated to 40,000 characters for analysis]";
  }

  // Step 6 — Build Gemini prompt
  const systemPrompt = `You are an expert contract lawyer reviewing a business contract for an SMB owner.
Analyse the full contract text provided.

Return ONLY a valid JSON object with exactly these top-level keys:

{
  "summary": "2-3 sentence plain-English overview of the contract's overall risk level and the single most important issue the user should know about.",
  "risk_score": <integer 0-100, where 0=no risk, 100=extremely high risk>,
  "clauses": [
    {
      "text": "exact quoted sentence from the contract",
      "category": "payment_terms|liability|auto_renewal|IP|termination|other",
      "severity": "high|medium|low",
      "explanation": "plain-English explanation of the risk (max 2 sentences)",
      "rewrite": "a safer alternative clause (1 sentence)"
    }
  ]
}

Rules:
- Return NO preamble, NO markdown fences, ONLY the raw JSON object.
- risk_score must reflect overall severity: mostly high clauses = 70-100, mostly medium = 30-69, mostly low or clean = 0-29.
- If the document is not a contract, return risk_score: 0, an explanatory summary, and an empty clauses array.

CONTRACT TEXT TO ANALYSE:
${extractedText}`;

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
      callGemini(systemPrompt),
      timeoutPromise,
    ]);
    rawResponse = text;
    tokensUsed = tokens;
  } catch (error) {
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);

    const err = error as Error;
    // 429 quota exceeded — reset to pending so user can retry
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

  // Score derived entirely from clause severities — deterministic, not from LLM's self-report
  const high = parsed.clauses.filter((c) => c.severity === "high").length;
  const medium = parsed.clauses.filter((c) => c.severity === "medium").length;
  const low = parsed.clauses.filter((c) => c.severity === "low").length;
  const finalScore = Math.min(100, high * 20 + medium * 8 + low * 2);

  // Step 9 — Persist to scans table (admin client bypasses RLS — scans has no user_id column)
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

  // Step 10b — Increment scans_used (read-then-write; no RPC needed)
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
