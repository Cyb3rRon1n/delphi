import {
  buildPrompt,
  buildImagePrompt,
  buildPageCheckPrompt,
  parsePageCheckReply,
  parseIdentifiedReply,
  finalizeReply,
} from "./lib/prompt-template.js";
import { generate, getSettings } from "./providers/index.js";

// browser.* (Firefox, promise-only) when present, else chrome.* (Chrome/Brave).
const api = globalThis.browser ?? chrome;

const MENU_EXPLAIN_SELECTION = "delphi-explain-selection";
const MENU_CAPTURE_REGION = "delphi-capture-region";
const MENU_CHECK_PAGE = "delphi-check-page";

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
  api.contextMenus.create({
    id: MENU_CHECK_PAGE,
    title: "Check this page with Delphi",
    contexts: ["page"],
  });
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === MENU_EXPLAIN_SELECTION && info.selectionText) {
    runForText(tab.id, info.selectionText);
  } else if (info.menuItemId === MENU_CAPTURE_REGION) {
    startCapture(tab.id);
  } else if (info.menuItemId === MENU_CHECK_PAGE) {
    checkPage(tab.id);
  }
});

api.commands.onCommand.addListener(async (command) => {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === "explain-selection") {
    // allFrames: a selection made inside an iframe (common for LMS/quiz
    // content) lives in that iframe's own document — the top frame alone
    // wouldn't see it. Picks the first frame that actually has a selection.
    const results = await api.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => window.getSelection().toString(),
    });
    const selectionText = results.map((r) => r.result).find((t) => t && t.trim());
    if (selectionText) runForText(tab.id, selectionText);
  } else if (command === "capture-region") {
    startCapture(tab.id);
  } else if (command === "check-page") {
    checkPage(tab.id);
  }
});

// --- text / image explain flows ---------------------------------------

// Shared by every entry point. Never throws — a provider/quota failure
// becomes a normal {error} result so a batch loop (see DELPHI_EXPLAIN_TEXT
// below) can keep going instead of aborting on one bad question.
//
// MV3 kills this service worker after ~30s idle — confirmed live (DevTools
// showed "service worker (inactive)") mid-request on a slow local model,
// which silently abandons whatever was awaited with no error and no result,
// ever. A call to any extension API resets that idle timer, so ping one
// every 20s (comfortably under 30s) for as long as the real call is running.
async function withKeepAlive(run) {
  const interval = setInterval(() => api.storage.session.get("_ping"), 20000);
  try {
    return await run();
  } finally {
    clearInterval(interval);
  }
}

