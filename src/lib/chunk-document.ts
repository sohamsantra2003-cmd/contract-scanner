import type { Clause } from "./scan-utils";

export interface ChunkResult {
  chunkIndex: number;
  clauses: Clause[];
  error: string | null;
}

const MAX_CHUNKS = 60;

export function chunkDocument(
  text: string,
  chunkSize: number = 10000,
  overlap: number = 500
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length && chunks.length < MAX_CHUNKS) {
    let end = Math.min(start + chunkSize, text.length);

    if (end < text.length) {
      const paraBreak = text.lastIndexOf("\n\n", end);
      if (paraBreak > end - 300 && paraBreak > start) {
        end = paraBreak;
      } else {
        const sentEnd = text.lastIndexOf(". ", end);
        if (sentEnd > end - 150 && sentEnd > start) {
          end = sentEnd + 1;
        }
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk.length > 500) {
      chunks.push(chunk);
    }

    start = Math.max(end - overlap, start + 1);
    if (start >= end) start = end;
  }

  return chunks;
}

export function buildChunkPrompt(
  chunk: string,
  chunkIndex: number,
  totalChunks: number
): string {
  return `You are reviewing PART ${chunkIndex + 1} of ${totalChunks} of a legal contract.

Find every risky clause in THIS SECTION ONLY.
Do not invent risks not explicitly stated. Do not repeat risks from other sections.

Return ONLY a raw JSON array. No wrapper. No markdown. Start with [ end with ]. Return [] if none found.

Each object must have:
{
  "text": "exact quoted text from THIS section",
  "category": "payment_terms|liability|auto_renewal|IP|termination|other",
  "severity": "high|medium|low",
  "explanation": "plain-English risk explanation (max 2 sentences)",
  "rewrite": "safer alternative clause (1 sentence)"
}

CONTRACT SECTION ${chunkIndex + 1}/${totalChunks}:
${chunk}`;
}
