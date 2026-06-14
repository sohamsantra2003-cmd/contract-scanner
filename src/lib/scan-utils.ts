import { GoogleAuth } from "google-auth-library";

export type Clause = {
  text: string;
  category: "payment_terms" | "liability" | "auto_renewal" | "IP" | "termination" | "other";
  severity: "high" | "medium" | "low";
  explanation: string;
  rewrite: string;
};

export type ScanResult = {
  id: string;
  risk_score: number;
  summary: string;
  clauses: Clause[];
  tokens_used: number;
  scanned_at: string;
};

export function cleanContractText(raw: string): string {
  return raw
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*\d+\s*$/gm, "")
    .replace(/^.{1,5}$/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

export function buildScanPrompt(contractText: string): string {
  return `You are an expert contract lawyer reviewing a business contract for an SMB owner.
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
${contractText}`;
}

export async function prefetchGeminiToken(): Promise<string> {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/generative-language"],
  });
  const token = await auth.getAccessToken();
  return token!;
}