async function runGenerate(mode, run) {
  try {
    const reply = await withKeepAlive(run);
    return { mode, ...finalizeReply(parseIdentifiedReply(reply), mode) };
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
  return runGenerate(settings.mode, () => generate(buildImagePrompt(settings.mode), [imageDataUrl]));
}

// Every explanation, from any of the three input paths, lands here too —
// the side panel reads it back via chrome.storage.session + storage.onChanged,
// so it works whether or not the panel happens to be open when it's added.
const HISTORY_LIMIT = 50;
async function pushHistoryMany(tabId, entries) {
  const key = `history:${tabId}`;
  const stored = await api.storage.session.get(key);
  // A multi-entry push (e.g. check-page's numbered questions) gets a shared
  // batchId so the side panel can keep the batch in ascending push order
  // (#1 first) while still reversing batches themselves newest-first —
  // plain single pushes get none, so their per-entry newest-first order is
  // untouched. See renderHistory() in sidepanel.js.
  const batchId = entries.length > 1 ? crypto.randomUUID() : undefined;
  const stamped = entries.map((e) => ({ id: crypto.randomUUID(), ts: Date.now(), batchId, ...e }));
  const updated = [...(stored[key] || []), ...stamped].slice(-HISTORY_LIMIT);
  await api.storage.session.set({ [key]: updated });
}
async function pushHistory(tabId, entry) {
  await pushHistoryMany(tabId, [entry]);
}

// The side panel (and anything else watching this tab) reads this back via
// storage.onChanged — the same live-update pattern history/auto-detect
// already use, not a new broadcast mechanism. Covers the paths that had no
// side-panel-visible feedback at all before (selection, region capture,
// check-page) — auto-detect already shows its own per-button/badge status
// directly on the page, so it doesn't set this (would just flicker on/off
// repeatedly during a batch, adding noise instead of clarity).
async function setBusy(tabId, busy) {
  await api.storage.session.set({ [`busy:${tabId}`]: busy });
}

function snippet(text, max = 140) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Selection and region-capture have no natural on-page anchor, so their
// result still goes to the shared bottom-right panel via broadcast.
async function report(tabId, question, result) {
  await api.tabs.sendMessage(tabId, { type: "DELPHI_RESULT", ...result }).catch(() => {});
  await pushHistory(tabId, { ...result, question });
}

async function runForText(tabId, text) {
  await setBusy(tabId, true);
  try {
    await ensureContentScript(tabId);
    await api.tabs.sendMessage(tabId, { type: "DELPHI_SHOW" });
    const result = await explainText(text);
    // The model's restated question (see parseIdentifiedReply) is usually a
    // cleaner label than the raw selection, which can carry page clutter —
    // fall back to the raw text if the model didn't identify one.
    await report(tabId, snippet(result.question || text), result);
  } catch (err) {
    await report(tabId, snippet(text), { error: err.message });
  } finally {
    await setBusy(tabId, false);
  }
}

async function runForImage(tabId, imageDataUrl) {
  await setBusy(tabId, true);
  try {
    await ensureContentScript(tabId);
    await api.tabs.sendMessage(tabId, { type: "DELPHI_SHOW" });
    const result = await explainImage(imageDataUrl);
    // The identified-question line (see parseIdentifiedReply) makes a much more
    // useful history label than the static placeholder — snippet() keeps it
    // from blowing out the collapsed <summary> row if it's a long question.
    const label = result.question ? snippet(result.question) : "[captured image]";
    await report(tabId, label, result);
  } catch (err) {
    await report(tabId, "[captured image]", { error: err.message });
  } finally {
    await setBusy(tabId, false);
  }
}

// "Check this page" — captures the whole visible tab (not a dragged
// region) and asks the model to find and answer *every* question in it.
// Screenshot-based like region capture, so it works inside iframes too
// (e.g. JSP/LMS knowledge checks) where DOM-based paths can't see anything.
// The reply can list several questions, so it's rendered as raw text
// (explanation only, no single answer to extract) rather than through
// parseReply, which assumes one trailing "Answer:" line.
// captureVisibleTab only ever grabs the visible viewport — there's no
// single-call "whole scrollable page" screenshot API. So: scroll to each
// section, capture, repeat, then restore the original scroll position.
// Capped at MAX_PAGE_CHECK_SHOTS — more images means proportionally longer
// processing on a local model, which is already the slow part (see
// withKeepAlive). Was 8, which silently capped capture at whatever fits in
// the first ~8 viewport heights — confirmed live on a real 50-question page
// (all 50 statically laid out on one scrollable page, not paginated): only
// the top ~22 ever made it into an image, the other 28 were mechanically
// invisible to the model no matter how the prompt/retry logic behaved.
// Raised with headroom for that case; if a page still needs more, raise
// this further (and reconsider MAX_ROUNDS below together with it).
const MAX_PAGE_CHECK_SHOTS = 25;

// Sent to the model in chunks of this many images per generate() call, not
// all MAX_PAGE_CHECK_SHOTS at once — confirmed live: the very first run
// after raising MAX_PAGE_CHECK_SHOTS from 8 to 25 failed outright with a raw
// "kErrorUnknown" (an opaque Chrome on-device-model failure, no useful
// detail), which never happened at 8. 8 is the last confirmed-working count
// for chrome-ai's on-device model, so that's the per-call ceiling; capture
// still goes up to MAX_PAGE_CHECK_SHOTS, it's just spread across more,
// smaller calls instead of one oversized one.
const SHOTS_PER_CALL = 8;

// allFrames: the page that doesn't scroll (or the top frame reporting a
// tiny scrollHeight) is a real, common case — LMS/course-player content is
// often rendered inside an iframe with its own internal scroll, and the top
// window never moves at all. Checking every frame and using whichever one
// actually has the most content to scroll through covers both that case
// and the plain top-level-scroll case with the same code path.
async function getPageMetrics(tabId) {
  const results = await api.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => ({
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }),
  });
  return results
    .map((r) => r.result)
    .reduce((max, m) => (m.scrollHeight - m.viewportHeight > max.scrollHeight - max.viewportHeight ? m : max));
}

