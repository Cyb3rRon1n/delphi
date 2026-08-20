import { buildResultBody } from "../lib/render-result.js";

// browser.* (Firefox, promise-only) when present, else chrome.* (Chrome/Brave).
const api = globalThis.browser ?? chrome;

const toggle = document.getElementById("auto-toggle");
const historyEl = document.getElementById("history");
const emptyEl = document.getElementById("empty");

let currentTabId = null;

async function refreshTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id ?? null;
  await Promise.all([refreshAutoToggle(), refreshHistory()]);
}

async function refreshAutoToggle() {
  if (currentTabId == null) return;
  const enabled = await api.runtime.sendMessage({ type: "DELPHI_GET_AUTO", tabId: currentTabId });
  toggle.checked = Boolean(enabled);
}

async function refreshHistory() {
  if (currentTabId == null) return;
  const key = `history:${currentTabId}`;
  const stored = await api.storage.session.get(key);
  renderHistory(stored[key] || []);
}

function renderHistory(entries) {
  historyEl.innerHTML = "";
  emptyEl.style.display = entries.length ? "none" : "block";
  for (const entry of [...entries].reverse()) {
    const card = document.createElement("div");
    card.className = "entry";
    const q = document.createElement("p");
    q.className = "question";
    q.textContent = entry.question;
    card.appendChild(q);
    card.appendChild(buildResultBody(entry));
    historyEl.appendChild(card);
  }
}

toggle.addEventListener("change", () => {
  if (currentTabId == null) return;
  api.runtime.sendMessage({ type: "DELPHI_SET_AUTO", tabId: currentTabId, enabled: toggle.checked });
});

document.getElementById("open-options").addEventListener("click", (e) => {
  e.preventDefault();
  api.runtime.openOptionsPage();
});

api.tabs.onActivated.addListener(refreshTab);
api.storage.onChanged.addListener((changes, area) => {
  if (area !== "session" || currentTabId == null) return;
  if (changes[`history:${currentTabId}`]) refreshHistory();
  if (changes[`auto:${currentTabId}`]) refreshAutoToggle();
});

refreshTab();
