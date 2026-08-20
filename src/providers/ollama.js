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

// images, when present, is an array of "data:image/...;base64,..." strings —
// Ollama's /api/generate wants raw base64 with no data: prefix, and a
// vision-capable model (e.g. llava, qwen2-vl, llama3.2-vision). Its images
// field is already an array, so multiple screenshots need no extra work here.
export async function generate(prompt, config = {}, images = null) {
  const baseUrl = config.baseUrl || DEFAULTS.baseUrl;
  const model = config.model || DEFAULTS.model;

  const body = { model, prompt, stream: false };
  if (images?.length) body.images = images.map((url) => url.replace(/^data:.*?;base64,/, ""));

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
