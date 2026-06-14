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
    .replace(/^.{1,4}$/gm, "")
    .replace(/^[\s\-_=]{4,}$/gm, "")
    .replace(/(\[[A-Z\s\/\.,]+\][\s\n]*){3,}/g, "[template fields omitted]\n")
    .replace(/^[^|]*(\|[^|]*){2,}$/gm, "")
    .replace(/^[\s\d\(\)\[\]\/\-\.,\:]{10,}$/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

export function calculateOutputTokens(cleanedTextLength: number): number {
  if (cleanedTextLength < 10000)  return 4096;
  if (cleanedTextLength < 25000)  return 6144;
  if (cleanedTextLength < 60000)  return 8192;
  if (cleanedTextLength < 120000) return 12000;
  return 16000;
}

export type AnalysisMode = "single" | "two-pass" | "chunked";

export function getAnalysisMode(cleanedTextLength: number): AnalysisMode {
  if (cleanedTextLength < 25000)  return "single";
  if (cleanedTextLength < 120000) return "two-pass";
  return "chunked";
}

export function deduplicateClauses(clauses: Clause[]): Clause[] {
  const seen = new Set<string>();
  return clauses.filter((clause) => {
    const key = clause.text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 100);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildClausesOnlyPrompt(contractText: string): string {
  return `You are an expert contract lawyer reviewing a business contract for an SMB owner.
Find every risky clause in this contract.

Return ONLY a raw JSON array. No wrapper object. No markdown. No preamble.
Start your response with [ and end with ]. Return [] if no risky clauses are found.

Each item must have exactly these keys:
{
  "text": "exact quoted sentence from the contract",
  "category": "payment_terms|liability|auto_renewal|IP|termination|other",
  "severity": "high|medium|low",
  "explanation": "plain-English explanation of the risk (max 2 sentences)",
  "rewrite": "a safer alternative clause (1 sentence)"
}

CRITICAL: Your entire response must be parseable as a JSON array.
Start with [ and end with ]. Nothing before [. Nothing after ].

Note: This document may be a template with unfilled fields (shown as dots, blanks, or placeholder text). Analyse the clauses as written — flag risks in the actual clause language, not in the unfilled fields. Unfilled placeholder fields are not themselves risks.

CONTRACT TEXT:
${contractText}`;
}

export function buildSynthesisPrompt(clauses: Clause[]): string {
  if (clauses.length === 0) {
    return `A legal contract was reviewed and no risky clauses were found.

Return ONLY this JSON object. No markdown. No preamble. Start with { end with }:
{
  "summary": "This contract appears to be relatively standard with no significant risk clauses identified. However, always consult a qualified lawyer before signing.",
  "risk_score": 5
}`;
  }

  const high = clauses.filter((c) => c.severity === "high").length;
  const med  = clauses.filter((c) => c.severity === "medium").length;
  const low  = clauses.filter((c) => c.severity === "low").length;

  const clauseList = clauses
    .slice(0, 30)
    .map((c, i) =>
      `${i + 1}. [${c.severity.toUpperCase()}] ${c.category.replace(/_/g, " ")}: ` +
      `"${c.text.slice(0, 100)}${c.text.length > 100 ? "..." : ""}"`
    )
    .join("\n");

  return `A legal contract was analysed and found ${clauses.length} risky clauses ` +
    `(${high} high, ${med} medium, ${low} low severity).

Findings:
${clauseList}

Based on these findings, return ONLY this JSON object. No markdown. No preamble. Start with { end with }:
{
  "summary": "2-3 sentence plain-English overview of the overall risk level and the single most important issue the owner should know about before signing.",
  "risk_score": <integer 0-100 reflecting overall risk>
}

risk_score guide: mostly high severity = 70-100, mostly medium = 30-69, mostly low = 0-29`;
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

Note: This document may be a template with unfilled fields (shown as dots, blanks, or placeholder text). Analyse the clauses as written — flag risks in the actual clause language, not in the unfilled fields. Unfilled placeholder fields are not themselves risks.

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
