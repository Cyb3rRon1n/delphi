// Local Ollama server. Free, private, no key — requires the user to have
// Ollama running (https://ollama.com) with a model pulled.

export const id = "ollama";
export const label = "Ollama (local)";

const DEFAULTS = { baseUrl: "http://localhost:11434", model: "llama3.2" };

export async function isAvailable(config = {}) {
  const baseUrl = config.baseUrl || DEFAULTS.baseUrl;
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

// imageDataUrl, when present, is a "data:image/...;base64,..." string —
// Ollama's /api/generate wants raw base64 with no data: prefix, and a
// vision-capable model (e.g. llava, qwen2-vl, llama3.2-vision).
export async function generate(prompt, config = {}, imageDataUrl = null) {
  const baseUrl = config.baseUrl || DEFAULTS.baseUrl;
  const model = config.model || DEFAULTS.model;

  const body = { model, prompt, stream: false };
  if (imageDataUrl) body.images = [imageDataUrl.replace(/^data:.*?;base64,/, "")];

  const res = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.response;
}
