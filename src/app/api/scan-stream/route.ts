import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { callGemini, streamGemini } from "@/lib/gemini";
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
const MAX_CHARS = 600000;
const PER_ATTEMPT_TIMEOUT_MS = 12000;
const PER_CHUNK_TOTAL_BUDGET_MS = 20000;
const SINGLE_BATCH_THRESHOLD = 15;
const FALLBACK_BATCH_SIZE = 10;
const FALLBACK_BATCH_PAUSE_MS = 1500;

type ChunkOutcome = { clauses: Clause[]; failed: boolean; rateLimited: boolean };

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
      `\n\n[ANALYSIS NOTE: Document truncated at ${cutReason}. ${pct}% of document excluded.]`,
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

// ── Per-chunk processing (module-level so the stream constructor can call it) ──

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
        console.warn(`[scan-stream] chunk ${chunkIdx + 1}/${totalChunks}: dropped ${rawClauses.length - validClauses.length} malformed clause(s)`);
      }
      console.log(`[scan-stream] chunk ${chunkIdx + 1}/${totalChunks} ok in ${Date.now() - start}ms (${validClauses.length} clauses)`);
      return { clauses: validClauses, failed: false, rateLimited: false };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isRateLimited =
        errMsg.includes("429") ||
        errMsg.toLowerCase().includes("resource_exhausted") ||
        errMsg.toLowerCase().includes("rate limit");

      if (attempt < MAX_RETRIES) {
        const backoff = isRateLimited ? 3000 : 500;
        console.warn(`[scan-stream] chunk ${chunkIdx + 1}/${totalChunks} attempt ${attempt + 1} failed (${errMsg.slice(0, 80)}), retrying in ${backoff}ms`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      console.error(`[scan-stream] chunk ${chunkIdx + 1}/${totalChunks} failed after ${Date.now() - start}ms: ${errMsg}`);
      return { clauses: [], failed: true, rateLimited: isRateLimited };
    }
  }
  return { clauses: [], failed: true, rateLimited: false };
}

