# delphi

A browser extension (Chrome, Brave, Firefox) for self-study: get an explanation of the reasoning behind a practice question — including why the *other* choices are wrong, which is the part most practice tests and mock exams skip — with the answer revealed on click.

**Not for live/proctored exams.** Every answer requires an explicit click from you — nothing auto-answers, ever. The panel and buttons it shows are normal in-page UI elements, not something designed to hide from a screen share or a proctor. It exists to fix a specific self-study problem: mock tests that tell you an answer is wrong without ever saying why.

## How it works

Four ways to hand Delphi a question:

1. **Select text** → right-click → "Explain with Delphi", or `Ctrl+Shift+E`. Works even for text selected inside an iframe.
2. **Capture a region** → right-click anywhere (or on an image) → "Capture region with Delphi", or `Ctrl+Shift+D` → drag a box around a question that isn't selectable text (an image, a canvas-rendered quiz, a PDF viewer). Sent to a vision-capable model — no separate OCR step needed, the model reads the image directly.
3. **Check this page** (side panel button, right-click → "Check this page with Delphi", or `Ctrl+Shift+C`) → screenshots the whole visible tab (no dragging) and asks the model to find and answer *every* question in it, returned as a numbered list. Screenshot-based like region capture, so it works inside iframes too — useful for LMS/knowledge-check pages (e.g. `.jsp`-based courses) where the question content isn't reachable by the DOM-based paths at all. Can take a while on local models since it's reasoning over a whole page, not one question.
4. **Auto-detect** (optional, off by default) → toggle it on in the side panel for the current tab. Delphi scans the page for question-shaped text (a `?` plus multiple `A) B) C)`-style choices) and adds two small buttons next to each one it finds:
   - **Explain** — full reasoning, answer hidden behind reveal, rendered as a card next to that question.
   - **Answer** — skips straight to answer-only for that one question (regardless of the global mode set in Options), rendered as a small compact badge right where the buttons were, since there's no explanation to show.

   Neither goes to the shared corner panel — with several questions on a page, one shared panel cycling through answers would just overwrite itself. A "Delphi watching (N)" badge stays visible the whole time with a one-click stop, and the toggle resets automatically when you navigate to a new page.

**A whole page of questions**: the badge also has **"explain all"** and **"answer all"** buttons — one click runs every currently-detected question through the LLM, one at a time, with a progress indicator ("Explaining 3 of 20…") and a one-click cancel. Sequential rather than parallel on purpose: a local model (on-device Gemini Nano, or CPU-only Ollama) is a single shared resource, so firing off many requests at once wouldn't be faster, just contended — and each real question can take anywhere from several seconds to a couple of minutes depending on your hardware. Still one explicit click fanning out to several calls you asked for, not detection triggering anything on its own.

In every case, Delphi sends the content to an LLM with a prompt asking for reasoning first, then the answer. The answer is hidden behind a "Reveal answer" button by default — read the explanation, think about it, then check yourself.

## Side panel

Click the toolbar icon (Chrome/Brave) to open Delphi as a docked side panel instead of a popup that closes on you — it stays open while you work through a page. It shows the auto-detect toggle and a running history of every answer given on the current tab (newest first), so you can scroll back through earlier questions instead of losing them once a floating card/panel closes. History is per-tab and clears on navigation, same as auto-detect.

The bottom-right floating panel used for selection/region-capture results now shows the same answers, so it starts collapsed to a small "Δ" tab instead of popping open — click it to expand, click it (or the ✕) to collapse again. It still auto-expands once when a new result comes in, so you don't need the side panel open to notice something happened.

**Firefox doesn't have this yet** — its own sidebar mechanism (`sidebar_action`) is a different manifest key than Chrome's `side_panel`, and Chrome errors on unrecognized keys, so it can't just be added alongside without a per-browser build. Firefox's toolbar icon opens Options instead for now.

## LLM providers

Configurable in the extension's Options page:

- **Chrome built-in AI (default)** — Gemini Nano via Chrome's [Prompt API](https://developer.chrome.com/docs/ai/prompt-api). Free, on-device, no API key, no network call once the model is downloaded. Requires a recent Chrome (148+); the on-device model isn't instant on first use — the first `LanguageModel.create()` call triggers a real download, so give it a few minutes before assuming it's broken. Behind two `chrome://flags` on some Chrome builds (`#prompt-api-for-gemini-nano`, `#optimization-guide-on-device-model`) until it's fully rolled out.
- **Ollama (local)** — points at a local `ollama serve` instance. Free, private, works offline, needs Ollama installed with a model pulled.
- **Custom API** — any OpenAI-compatible chat completions endpoint (OpenAI, OpenRouter, Groq, etc.) with a key you supply and that stays in local extension storage.

## Modes

- **Explain first** (default) — reasoning, then a hidden answer you reveal when ready.
- **Answer only** — for a quick self-check pass once you've already reasoned it out yourself.

## Install (unpacked, for development)

**Chrome / Brave**: `chrome://extensions` (Brave: `brave://extensions`) → enable Developer mode → "Load unpacked" → select this directory. Chrome's built-in AI works with zero setup if available; **Brave doesn't ship it** (no Gemini Nano component), so pick Ollama or Custom API in Options there.

**Firefox**: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on" → select `manifest.json` in this directory. **Untested — two manifest keys tried for Firefox compat (`background.scripts`, `sidebar_action`) both broke Chrome loading and were reverted**, so whether the background script even starts on Firefox right now is unconfirmed. Try it and report what actually happens rather than assuming it works. No built-in on-device AI on Firefox either way (no Prompt API), so use Ollama or Custom API.

## Permissions

Delphi requests access to all sites (`host_permissions: ["<all_urls>"]`), which Chrome will show you as "Read and change all your data on all websites" when you install it. This is specifically for the side panel's auto-detect toggle to work reliably no matter which tab is active — Chrome only grants temporary per-tab access when you first open the panel or click the toolbar icon, and that grant doesn't carry over to tabs you switch to afterward while the panel stays open, so a narrower permission left the toggle broken most of the time in practice. It's still not used for anything passive: nothing runs, is scanned, or is sent anywhere until you click something — select text, drag-capture a region, or toggle auto-detect on a specific tab yourself.

## A note on limits

Chrome's built-in AI has no cross-question cap worth worrying about — each explanation gets its own fresh model session, so nothing accumulates across a long "explain all" run. The only real per-question limit is a single question being too long for one session's own context window, which shows up as a plain, readable error on that question's card rather than a cryptic failure. A **custom API** provider is different: a hosted service's rate limit is a genuine shared constraint, so a 429 during a busy "explain all" run shows up as "Rate limited by the API — wait a moment, or switch provider" on that question, and the batch keeps going rather than aborting.

## Status

v0.3 — text selection, region capture (image input, vision-capable providers), opt-in per-tab auto-detect with inline per-question results, and a one-click "explain all" for a page with several questions. Every path still starts from a manual click before any LLM call happens. All three input paths manually verified end-to-end against Chrome's built-in AI (real on-device Gemini Nano) — selection, region-capture crop/vision, and auto-detect's heuristic + click-to-explain button all confirmed working against `manual-test/index.html`.

## Tests

```
node tests/test_prompt_template.js
```
