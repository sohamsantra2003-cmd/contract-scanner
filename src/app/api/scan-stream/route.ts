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
        const finalText = cleanedText.length > 40000
          ? cleanedText.slice(0, 40000) + "\n\n[Truncated to 40,000 chars]"
          : cleanedText;

        controller.enqueue(sseEvent("status", { message: "Analysing contract with Gemini..." }));

        // ── Stream from Gemini ────────────────────────────────────────────
        const systemPrompt = buildScanPrompt(finalText);
        const geminiStream = await streamGemini(systemPrompt, geminiToken);

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
              const parsed = JSON.parse(jsonStr);
              const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                accumulatedText += text;
                controller.enqueue(sseEvent("chunk", { text }));
              }
            } catch {
              // Malformed chunk — skip
            }
          }
        }

        // ── Parse final JSON ──────────────────────────────────────────────
        const cleaned = accumulatedText
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim();

        let parsedResult: { summary: string; risk_score: number; clauses: Clause[] };
        try {
          parsedResult = JSON.parse(cleaned);
        } catch {
          console.error("[scan-stream] JSON parse failed. Accumulated length:", accumulatedText.length);
          console.error("[scan-stream] First 500 chars:", accumulatedText.slice(0, 500));
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