async function processOneChunkBounded(
  chunk: string, chunkIdx: number, totalChunks: number, token: string
): Promise<ChunkOutcome> {
  return Promise.race([
    processOneChunk(chunk, chunkIdx, totalChunks, token),
    new Promise<ChunkOutcome>((resolve) =>
      setTimeout(() => {
        console.warn(`[scan-stream] chunk ${chunkIdx + 1}/${totalChunks} exceeded outer budget (${PER_CHUNK_TOTAL_BUDGET_MS}ms) — skipping`);
        resolve({ clauses: [], failed: true, rateLimited: false });
      }, PER_CHUNK_TOTAL_BUDGET_MS)
    ),
  ]);
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  function sseEvent(event: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  let contractId = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── Auth ─────────────────────────────────────────────────────────────
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { controller.enqueue(sseEvent("error", { message: "Unauthorised" })); controller.close(); return; }

        const adminSupabase = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        try {
          const body = await req.json();
          contractId = body.contractId;
          if (!contractId) throw new Error("missing contractId");
        } catch {
          controller.enqueue(sseEvent("error", { message: "Invalid request body" }));
          controller.close(); return;
        }

        const { data: contract } = await supabase
          .from("contracts").select("*").eq("id", contractId).eq("user_id", user.id).single();
        if (!contract) { controller.enqueue(sseEvent("error", { message: "Contract not found" })); controller.close(); return; }

        // ── Stale scan recovery ──────────────────────────────────────────────
        const now = new Date();
        const contractAge = contract.updated_at ?? contract.created_at;
        const minutesSinceUpdate = contractAge
          ? (now.getTime() - new Date(contractAge).getTime()) / 60000
          : 999;
        const isStaleScanning = contract.status === "scanning" && minutesSinceUpdate > 3;

        if (contract.status === "scanning" && !isStaleScanning) {
          controller.enqueue(sseEvent("error", { message: "A scan is already in progress for this contract." }));
          controller.close(); return;
        }
        if (isStaleScanning) {
          console.log(`[scan-stream] stale scan detected (${Math.round(minutesSinceUpdate)}min), resetting`);
          await supabase.from("contracts").update({ status: "pending" }).eq("id", contractId);
        }

        await supabase.from("contracts").update({ status: "scanning" }).eq("id", contractId);
        controller.enqueue(sseEvent("status", { message: "Extracting text from PDF..." }));

        // ── Parallel: PDF + token ────────────────────────────────────────────
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
          await supabase.from("contracts").update({ status: "pending" }).eq("id", contractId);
          controller.enqueue(sseEvent("error", { message: err instanceof Error ? err.message : "Could not access contract file." }));
          controller.close(); return;
        }

        // ── PDF extraction ───────────────────────────────────────────────────
        let rawText: string;
        let numpages: number;
        try {
          const parser = new PDFParse({ data: Buffer.from(pdfBuffer) });
          const pdfData = await parser.getText() as unknown as { text: string; numpages: number };
          rawText = pdfData.text?.trim() ?? "";
          numpages = pdfData.numpages ?? 1;
        } catch (pdfErr) {
          const errMsg = pdfErr instanceof Error ? pdfErr.message.toLowerCase() : String(pdfErr).toLowerCase();
          const isEncrypted = errMsg.includes("password") || errMsg.includes("encrypt") || errMsg.includes("protect") || errMsg.includes("decrypt");
          await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
          controller.enqueue(sseEvent("error", {
            message: isEncrypted ? "PASSWORD_PROTECTED" : "PDF_PARSE_ERROR",
            detail: isEncrypted
              ? "This PDF is password-protected.\n\nTo remove the password:\n• Adobe Acrobat: File → Properties → Security → Change to \"No Security\"\n• Online (free): smallpdf.com/unlock-pdf\n• Google Chrome: Open PDF → Print → Save as PDF"
              : "This PDF appears to be corrupted or in an unsupported format.\n\nTry re-saving the original document as a new PDF and uploading again.",
          }));
          controller.close(); return;
        }

        const charsPerPage = rawText.length / numpages;
        if (rawText.length < 50 || (charsPerPage < 40 && numpages > 1)) {
          await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
          controller.enqueue(sseEvent("error", {
            message: "SCANNED_PDF",
            detail: "This PDF contains scanned images rather than selectable text, so text extraction is not possible.\n\nTo fix this:\n• Adobe Acrobat → Tools → Enhance Scans → Recognize Text\n• Free OCR: smallpdf.com/pdf-to-word\n• Or export as PDF directly from Word / Google Docs",
          }));
          controller.close(); return;
        }

        // ── Clean + route ────────────────────────────────────────────────────
        const cleanedText = cleanContractText(rawText);
        const mode = getAnalysisMode(cleanedText.length);
        const outputTokens = calculateOutputTokens(cleanedText.length);

        const { text: finalText, wasTruncated, truncatedAt } =
          mode === "chunked" ? { text: cleanedText, wasTruncated: false, truncatedAt: "" } : smartTruncate(cleanedText);

        console.log(`[scan-stream] mode=${mode} pages=${numpages} inputChars=${cleanedText.length} finalChars=${finalText.length} truncated=${wasTruncated}${truncatedAt ? ` at=${truncatedAt}` : ""}`);

        let parsedResult: { summary: string; risk_score: number; clauses: Clause[] } | null = null;
        let coverage = { chunksTotal: 1, chunksProcessed: 1, complete: true };

        // ── SINGLE PASS (streaming) ──────────────────────────────────────────
        if (mode === "single") {
          controller.enqueue(sseEvent("status", { message: "Analysing contract with Gemini..." }));

          for (let attempt = 0; attempt < 2; attempt++) {
            const prompt = attempt === 0
              ? buildScanPrompt(finalText)
              : buildScanPrompt(finalText) + "\n\nCRITICAL: Return ONLY the raw JSON object. Start with { end with }. No backticks.";

            if (attempt === 1) {
              controller.enqueue(sseEvent("status", { message: "Retrying analysis with adjusted prompt..." }));
              await new Promise((r) => setTimeout(r, 1000));
            }

            const geminiStream = await streamGemini(prompt, geminiToken, outputTokens);
            let accumulatedText = "";
            const reader = geminiStream.getReader();
            const decoder = new TextDecoder();

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              for (const line of chunk.split("\n")) {
                if (!line.startsWith("data: ")) continue;
                const jsonStr = line.slice(6).trim();
                if (!jsonStr || jsonStr === "[DONE]") continue;
                try {
                  const gc = JSON.parse(jsonStr);
                  const text = gc?.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (text) { accumulatedText += text; controller.enqueue(sseEvent("chunk", { text })); }
                } catch { /* malformed SSE chunk */ }
              }
            }

            try {
              const p = JSON.parse(cleanJson(accumulatedText));
              if (!Array.isArray(p.clauses)) throw new Error("clauses not array");
              const validClauses = p.clauses.filter(isValidClause);
              if (validClauses.length < p.clauses.length) {
                console.warn(`[scan-stream] dropped ${p.clauses.length - validClauses.length} malformed clause(s) from single-pass`);
              }
              parsedResult = { ...p, clauses: validClauses };
              break;
            } catch (e) {
              console.error(`[scan-stream] single-pass parse failed attempt ${attempt + 1}: ${e}`);
              if (attempt >= 1) {
                await supabase.from("contracts").update({ status: "pending" }).eq("id", contractId);
                controller.enqueue(sseEvent("error", { message: "AI returned an unreadable response after 2 attempts. Please try again." }));
                controller.close(); return;
              }
            }
          }
        }

        // ── CHUNKED ──────────────────────────────────────────────────────────
        else {
          const chunks = chunkDocument(finalText, 10000, 500);
          const totalChunks = chunks.length;
          const strategy = totalChunks <= SINGLE_BATCH_THRESHOLD ? "single parallel wave" : `sequential batches of ${FALLBACK_BATCH_SIZE}`;
          console.log(`[scan-stream] ${totalChunks} chunks from ${finalText.length} chars — ${strategy}`);

          controller.enqueue(sseEvent("status", {
            message: totalChunks === 1
              ? "Analysing contract section with Gemini..."
              : `Analysing ${totalChunks} sections in parallel...`,
          }));

          let allClauses: Clause[] = [];
          let chunksProcessed = 0;
          let abortWithServiceError = false;

          if (totalChunks <= SINGLE_BATCH_THRESHOLD) {
            // ── Single parallel wave ────────────────────────────────────────
            const results = await Promise.all(
              chunks.map((chunk, idx) => processOneChunkBounded(chunk, idx, totalChunks, geminiToken))
            );

            const allFailedNonRateLimit = totalChunks > 0 && results.every((r) => r.failed && !r.rateLimited);
            if (allFailedNonRateLimit) {
              console.error("[scan-stream] all chunks failed with non-rate-limit errors — aborting");
              abortWithServiceError = true;
            } else {
              results.forEach((r) => {
                allClauses = [...allClauses, ...r.clauses];
                if (!r.failed) chunksProcessed++;
                else if (r.rateLimited) chunksProcessed++;
              });

              controller.enqueue(sseEvent("progress", {
                completed: chunksProcessed,
                total: totalChunks,
                message: `Analysed ${chunksProcessed} of ${totalChunks} section${totalChunks !== 1 ? "s" : ""}...`,
              }));
            }
          } else {
            // ── Sequential fallback ─────────────────────────────────────────
            for (let batchStart = 0; batchStart < chunks.length; batchStart += FALLBACK_BATCH_SIZE) {
              const batch = chunks.slice(batchStart, batchStart + FALLBACK_BATCH_SIZE);
              const results = await Promise.all(
                batch.map((chunk, i) => processOneChunkBounded(chunk, batchStart + i, totalChunks, geminiToken))
              );

              if (batchStart === 0) {
                const allFirstFailed = batch.length > 0 && results.every((r) => r.failed && !r.rateLimited);
                if (allFirstFailed) {
                  console.error("[scan-stream] first batch entirely failed — aborting");
                  abortWithServiceError = true;
                  break;
                }
              }

              results.forEach((r) => {
                allClauses = [...allClauses, ...r.clauses];
                if (!r.failed) chunksProcessed++;
                else if (r.rateLimited) chunksProcessed++;
              });

              controller.enqueue(sseEvent("progress", {
                completed: chunksProcessed,
                total: totalChunks,
                message: `Analysed ${chunksProcessed} of ${totalChunks} sections...`,
              }));

              if (batchStart + FALLBACK_BATCH_SIZE < chunks.length) {
                await new Promise((r) => setTimeout(r, FALLBACK_BATCH_PAUSE_MS));
              }
            }
          }

          if (abortWithServiceError) {
            await adminSupabase.from("contracts").update({ status: "pending" }).eq("id", contractId);
            controller.enqueue(sseEvent("error", {
              message: "The AI analysis service is currently unavailable. Please try again in a few minutes.",
              code: "AI_SERVICE_ERROR",
            }));
            controller.close(); return;
          }

          coverage = { chunksTotal: totalChunks, chunksProcessed, complete: chunksProcessed === totalChunks };
          const clauses = deduplicateClauses(allClauses);
          console.log(`[scan-stream] complete: ${totalChunks} chunks, ${chunksProcessed} processed, ${allClauses.length} raw clauses, ${clauses.length} after dedup, coverage.complete=${coverage.complete}`);

          controller.enqueue(sseEvent("status", {
            message: coverage.complete
              ? `All ${totalChunks} section${totalChunks !== 1 ? "s" : ""} analysed. Found ${clauses.length} risk area${clauses.length !== 1 ? "s" : ""}. Generating summary...`
              : `Analysed ${chunksProcessed} of ${totalChunks} sections. Found ${clauses.length} risk area${clauses.length !== 1 ? "s" : ""}. Generating summary...`,
          }));

          // Synthesis
          let summaryData = { summary: "", risk_score: 0 };
          try {
            const { text: rawSum } = await callGemini(buildSynthesisPrompt(clauses), geminiToken, 1024);
            summaryData = JSON.parse(cleanJson(rawSum));
          } catch (e) {
            console.error(`[scan-stream] synthesis failed: ${e}`);
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

        // ── Safety net ───────────────────────────────────────────────────────
        if (!parsedResult || typeof parsedResult.risk_score !== "number" || !Array.isArray(parsedResult.clauses)) {
          await supabase.from("contracts").update({ status: "pending" }).eq("id", contractId);
          controller.enqueue(sseEvent("error", { message: "AI returned an unreadable response. Please try again." }));
          controller.close(); return;
        }

        // ── Deterministic score ──────────────────────────────────────────────
        const high = parsedResult.clauses.filter((c) => c.severity === "high").length;
        const medium = parsedResult.clauses.filter((c) => c.severity === "medium").length;
        const low = parsedResult.clauses.filter((c) => c.severity === "low").length;
        const finalScore = Math.min(100, high * 20 + medium * 8 + low * 2);

        // ── Persist ──────────────────────────────────────────────────────────
        const { data: scan } = await adminSupabase
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
          .select().single();

        await supabase.from("contracts").update({ status: "complete" }).eq("id", contractId);

        const { data: freshUser } = await adminSupabase.from("users").select("scans_used").eq("id", user.id).single();
        await adminSupabase.from("users").update({ scans_used: (freshUser?.scans_used ?? 0) + 1 }).eq("id", user.id);

        controller.enqueue(sseEvent("complete", {
          scan: {
            id: scan!.id, risk_score: finalScore,
            summary: parsedResult.summary, clauses: parsedResult.clauses,
            tokens_used: 0, scanned_at: scan!.scanned_at,
            coverage,
          },
        }));
        controller.close();

      } catch (err) {
        console.error("[scan-stream] unhandled error:", err);
        if (contractId) {
          try {
            const s = await createClient();
            await s.from("contracts").update({ status: "pending" }).eq("id", contractId);
          } catch { /* best effort */ }
        }
        controller.enqueue(sseEvent("error", { message: "An unexpected error occurred. Please try again." }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
