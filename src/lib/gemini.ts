import { GoogleAuth } from "google-auth-library";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const GEMINI_STREAM_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse";

async function getToken(prefetchedToken?: string): Promise<string> {
  if (prefetchedToken) return prefetchedToken;
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const auth = new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/generative-language"],
  });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("Failed to get access token from service account");
  return token;
}

const GENERATION_CONFIG = {
  temperature: 0,
  maxOutputTokens: 4096,
  topP: 0.95,
  topK: 20,
};

export async function callGemini(
  prompt: string,
  prefetchedToken?: string
): Promise<{ text: string; tokensUsed: number }> {
  const token = await getToken(prefetchedToken);

  const response = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: GENERATION_CONFIG,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");

  const tokensUsed: number = data?.usageMetadata?.totalTokenCount ?? 0;
  return { text, tokensUsed };
}

export async function streamGemini(
  prompt: string,
  prefetchedToken?: string
): Promise<ReadableStream<Uint8Array>> {
  const token = await getToken(prefetchedToken);

  const response = await fetch(GEMINI_STREAM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: GENERATION_CONFIG,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini stream error ${response.status}: ${err}`);
  }

  return response.body!;
}
