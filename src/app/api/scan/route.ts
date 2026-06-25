import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const debug = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") console.log(...args);
};
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { callGemini } from "@/lib/gemini";
import {
  cleanContractText,
  buildScanPrompt,
  buildSynthesisPrompt,
  deduplicateClauses,
  getAnalysisMode,
  calculateOutputTokens,
  prefetchGeminiToken,
  isValidClause,
  type Clause,
} from "@/lib/scan-utils";
import { chunkDocument, buildChunkPrompt } from "@/lib/chunk-document";
import { PDFParse } from "pdf-parse";
import { getPath as getPdfWorkerPath } from "pdf-parse/worker";

PDFParse.setWorker(getPdfWorkerPath());

const MAX_CHARS = 600000; // ~240 pages — bounds worst-case cost on pathological files
const PARALLEL_BATCH_SIZE = 5;
const BATCH_PAUSE_MS = 2500;
const SCAN_DEADLINE_MS = 45000;

type ScanResult = {
  id: string;
  risk_score: number;
  summary: string;
  clauses: Clause[];
  tokens_used: number;
  scanned_at: string;
  coverage?: { chunksTotal: number; chunksProcessed: number; complete: boolean };
};

function smartTruncate(text: string): { text: string; wasTruncated: boolean; truncatedAt: string } {
  if (text.length <= MAX_CHARS) return { text, wasTruncated: false, truncatedAt: "" };

  const annexPatterns = [
    /\nAnnex\s+[A-Z]/i, /\nANNEX\s+[A-Z]/, /\nAppendix\s+[A-Z0-9]/i,
    /\nSCHEDULE\s+[A-Z0-9]/i, /\nExhibit\s+[A-Z0-9]/i, /\nATTACHMENT\s+[A-Z0-9]/i,
  ];
  let cutPoint = MAX_CHARS;
  let cutReason = "character limit";
  for (const pattern of annexPatterns) {
    const match = text.search(pattern);
    if (match > text.length * 0.4 && match < MAX_CHARS) { cutPoint = match; cutReason = "start of annexes"; break; }
  }
  const nearestParagraph = text.lastIndexOf("\n\n", cutPoint);
  if (nearestParagraph > cutPoint - 500) cutPoint = nearestParagraph;
  const pct = Math.round((text.length - cutPoint) / text.length * 100);
  return {
    text: text.slice(0, cutPoint) +
      `\n\n[ANALYSIS NOTE: Document truncated at ${cutReason}. ${pct}% of document (${Math.round((text.length - cutPoint) / 1000)}k chars) excluded.]`,
    wasTruncated: true,
    truncatedAt: cutReason,
  };
}

function cleanJson(raw: string, arrayMode = false): string {
  let s = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  if (arrayMode) {
    s = s.replace(/^[^\[]*(\[)/, "$1").replace(/(\])[^\]]*$/, "$1");
  } else {
    s = s.replace(/^[^{]*({)/, "$1").replace(/(})[^}]*$/, "$1");
  }
  return s.trim();
}

