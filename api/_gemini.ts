export const geminiEnabled = () => !!process.env.GEMINI_API_KEY;

const MODELS = [...new Set([process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.5-flash"].filter(Boolean) as string[])];

// Calls Gemini over plain REST (no SDK). Tries the next model if one is missing or busy.
export async function generate(body: any): Promise<any> {
  let err = "Gemini request failed";
  for (const model of MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok) return json;
    err = `${model}: ${res.status} ${json?.error?.message || ""}`;
    if (![404, 429, 500, 503].includes(res.status)) break;
  }
  throw new Error(err);
}
