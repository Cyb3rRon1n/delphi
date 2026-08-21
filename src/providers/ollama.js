export const id = "ollama";
export const label = "Ollama (local)";

const DEFAULTS = { baseUrl: "http://localhost:11434", model: "llama3.2", visionModel: "llava" };

export async function isAvailable(config = {}) {
  const baseUrl = config.baseUrl || DEFAULTS.baseUrl;
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function generate(prompt, config = {}, images = null) {
  const baseUrl = config.baseUrl || DEFAULTS.baseUrl;
  const model = images?.length ? config.visionModel || DEFAULTS.visionModel : config.model || DEFAULTS.model;

  const body = { model, prompt, stream: false, options: { temperature: 0.3 } };
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