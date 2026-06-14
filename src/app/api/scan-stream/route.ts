import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { callGemini, streamGemini } from "@/lib/gemini";
import {
  cleanContractText,
  buildScanPrompt,
  buildClausesOnlyPrompt,
  buildSynthesisPrompt,
  deduplicateClauses,
  getAnalysisMode,
  calculateOutputTokens,
  prefetchGeminiToken,
  type Clause,
} from "@/lib/scan-utils";
import { chunkDocument, buildChunkPrompt } from "@/lib/chunk-document";
import { PDFParse } from "pdf-parse";
import { getPath as getPdfWorkerPath } from "pdf-parse/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

PDFParse.setWorker(getPdfWorkerPath());

const MAX_CHARS = 120000;
const PARALLEL_BATCH_SIZE = 10;

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

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  function sseEvent(event: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── Auth ────────────────────────────────────────────────────────────
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { controller.enqueue(sseEvent("error", { message: "Unauthorised" })); controller.close(); return; }

        const adminSupabase = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        let contractId: string;
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

        if (contract.status === "scanning") {
          controller.enqueue(sseEvent("error", { message: "Scan already in progress" }));
          controller.close(); return;
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
          await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
          controller.enqueue(sseEvent("error", { message: err instanceof Error ? err.message : "Could not access contract file." }));
          controller.close(); return;
        }

        // ── PDF extraction (Fix C + D) ───────────────────────────────────────
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

        // ── Clean + mode route ───────────────────────────────────────────────
        const cleanedText = cleanContractText(rawText);
        const mode = getAnalysisMode(cleanedText.length);
        const outputTokens = calculateOutputTokens(cleanedText.length);

        const { text: finalText, wasTruncated, truncatedAt } =
          mode === "chunked" ? { text: cleanedText, wasTruncated: false, truncatedAt: "" } : smartTruncate(cleanedText);

        console.log(`[scan-stream] mode=${mode} inputChars=${cleanedText.length} finalChars=${finalText.length} truncated=${wasTruncated} truncatedAt=${truncatedAt} outputTokens=${outputTokens}`);

        let parsedResult: { summary: string; risk_score: number; clauses: Clause[] } | null = null;

        // ── SINGLE PASS (streaming) ──────────────────────────────────────────
        if (mode === "single") {
          controller.enqueue(sseEvent("status", { message: "Analysing contract with Gemini..." }));

          for (let attempt = 0; attempt < 2; attempt++) {
            const prompt = attempt === 0
              ? buildScanPrompt(finalText)
              : buildScanPrompt(finalText) + '\n\nCRITICAL: Return ONLY the raw JSON object. Start with { end with }. No backticks.';

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
                } catch { /* malformed chunk */ }
              }
            }

            try {
              const p = JSON.parse(cleanJson(accumulatedText));
              if (!Array.isArray(p.clauses)) throw new Error("clauses not array");
              parsedResult = p;
              break;
            } catch (e) {
              console.error(`[scan-stream] single-pass parse failed attempt ${attempt + 1}: ${e}`);
              if (attempt >= 1) {
                await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
                controller.enqueue(sseEvent("error", { message: "AI returned an unreadable response after 2 attempts." }));
                controller.close(); return;
              }
            }
          }
        }

        // ── TWO PASS ────────────────────────────────────────────────────────
        else if (mode === "two-pass") {
          controller.enqueue(sseEvent("status", { message: "Extracting clauses from contract..." }));

          // Pass 1: stream clause extraction
          let clauses: Clause[] = [];
          for (let attempt = 0; attempt < 2; attempt++) {
            const prompt = attempt === 0
              ? buildClausesOnlyPrompt(finalText)
              : buildClausesOnlyPrompt(finalText) + "\n\nCRITICAL: Return ONLY a JSON array starting with [ and ending with ]. No wrapper object.";

            if (attempt === 1) {
              controller.enqueue(sseEvent("status", { message: "Retrying clause extraction..." }));
              await new Promise((r) => setTimeout(r, 1000));
            }

            const geminiStream = await streamGemini(prompt, geminiToken, 16000);
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
                } catch { /* malformed chunk */ }
              }
            }

            try {
              const p = JSON.parse(cleanJson(accumulatedText, true));
              clauses = Array.isArray(p) ? p : (Array.isArray(p.clauses) ? p.clauses : []);
              console.log(`[scan-stream] pass1 clauses=${clauses.length}`);
              break;
            } catch (e) {
              console.error(`[scan-stream] pass1 attempt ${attempt + 1} failed: ${e}`);
              if (attempt >= 1) clauses = [];
              else await new Promise((r) => setTimeout(r, 1500));
            }
          }

          clauses = deduplicateClauses(clauses);
          controller.enqueue(sseEvent("status", {
            message: `Found ${clauses.length} risk areas. Generating summary...`,
          }));

          // Pass 2: synthesis (fast, non-streaming)
          let summaryData = { summary: "", risk_score: 0 };
          try {
            const { text: rawSum } = await callGemini(buildSynthesisPrompt(clauses), geminiToken, 1024);
            summaryData = JSON.parse(cleanJson(rawSum));
          } catch (e) {
            console.error(`[scan-stream] pass2 failed: ${e}`);
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

        // ── CHUNKED (Phase 2) ────────────────────────────────────────────────
        else {
          const chunks = chunkDocument(finalText, 10000, 500);
          const totalChunks = chunks.length;
          console.log(`[scan-stream] chunked: ${totalChunks} chunks`);

          controller.enqueue(sseEvent("status", {
            message: `Analysing ${totalChunks} sections in parallel...`,
          }));

          let allClauses: Clause[] = [];
          let completedChunks = 0;

          for (let batchStart = 0; batchStart < totalChunks; batchStart += PARALLEL_BATCH_SIZE) {
            const batch = chunks.slice(batchStart, batchStart + PARALLEL_BATCH_SIZE);
            const batchResults = await Promise.all(
              batch.map(async (chunk, batchIdx) => {
                const idx = batchStart + batchIdx;
                try {
                  const { text: raw } = await callGemini(buildChunkPrompt(chunk, idx, totalChunks), geminiToken, 4096);
                  const p = JSON.parse(cleanJson(raw, true));
                  const found = (Array.isArray(p) ? p : []) as Clause[];
                  completedChunks++;
                  controller.enqueue(sseEvent("progress", {
                    completed: completedChunks, total: totalChunks,
                    message: `Analysed section ${completedChunks} of ${totalChunks}...`,
                  }));
                  return found;
                } catch (e) {
                  console.error(`[scan-stream] chunk ${idx + 1} failed: ${e}`);
                  completedChunks++;
                  controller.enqueue(sseEvent("progress", {
                    completed: completedChunks, total: totalChunks,
                    message: `Analysed section ${completedChunks} of ${totalChunks}...`,
                  }));
                  return [] as Clause[];
                }
              })
            );
            allClauses = [...allClauses, ...batchResults.flat()];
            if (batchStart + PARALLEL_BATCH_SIZE < totalChunks) {
              await new Promise((r) => setTimeout(r, 500));
            }
          }

          const clauses = deduplicateClauses(allClauses);
          console.log(`[scan-stream] chunked dedup: ${allClauses.length} → ${clauses.length}`);

          controller.enqueue(sseEvent("status", {
            message: `All ${totalChunks} sections analysed. Found ${clauses.length} risk areas. Generating summary...`,
          }));

          let summaryData = { summary: "", risk_score: 0 };
          try {
            const { text: rawSum } = await callGemini(buildSynthesisPrompt(clauses), geminiToken, 1024);
            summaryData = JSON.parse(cleanJson(rawSum));
          } catch (e) {
            console.error(`[scan-stream] chunked synthesis failed: ${e}`);
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
          await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
          controller.enqueue(sseEvent("error", { message: "AI returned an unreadable response." }));
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
          },
        }));
        controller.close();

      } catch (err) {
        console.error("[scan-stream] unhandled error:", err);
        controller.enqueue(sseEvent("error", { message: "An unexpected error occurred." }));
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
