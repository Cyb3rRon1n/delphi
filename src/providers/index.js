import * as chromeAi from "./chrome-ai.js";
import * as ollama from "./ollama.js";
import * as custom from "./custom.js";

export const PROVIDERS = { [chromeAi.id]: chromeAi, [ollama.id]: ollama, [custom.id]: custom };

const DEFAULT_SETTINGS = {
  providerId: chromeAi.id,
  mode: "explain",
  providerConfig: {}, // per-provider settings, keyed by provider id
};

// browser.* (Firefox, promise-only) when present, else chrome.* (Chrome/Brave).
const api = globalThis.browser ?? chrome;

export async function getSettings() {
  const stored = await api.storage.sync.get(DEFAULT_SETTINGS);
  return stored;
}

export async function generate(prompt, imageDataUrl = null) {
  const settings = await getSettings();
  const provider = PROVIDERS[settings.providerId] || chromeAi;
  const config = settings.providerConfig?.[provider.id] || {};
  return provider.generate(prompt, config, imageDataUrl);
}