async function callGeminiWithRetry(
  prompt: string,
  token: string,
  outputTokens: number,
  maxRetries = 2
): Promise<{ text: string; tokensUsed: number; rateLimited: boolean } | null> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await callGemini(prompt, token, outputTokens);
      return { ...result, rateLimited: false };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isRateLimited =
        errMsg.includes("429") ||
        errMsg.toLowerCase().includes("resource_exhausted") ||
        errMsg.toLowerCase().includes("rate limit");

      if (isRateLimited && attempt < maxRetries) {
        const backoffMs = 3000 * Math.pow(2, attempt);
        console.error(`[scan] rate limited, backing off ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      console.error(`[scan] chunk call failed: ${errMsg}`);
      return isRateLimited
        ? { text: "", tokensUsed: 0, rateLimited: true }
        : null;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let contractId: string;
  try {
    const body = await request.json();
    contractId = body.contractId;
    if (!contractId) throw new Error("missing contractId");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { data: contract } = await supabase
    .from("contracts").select("*").eq("id", contractId).eq("user_id", user.id).single();
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: userRecord } = await adminSupabase.from("users").select("scans_used, tier").eq("id", user.id).single();
  debug(`[scan] scans_used=${userRecord?.scans_used} tier=${userRecord?.tier}`);

  if (contract.status === "scanning") {
    return NextResponse.json({ error: "Scan already in progress" }, { status: 409 });
  }

  if (contract.status === "complete") {
    const { data: existingScan } = await supabase
      .from("scans").select("*").eq("contract_id", contractId)
      .order("scanned_at", { ascending: false }).limit(1).single();
    if (existingScan) {
      const result: ScanResult = {
        id: existingScan.id, risk_score: existingScan.risk_score,
        summary: existingScan.summary, clauses: existingScan.risk_json as Clause[],
        tokens_used: existingScan.tokens_used, scanned_at: existingScan.scanned_at,
        coverage: {
          chunksTotal: existingScan.chunks_total ?? 1,
          chunksProcessed: existingScan.chunks_processed ?? 1,
          complete: existingScan.coverage_complete ?? true,
        },
      };
      return NextResponse.json({ scan: result });
    }
  }

  await supabase.from("contracts").update({ status: "scanning" }).eq("id", contractId);

  const storagePath = contract.file_url.split("/storage/v1/object/public/contracts/")[1];
  let pdfBuffer: ArrayBuffer;
  let geminiToken: string;

  try {
    [pdfBuffer, geminiToken] = await Promise.all([
      (async () => {
        const { data: signedData } = await adminSupabase.storage.from("contracts").createSignedUrl(storagePath, 60);
        if (!signedData?.signedUrl) throw new Error("Could not generate signed URL");
        const res = await fetch(signedData.signedUrl);
        if (!res.ok) throw new Error("Could not download PDF");
        return res.arrayBuffer();
      })(),
      prefetchGeminiToken(),
    ]);
  } catch (err) {
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not access contract file." }, { status: 500 });
  }

  let rawText: string;
  let numpages: number;
  try {
    const parser = new PDFParse({ data: Buffer.from(pdfBuffer) });
    const pdfData = await parser.getText() as unknown as { text: string; numpages: number };
    rawText = pdfData.text?.trim() ?? "";
    numpages = pdfData.numpages ?? 1;
  } catch (pdfErr) {
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    const errMsg = pdfErr instanceof Error ? pdfErr.message.toLowerCase() : String(pdfErr).toLowerCase();
    const isEncrypted = errMsg.includes("password") || errMsg.includes("encrypt") || errMsg.includes("protect") || errMsg.includes("decrypt");
    return NextResponse.json({
      error: isEncrypted ? "PASSWORD_PROTECTED" : "PDF_PARSE_ERROR",
      message: isEncrypted
        ? "This PDF is password-protected.\n\nTo remove the password:\n• Adobe Acrobat: File → Properties → Security → Change to \"No Security\"\n• Online (free): smallpdf.com/unlock-pdf\n• Google Chrome: Open PDF → Print → Save as PDF"
        : "This PDF appears to be corrupted or in an unsupported format.\n\nTry re-saving the original document as a new PDF and uploading again.",
    }, { status: 422 });
  }

  const charsPerPage = rawText.length / numpages;
  if (rawText.length < 50 || (charsPerPage < 40 && numpages > 1)) {
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    return NextResponse.json({
      error: "SCANNED_PDF",
      message: "This PDF contains scanned images rather than selectable text, so text extraction is not possible.\n\nTo fix this:\n• Adobe Acrobat → Tools → Enhance Scans → Recognize Text\n• Free OCR: smallpdf.com/pdf-to-word\n• Or export as PDF directly from Word / Google Docs",
    }, { status: 422 });
  }

  const cleanedText = cleanContractText(rawText);
  const mode = getAnalysisMode(cleanedText.length);
  const outputTokens = calculateOutputTokens(cleanedText.length);

  const { text: finalText, wasTruncated, truncatedAt } =
    mode === "chunked" ? { text: cleanedText, wasTruncated: false, truncatedAt: "" } : smartTruncate(cleanedText);

  debug(`[scan] mode=${mode} inputChars=${cleanedText.length} finalChars=${finalText.length} truncated=${wasTruncated} truncatedAt=${truncatedAt} outputTokens=${outputTokens}`);

  let parsedResult: { summary: string; risk_score: number; clauses: Clause[] } | null = null;
  let coverage = { chunksTotal: 1, chunksProcessed: 1, complete: true };

  // ── SINGLE PASS ──────────────────────────────────────────────────────────────
  if (mode === "single") {
    const TIMEOUT_MS = process.env.NODE_ENV === "production" ? 55000 : 30000;

    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = attempt === 0
        ? buildScanPrompt(finalText)
        : buildScanPrompt(finalText) + '\n\nCRITICAL: Return ONLY the raw JSON object. Start with { end with }. No backticks. No explanation.';

      let raw = "";
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => { const e = new Error("timed out"); e.name = "AbortError"; reject(e); }, TIMEOUT_MS)
        );
        const { text } = await Promise.race([callGemini(prompt, geminiToken, outputTokens), timeout]);
        raw = text;
      } catch (error) {
        await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
        const err = error as Error;
        if (err.message.includes("429")) {
          await supabase.from("contracts").update({ status: "pending" }).eq("id", contractId);
          return NextResponse.json({ error: "Analysis temporarily unavailable. Please try again in a few minutes." }, { status: 503 });
        }
        if (err.name === "AbortError") return NextResponse.json({ error: "Analysis timed out. Please try again." }, { status: 504 });
        return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
      }

      try {
        const p = JSON.parse(cleanJson(raw));
        if (!Array.isArray(p.clauses)) throw new Error("clauses not array");
        const validClauses = p.clauses.filter(isValidClause);
        if (validClauses.length < p.clauses.length) {
          console.warn(`[scan] dropped ${p.clauses.length - validClauses.length} malformed clause object(s) from single-pass`);
        }
        parsedResult = { ...p, clauses: validClauses };
        break;
      } catch (e) {
        console.error(`[scan] single-pass parse failed attempt ${attempt + 1}: ${e}`);
        if (attempt >= 1) {
          await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
          return NextResponse.json({ error: "AI returned an unreadable response after 2 attempts.", raw: raw.slice(0, 500) }, { status: 422 });
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  // ── CHUNKED ───────────────────────────────────────────────────────────────────
  else {
    const chunks = chunkDocument(finalText, 10000, 500);
    const totalChunks = chunks.length;
    debug(`[scan] chunked: ${totalChunks} chunks from ${finalText.length} chars`);

    let allClauses: Clause[] = [];
    let chunksProcessed = 0;
    const scanStartTime = Date.now();
    let firstBatchAttempted = false;
    let firstBatchAllFailed = false;

    for (let batchStart = 0; batchStart < chunks.length; batchStart += PARALLEL_BATCH_SIZE) {
      // ── Wall-clock governor ────────────────────────────────────────────────
      const elapsed = Date.now() - scanStartTime;
      if (elapsed > SCAN_DEADLINE_MS) {
        console.warn(`[scan] deadline reached at ${elapsed}ms with ${chunksProcessed}/${totalChunks} chunks — stopping early, proceeding to synthesis with partial results`);
        break;
      }

      const batch = chunks.slice(batchStart, batchStart + PARALLEL_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (chunk, batchIdx) => {
          const chunkIdx = batchStart + batchIdx;
          const result = await callGeminiWithRetry(buildChunkPrompt(chunk, chunkIdx, totalChunks), geminiToken, 4096);

          if (result === null) return { clauses: [] as Clause[], failed: true, rateLimited: false };
          if (result.rateLimited) return { clauses: [] as Clause[], failed: true, rateLimited: true };

          try {
            const cleaned = cleanJson(result.text, true);
            const rawParsed = JSON.parse(cleaned);
            const rawClauses = Array.isArray(rawParsed) ? rawParsed : [];
            const validClauses = rawClauses.filter(isValidClause);
            if (validClauses.length < rawClauses.length) {
              console.warn(`[scan] dropped ${rawClauses.length - validClauses.length} malformed clause object(s) from chunk ${chunkIdx}`);
            }
            debug(`[scan] chunk ${chunkIdx + 1}/${totalChunks}: ${validClauses.length} valid clauses`);
            return { clauses: validClauses, failed: false, rateLimited: false };
          } catch {
            return { clauses: [] as Clause[], failed: true, rateLimited: false };
          }
        })
      );

      // ── Fail-fast circuit breaker ──────────────────────────────────────────
      if (!firstBatchAttempted) {
        firstBatchAttempted = true;
        const nonRateLimitFailures = batchResults.filter((r) => r.failed && !r.rateLimited).length;
        if (nonRateLimitFailures === batchResults.length) {
          console.error("[scan] first batch entirely failed with non-rate-limit errors — aborting (AI_SERVICE_ERROR)");
          firstBatchAllFailed = true;
          break;
        }
      }

      batchResults.forEach((r) => {
        allClauses = [...allClauses, ...r.clauses];
        chunksProcessed++;
      });

      if (batchStart + PARALLEL_BATCH_SIZE < chunks.length) {
        await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
      }
    }

    if (firstBatchAllFailed) {
      await adminSupabase.from("contracts").update({ status: "pending" }).eq("id", contractId);
      return NextResponse.json({
        error: "The AI analysis service is currently unavailable. Please try again in a few minutes.",
        code: "AI_SERVICE_ERROR",
      }, { status: 503 });
    }

    coverage = { chunksTotal: totalChunks, chunksProcessed, complete: chunksProcessed === totalChunks };
    const clauses = deduplicateClauses(allClauses);
    debug(`[scan] chunked complete: ${totalChunks} chunks, ${chunksProcessed} processed, ${allClauses.length} raw, ${clauses.length} after dedup, coverage.complete=${coverage.complete}`);

    let summaryData = { summary: "", risk_score: 0 };
    try {
      const { text: rawSum } = await callGemini(buildSynthesisPrompt(clauses), geminiToken, 1024);
      summaryData = JSON.parse(cleanJson(rawSum));
    } catch (e) {
      console.error(`[scan] chunked synthesis failed: ${e}`);
      const h = clauses.filter((c) => c.severity === "high").length;
      const m = clauses.filter((c) => c.severity === "medium").length;
      const l = clauses.filter((c) => c.severity === "low").length;
      summaryData = {
        risk_score: Math.min(100, h * 20 + m * 8 + l * 2),
        summary: `This contract contains ${clauses.length} risk areas: ${h} high-severity, ${m} medium-severity, and ${l} low-severity clauses.`,
      };
    }

    parsedResult = { summary: summaryData.summary, risk_score: summaryData.risk_score, clauses };
  }

  // ── Safety net ────────────────────────────────────────────────────────────────
  if (!parsedResult || typeof parsedResult.risk_score !== "number" || !Array.isArray(parsedResult.clauses)) {
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    return NextResponse.json({ error: "AI returned an unreadable response." }, { status: 422 });
  }

  const high = parsedResult.clauses.filter((c) => c.severity === "high").length;
  const medium = parsedResult.clauses.filter((c) => c.severity === "medium").length;
  const low = parsedResult.clauses.filter((c) => c.severity === "low").length;
  const finalScore = Math.min(100, high * 20 + medium * 8 + low * 2);

  const { data: scan, error: scanError } = await adminSupabase
    .from("scans")
    .insert({
      contract_id: contractId,
      risk_json: parsedResult.clauses,
      risk_score: finalScore,
      summary: parsedResult.summary ?? "",
      model_used: "gemini-2.5-flash",
      tokens_used: 0,
      chunks_total: coverage.chunksTotal,
      chunks_processed: coverage.chunksProcessed,
      coverage_complete: coverage.complete,
    })
    .select()
    .single();

  if (scanError || !scan) {
    await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
    return NextResponse.json({ error: "Failed to save scan results." }, { status: 500 });
  }

  await supabase.from("contracts").update({ status: "complete" }).eq("id", contractId);

  const { data: freshUser } = await adminSupabase.from("users").select("scans_used").eq("id", user.id).single();
  await adminSupabase.from("users").update({ scans_used: (freshUser?.scans_used ?? 0) + 1 }).eq("id", user.id);

  const result: ScanResult = {
    id: scan.id, risk_score: finalScore,
    summary: parsedResult.summary, clauses: parsedResult.clauses,
    tokens_used: 0, scanned_at: scan.scanned_at,
    coverage,
  };
  return NextResponse.json({ scan: result });
}
