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

export async function generate(prompt, config = {}) {
  const baseUrl = config.baseUrl || DEFAULTS.baseUrl;
  const model = config.model || DEFAULTS.model;

  const res = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!res.ok) {
    throw new Error(`Ollama request failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.response;
}