async function scrollTo(tabId, y) {
  // Scroll every frame to the same Y — harmless no-op for a frame with
  // nothing to scroll (it just clamps), correct for whichever one does.
  await api.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (y) => window.scrollTo(0, y),
    args: [y],
  });
}

async function captureFullPage(tabId, windowId) {
  const { scrollHeight, viewportHeight } = await getPageMetrics(tabId);

  const positions = [0];
  while (positions[positions.length - 1] + viewportHeight < scrollHeight && positions.length < MAX_PAGE_CHECK_SHOTS) {
    positions.push(positions[positions.length - 1] + viewportHeight);
  }
  // Temporary diagnostic — check the service worker console after running
  // "Check this page": if shots=1 on a page with visibly more content below
  // the fold, getPageMetrics's document.documentElement.scrollHeight isn't
  // seeing whatever's actually scrolling (a plain overflow:auto div, not the
  // window or an iframe — the known, documented gap in that function).
  console.log("[Delphi] captureFullPage:", { scrollHeight, viewportHeight, shots: positions.length });

  const shots = [];
  for (const y of positions) {
    await scrollTo(tabId, y);
    await new Promise((r) => setTimeout(r, 500)); // let the page repaint/lazy-load, and stay under Chrome's ~2/sec captureVisibleTab rate limit
    shots.push(await api.tabs.captureVisibleTab(windowId, { format: "png" }));
  }

  await scrollTo(tabId, 0); // simplest reliable reset across every frame, not just the one that scrolled
  return shots;
}

