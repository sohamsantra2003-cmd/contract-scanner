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
  const MAX_CHARS = 32000;
  let finalText: string;
  if (cleanedText.length > MAX_CHARS) {
    const annexPatterns = [
      /\nAnnex\s+[A-Z]/i,
      /\nANNEX\s+[A-Z]/,
      /\nAppendix\s+[A-Z0-9]/i,
      /\nSCHEDULE\s+[A-Z0-9]/i,
      /\nExhibit\s+[A-Z0-9]/i,
    ];
    let cutPoint = MAX_CHARS;
    for (const pattern of annexPatterns) {
      const match = cleanedText.search(pattern);
      if (match > cleanedText.length * 0.4 && match < MAX_CHARS) {
        cutPoint = match;
        break;
      }
    }
    finalText =
      cleanedText.slice(0, cutPoint) +
      `\n\n[Note: Document truncated before annexes/appendices for analysis. ${Math.round(
        ((cleanedText.length - cutPoint) / cleanedText.length) * 100
      )}% of document (primarily annexes and forms) was excluded.]`;
  } else {
    finalText = cleanedText;
  }

  // Step 6 — Build Gemini prompt
  const systemPrompt = buildScanPrompt(finalText);

  // Steps 7+8 — Call Gemini with retry on JSON parse failure
  const SCAN_TIMEOUT_MS = process.env.NODE_ENV === "production" ? 55000 : 30000;

  let rawResponse = "";
  let tokensUsed = 0;
  let parsed: { summary: string; risk_score: number; clauses: Clause[] } | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const retryPrompt =
      attempt === 0
        ? systemPrompt
        : systemPrompt +
          '\n\nCRITICAL: Your previous response could not be parsed as JSON. Return ONLY the raw JSON object. No backticks. No "```json". No explanation. Start your response with { and end with }';

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          const err = new Error("Gemini timed out");
          err.name = "AbortError";
          reject(err);
        }, SCAN_TIMEOUT_MS)
      );
      const { text, tokensUsed: tokens } = await Promise.race([
        callGemini(retryPrompt, geminiToken),
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

    const cleanedJson = rawResponse
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .replace(/^[^{]*({)/, "$1")
      .replace(/(})[^}]*$/, "$1")
      .trim();

    try {
      parsed = JSON.parse(cleanedJson);
      break;
    } catch {
      console.error(`[scan] JSON parse failed (attempt ${attempt + 1}). Raw length: ${rawResponse.length}`);
      console.error("[scan] First 500 chars:", rawResponse.slice(0, 500));
      if (attempt >= 1) {
        await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
        return NextResponse.json(
          { error: "AI returned an unreadable response after 2 attempts.", raw: rawResponse.slice(0, 500) },
          { status: 422 }
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  if (!parsed) {
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    return NextResponse.json({ error: "AI returned an unreadable response." }, { status: 422 });
  }

  if (typeof parsed.risk_score !== "number" || !Array.isArray(parsed.clauses)) {
    console.error("[scan] Gemini response validation failed:", rawResponse.slice(0, 500));
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    return NextResponse.json(
      { error: "AI response was missing required fields.", raw: rawResponse.slice(0, 500) },
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
