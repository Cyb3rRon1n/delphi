// Any OpenAI-compatible chat completions endpoint (OpenAI, OpenRouter,
// Groq, etc.) using a key the user supplies and stores locally.

export const id = "custom";
export const label = "Custom API (OpenAI-compatible)";

export async function isAvailable(config = {}) {
  return Boolean(config.baseUrl && config.apiKey);
}

// imageDataUrl, when present, uses the standard OpenAI vision content-array
// shape ({type: "image_url"}) — supported by OpenAI, OpenRouter, and most
// OpenAI-compatible endpoints when the chosen model is vision-capable.
export async function generate(prompt, config = {}, imageDataUrl = null) {
  if (!config.baseUrl || !config.apiKey) {
    throw new Error("Custom provider requires baseUrl and apiKey (set in Options).");
  }
  const content = imageDataUrl
    ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageDataUrl } }]
    : prompt;

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || "gpt-4o-mini",
      messages: [{ role: "user", content }],
    }),
  });
  if (res.status === 429) {
    // The real cap that actually applies to this provider — unlike
    // on-device chrome-ai, a hosted API's rate/usage limit is a genuine
    // whole-account constraint, not just a per-call one.
    throw new Error("Rate limited by the API (429) — wait a moment, or switch provider in Options.");
  }
  if (!res.ok) {
    throw new Error(`Custom provider request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}
