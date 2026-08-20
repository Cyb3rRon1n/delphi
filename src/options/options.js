const DEFAULTS = {
  providerId: "chrome-ai",
  mode: "explain",
  providerConfig: {
    ollama: { baseUrl: "http://localhost:11434", model: "llama3.2" },
    custom: { baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini" },
  },
};

async function load() {
  const settings = await chrome.storage.sync.get(DEFAULTS);

  document.querySelector(`input[name="mode"][value="${settings.mode}"]`).checked = true;
  document.querySelector(`input[name="providerId"][value="${settings.providerId}"]`).checked = true;

  const ollama = { ...DEFAULTS.providerConfig.ollama, ...settings.providerConfig.ollama };
  document.getElementById("ollama-baseUrl").value = ollama.baseUrl;
  document.getElementById("ollama-model").value = ollama.model;

  const custom = { ...DEFAULTS.providerConfig.custom, ...settings.providerConfig.custom };
  document.getElementById("custom-baseUrl").value = custom.baseUrl;
  document.getElementById("custom-apiKey").value = custom.apiKey;
  document.getElementById("custom-model").value = custom.model;
}

async function save() {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const providerId = document.querySelector('input[name="providerId"]:checked').value;

  const providerConfig = {
    ollama: {
      baseUrl: document.getElementById("ollama-baseUrl").value || DEFAULTS.providerConfig.ollama.baseUrl,
      model: document.getElementById("ollama-model").value || DEFAULTS.providerConfig.ollama.model,
    },
    custom: {
      baseUrl: document.getElementById("custom-baseUrl").value || DEFAULTS.providerConfig.custom.baseUrl,
      apiKey: document.getElementById("custom-apiKey").value,
      model: document.getElementById("custom-model").value || DEFAULTS.providerConfig.custom.model,
    },
  };

  await chrome.storage.sync.set({ mode, providerId, providerConfig });
  const status = document.getElementById("status");
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 1500);
}

document.getElementById("save").addEventListener("click", save);
load();
