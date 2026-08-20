import { buildPrompt, parseReply } from "./lib/prompt-template.js";
import { generate, getSettings } from "./providers/index.js";

const MENU_ID = "delphi-explain-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Explain with Delphi",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && info.selectionText && tab?.id) {
    runFor(tab.id, info.selectionText);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "explain-selection") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const [{ result: selectionText }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString(),
  });
  if (selectionText) runFor(tab.id, selectionText);
});

async function runFor(tabId, text) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["src/content.js"] });
  await chrome.tabs.sendMessage(tabId, { type: "DELPHI_SHOW", text });

  const settings = await getSettings();
  let payload;
  try {
    const reply = await generate(buildPrompt(text, settings.mode));
    payload = { type: "DELPHI_RESULT", mode: settings.mode, ...parseReply(reply) };
  } catch (err) {
    payload = { type: "DELPHI_RESULT", error: err.message };
  }
  await chrome.tabs.sendMessage(tabId, payload);
}