async function checkPage(tabId) {
  await setBusy(tabId, true);
  try {
    await ensureContentScript(tabId);
    await api.tabs.sendMessage(tabId, { type: "DELPHI_SHOW" });
    const settings = await getSettings();
    const { windowId } = await api.tabs.get(tabId);
    const shots = await captureFullPage(tabId, windowId);

    // A plain retry on total format failure used to be enough, but confirmed
    // live on a real 9-question page (Ollama): the model answered only
    // Question 1, formatted perfectly, then stopped — and an identical
    // retry reproduced the exact same truncation, since temperature is
    // already low for format compliance (see prompt-template.js), so a
    // same-prompt retry mostly regenerates the same reply. Loop instead:
    // each round tells the model (via buildPageCheckPrompt's alreadyCovered)
    // which questions it already answered and asks it to continue, so each
    // attempt is a genuinely different prompt, not a re-roll of the same
    // one. Stops as soon as a round adds nothing new, or after
    // MAX_ROUNDS_PER_CHUNK — a hard cap so a model stuck in a "found
    // nothing, formatted nothing" loop can't run forever on one chunk.
    // Scoped per shot-chunk (see SHOTS_PER_CALL above), not the whole
    // capture: a bad/incomplete round only costs a retry of its own chunk,
    // not every chunk that already succeeded.
    const MAX_ROUNDS_PER_CHUNK = 2;
    const shotChunks = [];
    for (let i = 0; i < shots.length; i += SHOTS_PER_CALL) shotChunks.push(shots.slice(i, i + SHOTS_PER_CALL));

    let allParsed = [];
    let lastReply = "";
    for (const chunk of shotChunks) {
      const parsedBeforeChunk = allParsed.length;
      for (let round = 0; round < MAX_ROUNDS_PER_CHUNK; round++) {
        // Scoped to this chunk's own results, not the global allParsed —
        // each chunk only shows the model a different slice of screenshots,
        // so telling it "you already answered these" for questions from a
        // different chunk (not visible in the current images at all) is a
        // contradictory instruction that broke format compliance entirely
        // from chunk 2 onward. Confirmed live: every chunk after the first
        // came back as an unparseable reply, and only the last chunk's raw
        // text survived (as one undivided fallback blob with no answers).
        const covered = allParsed.slice(parsedBeforeChunk).map((p) => p.question);
        const reply = await withKeepAlive(() => generate(buildPageCheckPrompt(settings.mode, covered), chunk));
        lastReply = reply;
        const parsed = parsePageCheckReply(reply);
        if (!parsed) {
          if (allParsed.length > parsedBeforeChunk) break; // already got something from this chunk
          continue; // total failure with nothing yet from this chunk — worth one more try
        }
        // Require an actual answer, same guard parsePageCheckReply already
        // applies to the single-block case (entry.answer ? [entry] : null).
        // Without this, a question whose block got truncated mid-reply before
        // reaching its "Answer:" line (identify lines only) still counted as
        // "covered" — permanently excluded from every later round's retry,
        // so it was stuck forever with a question/choices but no answer or
        // explanation. Confirmed live: several questions on a real 50-question
        // page rendered with Question/Choices but no reveal button.
        const newOnes = parsed.filter((p) => p.answer && !covered.includes(p.question));
        if (newOnes.length === 0) break; // nothing new this round — model thinks it's done, or stuck
        allParsed.push(...newOnes);
      }
    }

    if (allParsed.length) {
      // One history entry per question — same rendering the side panel
      // already uses for everything else, browsable/collapsible per question
      // instead of one long blob. The corner panel just gets a pointer to
      // the side panel, since it can't show N separate entries itself.
      await pushHistoryMany(tabId, allParsed.map((p) => ({ mode: settings.mode, ...p })));
      await api.tabs.sendMessage(tabId, {
        type: "DELPHI_RESULT",
        mode: settings.mode,
        explanation: `Found ${allParsed.length} question${allParsed.length === 1 ? "" : "s"} — see the side panel for each one.`,
        answer: null,
      });
    } else {
      // Model never followed the ### format across every round — fall back
      // to showing the last raw reply as one blob rather than losing it.
      await report(tabId, "[page check]", { mode: settings.mode, explanation: lastReply, answer: null });
    }
  } catch (err) {
    await report(tabId, "[page check]", { error: err.message });
  } finally {
    await setBusy(tabId, false);
  }
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
    })().catch(async (err) => {
      // Capture/crop failures (tab switched mid-drag, capture quota) would
      // otherwise vanish as unhandled rejections — surface them like any other.
      await report(tabId, "[captured image]", { error: err.message });
    });
    return;
  }

  // From an auto-detect "Explain" click (single or as part of a batch) —
  // responds directly to the sender rather than broadcasting, so content.js
  // can render the result inline next to the specific question and, for a
  // batch, await each one before starting the next.
  if (msg.type === "DELPHI_EXPLAIN_TEXT" && tabId) {
    explainText(msg.text, msg.mode).then((result) => {
      pushHistory(tabId, { ...result, question: snippet(result.question || msg.text) });
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

  if (msg.type === "DELPHI_CHECK_PAGE" && msg.tabId) {
    checkPage(msg.tabId);
    return;
  }

  if (msg.type === "DELPHI_CAPTURE_REGION" && msg.tabId) {
    startCapture(msg.tabId);
    return;
  }

  if (msg.type === "DELPHI_CLEAR_HISTORY" && msg.tabId) {
    api.storage.session.remove(`history:${msg.tabId}`);
    return;
  }

  if (msg.type === "DELPHI_DELETE_HISTORY_ENTRY" && msg.tabId && msg.entryId) {
    (async () => {
      const key = `history:${msg.tabId}`;
      const stored = await api.storage.session.get(key);
      const updated = (stored[key] || []).filter((e) => e.id !== msg.entryId);
      await api.storage.session.set({ [key]: updated });
    })();
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
    api.storage.session.remove(`busy:${tabId}`);
  }
});
api.tabs.onRemoved.addListener((tabId) => {
  api.storage.session.remove(`auto:${tabId}`);
  api.storage.session.remove(`history:${tabId}`);
  api.storage.session.remove(`busy:${tabId}`);
});
