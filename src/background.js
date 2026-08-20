import { buildPrompt, buildImagePrompt, parseReply } from "./lib/prompt-template.js";
import { generate, getSettings } from "./providers/index.js";

const MENU_EXPLAIN_SELECTION = "delphi-explain-selection";
const MENU_CAPTURE_REGION = "delphi-capture-region";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_EXPLAIN_SELECTION,
    title: "Explain with Delphi",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: MENU_CAPTURE_REGION,
    title: "Capture region with Delphi",
    contexts: ["page", "image"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === MENU_EXPLAIN_SELECTION && info.selectionText) {
    runForText(tab.id, info.selectionText);
  } else if (info.menuItemId === MENU_CAPTURE_REGION) {
    startCapture(tab.id);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === "explain-selection") {
    const [{ result: selectionText }] = await chrome.scripting.executeScript({
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

async function explainText(text) {
  const settings = await getSettings();
  return runGenerate(settings.mode, () => generate(buildPrompt(text, settings.mode)));
}

async function explainImage(imageDataUrl) {
  const settings = await getSettings();
  return runGenerate(settings.mode, () => generate(buildImagePrompt(settings.mode), imageDataUrl));
}

// Selection and region-capture have no natural on-page anchor, so their
// result still goes to the shared bottom-right panel via broadcast.
async function runForText(tabId, text) {
  await ensureContentScript(tabId);
  await chrome.tabs.sendMessage(tabId, { type: "DELPHI_SHOW" });
  const result = await explainText(text);
  await chrome.tabs.sendMessage(tabId, { type: "DELPHI_RESULT", ...result });
}

async function runForImage(tabId, imageDataUrl) {
  await ensureContentScript(tabId);
  await chrome.tabs.sendMessage(tabId, { type: "DELPHI_SHOW" });
  const result = await explainImage(imageDataUrl);
  await chrome.tabs.sendMessage(tabId, { type: "DELPHI_RESULT", ...result });
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["src/content.js"] });
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
  await chrome.tabs.sendMessage(tabId, { type: "DELPHI_CAPTURE_START" });
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (msg.type === "DELPHI_REGION_SELECTED" && tabId) {
    (async () => {
      const shot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" });
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
    explainText(msg.text).then(sendResponse);
    return true; // keep the message channel open for the async response
  }

  if (msg.type === "DELPHI_GET_AUTO") {
    chrome.storage.session.get(`auto:${msg.tabId}`).then((v) =>
      sendResponse(Boolean(v[`auto:${msg.tabId}`]))
    );
    return true; // async response
  }

  if (msg.type === "DELPHI_SET_AUTO") {
    setAuto(msg.tabId, msg.enabled);
    return;
  }

  if (msg.type === "DELPHI_AUTO_STOPPED_LOCALLY" && tabId) {
    chrome.storage.session.set({ [`auto:${tabId}`]: false });
    return;
  }
});

async function setAuto(tabId, enabled) {
  await chrome.storage.session.set({ [`auto:${tabId}`]: enabled });
  if (enabled) {
    await ensureContentScript(tabId);
    await chrome.tabs.sendMessage(tabId, { type: "DELPHI_AUTO_ON" });
  } else {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "DELPHI_AUTO_OFF" });
    } catch {
      // content script may not be present (e.g. tab already navigated) — nothing to do
    }
  }
}

// Auto-detect is scoped to the current page load only — never silently
// re-enabled after navigation. See CLAUDE.md's scope note on why.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") chrome.storage.session.remove(`auto:${tabId}`);
});
chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(`auto:${tabId}`));
