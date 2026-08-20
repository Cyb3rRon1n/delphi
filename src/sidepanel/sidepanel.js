import { buildResultBody } from "../lib/render-result.js";

// browser.* (Firefox, promise-only) when present, else chrome.* (Chrome/Brave).
const api = globalThis.browser ?? chrome;

const toggle = document.getElementById("auto-toggle");
const autoError = document.getElementById("auto-error");
const historyEl = document.getElementById("history");
const emptyEl = document.getElementById("empty");
const checkPageBtn = document.getElementById("check-page");

let currentTabId = null;

async function refreshTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id ?? null;
  resetCheckPageButton();
  await Promise.all([refreshAutoToggle(), refreshHistory()]);
}

function resetCheckPageButton() {
  checkPageBtn.disabled = false;
  checkPageBtn.textContent = "Check this page";
}

checkPageBtn.addEventListener("click", () => {
  if (currentTabId == null) return;
  checkPageBtn.disabled = true;
  checkPageBtn.textContent = "Checking… (can take a while on local models)";
  api.runtime.sendMessage({ type: "DELPHI_CHECK_PAGE", tabId: currentTabId });
});

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

// Collapsed by default (native <details>, no custom JS needed) — a full
// explanation per entry was a lot of text to scroll past just to browse
// history. The most recent entry stays open, since that's usually the one
// you actually want to read right after asking for it.
function renderHistory(entries) {
  historyEl.innerHTML = "";
  emptyEl.style.display = entries.length ? "none" : "block";
  [...entries].reverse().forEach((entry, i) => {
    const details = document.createElement("details");
    details.className = "entry";
    details.open = i === 0;
    const summary = document.createElement("summary");
    summary.textContent = entry.question;
    details.appendChild(summary);
    details.appendChild(buildResultBody(entry));
    historyEl.appendChild(details);
  });
}

toggle.addEventListener("change", async () => {
  if (currentTabId == null) return;
  const result = await api.runtime.sendMessage({
    type: "DELPHI_SET_AUTO",
    tabId: currentTabId,
    enabled: toggle.checked,
  });
  if (result?.ok) {
    autoError.style.display = "none";
  } else {
    toggle.checked = false; // it didn't actually turn on — don't show a state that isn't real
    autoError.textContent = result?.error || "Couldn't enable auto-detect on this tab.";
    autoError.style.display = "block";
  }
});

document.getElementById("open-options").addEventListener("click", (e) => {
  e.preventDefault();
  api.runtime.openOptionsPage();
});

api.tabs.onActivated.addListener(refreshTab);
api.storage.onChanged.addListener((changes, area) => {
  if (area !== "session" || currentTabId == null) return;
  if (changes[`history:${currentTabId}`]) {
    refreshHistory();
    resetCheckPageButton(); // a new entry means whatever was running finished
  }
  if (changes[`auto:${currentTabId}`]) refreshAutoToggle();
});

refreshTab();
