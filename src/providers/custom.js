// Any OpenAI-compatible chat completions endpoint (OpenAI, OpenRouter,
// Groq, etc.) using a key the user supplies and stores locally.

export const id = "custom";
export const label = "Custom API (OpenAI-compatible)";

export async function isAvailable(config = {}) {
  return Boolean(config.baseUrl && config.apiKey);
}

export async function generate(prompt, config = {}) {
  if (!config.baseUrl || !config.apiKey) {
    throw new Error("Custom provider requires baseUrl and apiKey (set in Options).");
  }
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Custom provider request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}
