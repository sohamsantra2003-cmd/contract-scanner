import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

export const runtime = "nodejs";
export const maxDuration = 120;

PDFParse.setWorker(getPdfWorkerPath());

// ── Scan constants ─────────────────────────────────────────────────────────────
const MAX_CHARS = 600000;          // ~240 pages upper bound — cost control only
const PER_ATTEMPT_TIMEOUT_MS = 12000;    // hard abort per Gemini call via AbortController
const PER_CHUNK_TOTAL_BUDGET_MS = 20000; // outer race — no chunk (incl. retry) blocks > 20s
const SINGLE_BATCH_THRESHOLD = 15;       // ≤15 chunks → single parallel wave (~45-50 pages)
const FALLBACK_BATCH_SIZE = 10;          // sequential batches for larger documents
const FALLBACK_BATCH_PAUSE_MS = 1500;

type ChunkOutcome = { clauses: Clause[]; failed: boolean; rateLimited: boolean };

type ScanResult = {
  id: string;
  risk_score: number;
  summary: string;
  clauses: Clause[];
  tokens_used: number;
  scanned_at: string;
  coverage?: { chunksTotal: number; chunksProcessed: number; complete: boolean };
};

// ── Helpers ────────────────────────────────────────────────────────────────────

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
      `\n\n[ANALYSIS NOTE: Document truncated at ${cutReason}. ${pct}% (${Math.round((text.length - cutPoint) / 1000)}k chars) excluded.]`,
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

// ── Per-chunk processing ───────────────────────────────────────────────────────

async function processOneChunk(
  chunk: string,
  chunkIdx: number,
  totalChunks: number,
  token: string
): Promise<ChunkOutcome> {
  const prompt = buildChunkPrompt(chunk, chunkIdx, totalChunks);
  const start = Date.now();
  const MAX_RETRIES = 1;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { text } = await callGemini(prompt, token, 4096, PER_ATTEMPT_TIMEOUT_MS);
      const cleaned = cleanJson(text, true);
      const rawParsed = JSON.parse(cleaned);
      const rawClauses = Array.isArray(rawParsed) ? rawParsed : [];
      const validClauses = rawClauses.filter(isValidClause);
      if (validClauses.length < rawClauses.length) {
        console.warn(`[scan] chunk ${chunkIdx + 1}/${totalChunks}: dropped ${rawClauses.length - validClauses.length} malformed clause(s)`);
      }
      console.log(`[scan] chunk ${chunkIdx + 1}/${totalChunks} ok in ${Date.now() - start}ms (${validClauses.length} clauses)`);
      return { clauses: validClauses, failed: false, rateLimited: false };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isRateLimited =
        errMsg.includes("429") ||
        errMsg.toLowerCase().includes("resource_exhausted") ||
        errMsg.toLowerCase().includes("rate limit");

      if (attempt < MAX_RETRIES) {
        const backoff = isRateLimited ? 3000 : 500;
        console.warn(`[scan] chunk ${chunkIdx + 1}/${totalChunks} attempt ${attempt + 1} failed (${errMsg.slice(0, 80)}), retrying in ${backoff}ms`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      console.error(`[scan] chunk ${chunkIdx + 1}/${totalChunks} failed after ${Date.now() - start}ms: ${errMsg}`);
      return { clauses: [], failed: true, rateLimited: isRateLimited };
    }
  }
  return { clauses: [], failed: true, rateLimited: false };
}

// Outer race — guarantees no chunk, even with a retry, blocks the wave for more than PER_CHUNK_TOTAL_BUDGET_MS
async function processOneChunkBounded(
  chunk: string, chunkIdx: number, totalChunks: number, token: string
): Promise<ChunkOutcome> {
  return Promise.race([
    processOneChunk(chunk, chunkIdx, totalChunks, token),
    new Promise<ChunkOutcome>((resolve) =>
      setTimeout(() => {
        console.warn(`[scan] chunk ${chunkIdx + 1}/${totalChunks} exceeded outer budget (${PER_CHUNK_TOTAL_BUDGET_MS}ms) — skipping`);
        resolve({ clauses: [], failed: true, rateLimited: false });
      }, PER_CHUNK_TOTAL_BUDGET_MS)
    ),
  ]);
}

