import { buildPrompt, buildImagePrompt, parseReply } from "./lib/prompt-template.js";
import { generate, getSettings } from "./providers/index.js";

// browser.* (Firefox, promise-only) when present, else chrome.* (Chrome/Brave).
const api = globalThis.browser ?? chrome;

const MENU_EXPLAIN_SELECTION = "delphi-explain-selection";
const MENU_CAPTURE_REGION = "delphi-capture-region";

// Chrome/Brave: clicking the toolbar icon opens the side panel directly.
// Firefox has no sidePanel API — it gets its own dedicated toolbar button
// from the "sidebar_action" manifest key instead (no JS wiring needed for
// that), so the main action button falls back to opening Options there
// rather than doing nothing.
if (api.sidePanel) {
  api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
} else if (api.action) {
  api.action.onClicked.addListener(() => api.runtime.openOptionsPage());
}

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({
    id: MENU_EXPLAIN_SELECTION,
    title: "Explain with Delphi",
    contexts: ["selection"],
  });
  api.contextMenus.create({
    id: MENU_CAPTURE_REGION,
    title: "Capture region with Delphi",
    contexts: ["page", "image"],
  });
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === MENU_EXPLAIN_SELECTION && info.selectionText) {
    runForText(tab.id, info.selectionText);
  } else if (info.menuItemId === MENU_CAPTURE_REGION) {
    startCapture(tab.id);
  }
});

api.commands.onCommand.addListener(async (command) => {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === "explain-selection") {
    const [{ result: selectionText }] = await api.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString(),
    });
    if (selectionText) runForText(tab.id, selectionText);
  } else if (command === "capture-region") {
    startCapture(tab.id);
  }
});

// --- text / image explain flows ---------------------------------------

// Shared by every entry point. Never throws — a provider/quota failure
// becomes a normal {error} result so a batch loop (see DELPHI_EXPLAIN_TEXT
// below) can keep going instead of aborting on one bad question.
async function runGenerate(mode, run) {
  try {
    const reply = await run();
    return { mode, ...parseReply(reply) };
  } catch (err) {
    return { error: err.message };
  }
}

// modeOverride, when given, wins over the global Options mode — used by
// auto-detect's per-question "Answer" button to force answer_only for just
// that one call without changing the user's saved default.
async function explainText(text, modeOverride = null) {
  const settings = await getSettings();
  const mode = modeOverride || settings.mode;
  return runGenerate(mode, () => generate(buildPrompt(text, mode)));
}

async function explainImage(imageDataUrl) {
  const settings = await getSettings();
  return runGenerate(settings.mode, () => generate(buildImagePrompt(settings.mode), imageDataUrl));
}

// Every explanation, from any of the three input paths, lands here too —
// the side panel reads it back via chrome.storage.session + storage.onChanged,
// so it works whether or not the panel happens to be open when it's added.
const HISTORY_LIMIT = 50;
async function pushHistory(tabId, entry) {
  const key = `history:${tabId}`;
  const stored = await api.storage.session.get(key);
  const updated = [...(stored[key] || []), { ts: Date.now(), ...entry }].slice(-HISTORY_LIMIT);
  await api.storage.session.set({ [key]: updated });
}

function snippet(text, max = 140) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Selection and region-capture have no natural on-page anchor, so their
// result still goes to the shared bottom-right panel via broadcast.
async function runForText(tabId, text) {
  await ensureContentScript(tabId);
  await api.tabs.sendMessage(tabId, { type: "DELPHI_SHOW" });
  const result = await explainText(text);
  await api.tabs.sendMessage(tabId, { type: "DELPHI_RESULT", ...result });
  await pushHistory(tabId, { question: snippet(text), ...result });
}

async function runForImage(tabId, imageDataUrl) {
  await ensureContentScript(tabId);
  await api.tabs.sendMessage(tabId, { type: "DELPHI_SHOW" });
  const result = await explainImage(imageDataUrl);
  await api.tabs.sendMessage(tabId, { type: "DELPHI_RESULT", ...result });
  await pushHistory(tabId, { question: "[captured image]", ...result });
}

