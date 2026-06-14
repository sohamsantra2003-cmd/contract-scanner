import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { streamGemini } from "@/lib/gemini";
import {
  cleanContractText,
  buildScanPrompt,
  prefetchGeminiToken,
  type Clause,
} from "@/lib/scan-utils";
import { PDFParse } from "pdf-parse";
import { getPath as getPdfWorkerPath } from "pdf-parse/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

PDFParse.setWorker(getPdfWorkerPath());

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  function sseEvent(event: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── Auth ──────────────────────────────────────────────────────────
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          controller.enqueue(sseEvent("error", { message: "Unauthorised" }));
          controller.close();
          return;
        }

        const adminSupabase = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // ── Parse body ────────────────────────────────────────────────────
        let contractId: string;
        try {
          const body = await req.json();
          contractId = body.contractId;
          if (!contractId) throw new Error("missing contractId");
        } catch {
          controller.enqueue(sseEvent("error", { message: "Invalid request body" }));
          controller.close();
          return;
        }

        // ── Fetch contract ────────────────────────────────────────────────
        const { data: contract } = await supabase
          .from("contracts")
          .select("*")
          .eq("id", contractId)
          .eq("user_id", user.id)
          .single();

        if (!contract) {
          controller.enqueue(sseEvent("error", { message: "Contract not found" }));
          controller.close();
          return;
        }

        // ── Block concurrent scans ────────────────────────────────────────
        if (contract.status === "scanning") {
          controller.enqueue(sseEvent("error", { message: "Scan already in progress" }));
          controller.close();
          return;
        }

        // ── Mark scanning ─────────────────────────────────────────────────
        await supabase.from("contracts").update({ status: "scanning" }).eq("id", contractId);

        controller.enqueue(sseEvent("status", { message: "Extracting text from PDF..." }));

        // ── Parallel: PDF download + Gemini token ─────────────────────────
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
          controller.enqueue(sseEvent("error", { message: msg }));
          controller.close();
          return;
        }

        // ── Extract text ──────────────────────────────────────────────────
        let rawText: string;
        try {
          const parser = new PDFParse({ data: Buffer.from(pdfBuffer) });
          const pdfData = await parser.getText();
          rawText = pdfData.text?.trim() ?? "";
        } catch {
          await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
          controller.enqueue(sseEvent("error", { message: "Failed to read the PDF file. The file may be corrupted." }));
          controller.close();
          return;
        }

        if (!rawText || rawText.length < 50) {
          await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
          controller.enqueue(sseEvent("error", {
            message: "This PDF appears to be scanned. Text extraction requires a text-based PDF.",
          }));
          controller.close();
          return;
        }

        const cleanedText = cleanContractText(rawText);
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

        controller.enqueue(sseEvent("status", { message: "Analysing contract with Gemini..." }));

        // ── Build prompt ──────────────────────────────────────────────────
        const systemPrompt = buildScanPrompt(finalText);

        // ── Stream from Gemini with retry on parse failure ────────────────
        let parsedResult: { summary: string; risk_score: number; clauses: Clause[] } | null = null;

        for (let attempt = 0; attempt < 2; attempt++) {
          const retryPrompt =
            attempt === 0
              ? systemPrompt
              : systemPrompt +
                '\n\nCRITICAL: Your previous response could not be parsed as JSON. Return ONLY the raw JSON object. No backticks. No "```json". No explanation. Start your response with { and end with }';

          if (attempt === 1) {
            controller.enqueue(sseEvent("status", { message: "Retrying analysis with adjusted prompt..." }));
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          const geminiStream = await streamGemini(retryPrompt, geminiToken);
          let accumulatedText = "";
          const reader = geminiStream.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;

              try {
                const geminiChunk = JSON.parse(jsonStr);
                const text = geminiChunk?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                  accumulatedText += text;
                  controller.enqueue(sseEvent("chunk", { text }));
                }
              } catch {
                // Malformed chunk — skip
              }
            }
          }

          const cleanedJson = accumulatedText
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```\s*$/i, "")
            .replace(/^[^{]*({)/, "$1")
            .replace(/(})[^}]*$/, "$1")
            .trim();

          try {
            parsedResult = JSON.parse(cleanedJson);
            break;
          } catch {
            console.error(`[scan-stream] JSON parse failed (attempt ${attempt + 1}). Length: ${accumulatedText.length}`);
            console.error("[scan-stream] First 500 chars:", accumulatedText.slice(0, 500));
            if (attempt >= 1) {
              await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
              controller.enqueue(sseEvent("error", { message: "AI returned an unreadable response after 2 attempts." }));
              controller.close();
              return;
            }
          }
        }

        if (!parsedResult) {
          await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
          controller.enqueue(sseEvent("error", { message: "AI returned an unreadable response." }));
          controller.close();
          return;
        }

        if (typeof parsedResult.risk_score !== "number" || !Array.isArray(parsedResult.clauses)) {
          await supabase.from("contracts").update({ status: "error" }).eq("id", contractId);
          controller.enqueue(sseEvent("error", { message: "AI response was missing required fields." }));
          controller.close();
          return;
        }

        // ── Deterministic score ───────────────────────────────────────────
        const high = parsedResult.clauses.filter((c) => c.severity === "high").length;
        const medium = parsedResult.clauses.filter((c) => c.severity === "medium").length;
        const low = parsedResult.clauses.filter((c) => c.severity === "low").length;
        const finalScore = Math.min(100, high * 20 + medium * 8 + low * 2);

        // ── Persist ───────────────────────────────────────────────────────
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
          .select()
          .single();

        await supabase.from("contracts").update({ status: "complete" }).eq("id", contractId);

        // Increment scans_used
        const { data: freshUser } = await adminSupabase
          .from("users")
          .select("scans_used")
          .eq("id", user.id)
          .single();
        await adminSupabase
          .from("users")
          .update({ scans_used: (freshUser?.scans_used ?? 0) + 1 })
          .eq("id", user.id);

        // ── Complete event ────────────────────────────────────────────────
        controller.enqueue(
          sseEvent("complete", {
            scan: {
              id: scan!.id,
              risk_score: finalScore,
              summary: parsedResult.summary,
              clauses: parsedResult.clauses,
              tokens_used: 0,
              scanned_at: scan!.scanned_at,
            },
          })
        );

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