// ── Main handler ───────────────────────────────────────────────────────────────

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

  if (contract.status === "scanning") {
    return NextResponse.json({ error: "Scan already in progress" }, { status: 409 });
  }

  // Return cached result for completed scans
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

  // ── Parallel: PDF download + token prefetch ──────────────────────────────────
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

  // ── PDF text extraction ──────────────────────────────────────────────────────
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

  // ── Clean + route ────────────────────────────────────────────────────────────
  const cleanedText = cleanContractText(rawText);
  const mode = getAnalysisMode(cleanedText.length);
  const outputTokens = calculateOutputTokens(cleanedText.length);

  const { text: finalText, wasTruncated, truncatedAt } =
    mode === "chunked" ? { text: cleanedText, wasTruncated: false, truncatedAt: "" } : smartTruncate(cleanedText);

  console.log(`[scan] mode=${mode} pages=${numpages} inputChars=${cleanedText.length} finalChars=${finalText.length} truncated=${wasTruncated}${truncatedAt ? ` at=${truncatedAt}` : ""}`);

  let parsedResult: { summary: string; risk_score: number; clauses: Clause[] } | null = null;
  let coverage = { chunksTotal: 1, chunksProcessed: 1, complete: true };

  // ── SINGLE PASS ──────────────────────────────────────────────────────────────
  if (mode === "single") {
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = attempt === 0
        ? buildScanPrompt(finalText)
        : buildScanPrompt(finalText) + "\n\nCRITICAL: Return ONLY the raw JSON object. Start with { end with }. No backticks. No explanation.";

      let raw = "";
      try {
        const { text } = await callGemini(prompt, geminiToken, outputTokens, 55000);
        raw = text;
      } catch (error) {
        const err = error as Error;
        if (err.message.includes("429") || err.message.toLowerCase().includes("resource_exhausted")) {
          await supabase.from("contracts").update({ status: "pending" }).eq("id", contractId);
          return NextResponse.json({ error: "Analysis temporarily unavailable. Please try again in a few minutes." }, { status: 503 });
        }
        if (err.message.includes("timed out")) {
          await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
          return NextResponse.json({ error: "Analysis timed out. Please try again." }, { status: 504 });
        }
        await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
        return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
      }

      try {
        const p = JSON.parse(cleanJson(raw));
        if (!Array.isArray(p.clauses)) throw new Error("clauses not array");
        const validClauses = p.clauses.filter(isValidClause);
        if (validClauses.length < p.clauses.length) {
          console.warn(`[scan] dropped ${p.clauses.length - validClauses.length} malformed clause(s) from single-pass`);
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
    const strategy = totalChunks <= SINGLE_BATCH_THRESHOLD ? "single parallel wave" : `sequential batches of ${FALLBACK_BATCH_SIZE}`;
    console.log(`[scan] ${totalChunks} chunks from ${finalText.length} chars — ${strategy}`);

    let allClauses: Clause[] = [];
    let chunksProcessed = 0;
    let abortWithServiceError = false;

    if (totalChunks <= SINGLE_BATCH_THRESHOLD) {
      // ── Single parallel wave — all chunks run simultaneously ─────────────────
      // This is the key fix: for ≤15 chunks (up to ~45-50 pages), we send everything
      // at once. Duration is bounded by the slowest single chunk (≤20s), not by
      // sequential batching multiplied by the number of batches.
      const results = await Promise.all(
        chunks.map((chunk, idx) => processOneChunkBounded(chunk, idx, totalChunks, geminiToken))
      );

      // Circuit breaker: all chunks failed for non-rate-limit reasons → genuine outage
      const allFailedNonRateLimit = totalChunks > 0 && results.every((r) => r.failed && !r.rateLimited);
      if (allFailedNonRateLimit) {
        console.error("[scan] all chunks failed with non-rate-limit errors — aborting (AI_SERVICE_ERROR)");
        abortWithServiceError = true;
      } else {
        results.forEach((r) => {
          allClauses = [...allClauses, ...r.clauses];
          if (!r.failed) chunksProcessed++;
          else if (r.rateLimited) chunksProcessed++; // attempted, even if empty
        });
      }
    } else {
      // ── Sequential fallback for very large documents (>~50 pages) ────────────
      for (let batchStart = 0; batchStart < chunks.length; batchStart += FALLBACK_BATCH_SIZE) {
        const batch = chunks.slice(batchStart, batchStart + FALLBACK_BATCH_SIZE);
        const results = await Promise.all(
          batch.map((chunk, i) => processOneChunkBounded(chunk, batchStart + i, totalChunks, geminiToken))
        );

        // Circuit breaker on first batch only
        if (batchStart === 0) {
          const allFirstFailed = batch.length > 0 && results.every((r) => r.failed && !r.rateLimited);
          if (allFirstFailed) {
            console.error("[scan] first batch entirely failed — aborting (AI_SERVICE_ERROR)");
            abortWithServiceError = true;
            break;
          }
        }

        results.forEach((r) => {
          allClauses = [...allClauses, ...r.clauses];
          if (!r.failed) chunksProcessed++;
          else if (r.rateLimited) chunksProcessed++;
        });

        if (batchStart + FALLBACK_BATCH_SIZE < chunks.length) {
          await new Promise((r) => setTimeout(r, FALLBACK_BATCH_PAUSE_MS));
        }
      }
    }

    if (abortWithServiceError) {
      await adminSupabase.from("contracts").update({ status: "pending" }).eq("id", contractId);
      return NextResponse.json({
        error: "The AI analysis service is currently unavailable. Please try again in a few minutes.",
        code: "AI_SERVICE_ERROR",
      }, { status: 503 });
    }

    coverage = { chunksTotal: totalChunks, chunksProcessed, complete: chunksProcessed === totalChunks };
    const clauses = deduplicateClauses(allClauses);
    console.log(`[scan] complete: ${totalChunks} chunks, ${chunksProcessed} processed, ${allClauses.length} raw clauses, ${clauses.length} after dedup, coverage.complete=${coverage.complete}`);

    // Synthesis
    let summaryData = { summary: "", risk_score: 0 };
    try {
      const { text: rawSum } = await callGemini(buildSynthesisPrompt(clauses), geminiToken, 1024);
      summaryData = JSON.parse(cleanJson(rawSum));
    } catch (e) {
      console.error(`[scan] synthesis failed: ${e}`);
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

  // ── Persist ───────────────────────────────────────────────────────────────────
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