async function ensureContentScript(tabId) {
  await api.scripting.executeScript({ target: { tabId }, files: ["src/content.js"] });
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// --- region capture ------------------------------------------------------

async function startCapture(tabId) {
  await ensureContentScript(tabId);
  await api.tabs.sendMessage(tabId, { type: "DELPHI_CAPTURE_START" });
}

async function cropDataUrl(dataUrl, rect, dpr) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, rect.x * dpr, rect.y * dpr, w, h, 0, 0, w, h);
  const cropped = await canvas.convertToBlob({ type: "image/png" });
  const buf = await cropped.arrayBuffer();
  return `data:image/png;base64,${arrayBufferToBase64(buf)}`;
}

// --- messages from content scripts ---------------------------------------

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (msg.type === "DELPHI_REGION_SELECTED" && tabId) {
    (async () => {
      const shot = await api.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
      const cropped = await cropDataUrl(shot, msg.rect, msg.dpr);
      await runForImage(tabId, cropped);
    })();
    return;
  }

  // From an auto-detect "Explain" click (single or as part of a batch) —
  // responds directly to the sender rather than broadcasting, so content.js
  // can render the result inline next to the specific question and, for a
  // batch, await each one before starting the next.
  if (msg.type === "DELPHI_EXPLAIN_TEXT" && tabId) {
    explainText(msg.text, msg.mode).then((result) => {
      pushHistory(tabId, { question: snippet(msg.text), ...result });
      sendResponse(result);
    });
    return true; // keep the message channel open for the async response
  }

  if (msg.type === "DELPHI_GET_AUTO") {
    api.storage.session.get(`auto:${msg.tabId}`).then((v) =>
      sendResponse(Boolean(v[`auto:${msg.tabId}`]))
    );
    return true; // async response
  }

  if (msg.type === "DELPHI_SET_AUTO") {
    setAuto(msg.tabId, msg.enabled).then(sendResponse);
    return true; // async response
  }

  if (msg.type === "DELPHI_AUTO_STOPPED_LOCALLY" && tabId) {
    api.storage.session.set({ [`auto:${tabId}`]: false });
    return;
  }
});

// host_permissions (<all_urls>) makes this reliable regardless of tab
// switches — see CLAUDE.md for why activeTab-only didn't work here: with
// the side panel already open, re-clicking the toolbar icon to "refresh"
// the grant turned out to be a no-op (nothing to open), so there was no
// way to get a fresh grant for a tab switched to after the panel opened.
// The try/catch stays as a defensive backstop, not the primary defense.
async function setAuto(tabId, enabled) {
  if (!enabled) {
    await api.storage.session.set({ [`auto:${tabId}`]: false });
    try {
      await api.tabs.sendMessage(tabId, { type: "DELPHI_AUTO_OFF" });
    } catch {
      // content script may not be present (e.g. tab already navigated) — nothing to do
    }
    return { ok: true };
  }

  try {
    await ensureContentScript(tabId);
  } catch {
    return {
      ok: false,
      error: "Can't access this tab yet — click the toolbar icon once while on it, then try the toggle again.",
    };
  }
  await api.storage.session.set({ [`auto:${tabId}`]: true });
  await api.tabs.sendMessage(tabId, { type: "DELPHI_AUTO_ON" });
  return { ok: true };
}

// Auto-detect is scoped to the current page load only — never silently
// re-enabled after navigation. See CLAUDE.md's scope note on why. History
// is scoped the same way — a new page is a new set of questions.
api.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    api.storage.session.remove(`auto:${tabId}`);
    api.storage.session.remove(`history:${tabId}`);
  }
});
api.tabs.onRemoved.addListener((tabId) => {
  api.storage.session.remove(`auto:${tabId}`);
  api.storage.session.remove(`history:${tabId}`);
});
